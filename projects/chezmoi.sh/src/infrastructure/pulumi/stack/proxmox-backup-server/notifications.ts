import * as pbs from "@pulumi/proxmox-backup-server";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Slack notifications (#notifications)
// -----------------------------------------------------------------------------
// Reuses the same Slack "#notifications" incoming webhook already configured
// for observability's Alertmanager
// (projects/chezmoi.sh/src/infrastructure/proxmox/lxc/observability/secrets/
// observability.sops.env) instead of standing up a second channel. That
// webhook URL lives in a SOPS-encrypted file outside this stack's reach --
// this stack runs upstream of any Kubernetes cluster (see ./acme.ts) -- so
// it's copied in by hand as a Pulumi secret; see ./README.md, "Bootstrapping".
//
// `body` is a Slack Block Kit payload, templated with PBS's own notification
// template engine (Handlebars-like -- `severity`, `fields.*`, `timestamp`
// are PBS-supplied template variables, substituted server-side when a
// notification actually fires; see the Proxmox Backup Server docs,
// "Notification Templates"). `severity`/`fields.type` pick the Slack
// attachment's sidebar color; `fields.datastore`/`fields.job-id`, when
// present, render as an extra context line.
//
// PBS's `notifications.cfg` is a line-oriented config file, so a `body`
// value containing raw newlines is rejected by the API ("detected
// unexpected control character") even though the exact same multi-line text
// pastes fine into the PBS web UI -- the UI base64-encodes the field before
// saving. `slackWebhookBody` stays a readable multi-line template in this
// file; only the value actually sent to the resource is base64-encoded.
const slackWebhookBody = `{
  "attachments": [
    {
      "color": "{{#if (eq severity "error")}}
        #E01E5A
      {{else if (eq severity "notice")}}
        #36C5F0
      {{else if (and (eq severity "info") (or (eq fields.type "gc") (eq fields.type "prune") (eq fields.type "sync") (eq fields.type "verification") (eq fields.type "tape-backup")))}}
        #2EB67D
      {{else if (eq fields.type "package-updates")}}
        #ECB22E
      {{else}}
        #36C5F0
      {{/if}}",
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*{{ escape title }}*"
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "{{ escape message }}"
          }
        },

        {{#if (or fields.datastore fields.job-id)}}
        {
          "type": "context",
          "elements": [
            {{#if fields.datastore}}
            {
              "type": "mrkdwn",
              "text": "*Datastore:* \`{{ fields.datastore }}\`"
            }{{#if fields.job-id}},{{/if}}
            {{/if}}
            {{#if fields.job-id}}
            {
              "type": "mrkdwn",
              "text": "*Job:* \`{{ fields.job-id }}\`"
            }
            {{/if}}
          ]
        },
        {{/if}}

        {
          "type": "context",
          "elements": [
            {
              "type": "mrkdwn",
              "text": "<https://pbs.pve.chezmoi.sh:8007|pbs.pve.chezmoi.sh> | <!date^{{ timestamp }}^{date_short_pretty} at {time}|{{ timestamp }}>"
            }
          ]
        }
      ]
    }
  ]
}`;

const slackWebhook = new pbs.WebhookNotification("pbs-notify-slack", {
	name: "slack-notifications",
	url: config.requireSecret("notificationsSlackWebhookUrl"),
	method: "post",
	comment: "Slack #notifications",
	body: Buffer.from(slackWebhookBody).toString("base64"),
});

// Routes every prune/verify/GC notification from the datastore (see
// ./datastore.ts) to Slack. PBS emits `info` on success too, but at this
// volume (one datastore, nightly/weekly jobs) the noise is worth it:
// filtering to `warning`/`error` only risks silently missing a failure that
// was never surfaced.
new pbs.NotificationMatcher(
	"pbs-notify-slack-matcher",
	{
		name: "slack-all-datastore-events",
		comment: "Routes all datastore prune/verify/GC notifications to Slack",
		mode: "all",
		matchSeverities: ["info", "notice", "warning", "error"],
		targets: [slackWebhook.name],
	},
	{ parent: slackWebhook },
);
