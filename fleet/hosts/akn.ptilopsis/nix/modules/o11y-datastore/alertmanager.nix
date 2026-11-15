# oripathy: type=nixpkg pkg=prometheus-alertmanager upstream=github.com/prometheus/alertmanager tagPrefix=v
# ─────────────────────────────────────────────────────────────────────────────
# Alertmanager: Slack notifications and the Dead-Man's-Switch heartbeat.
# ─────────────────────────────────────────────────────────────────────────────
# The Watchdog alert (vmalert) fires permanently; its route pings the
# heartbeat URL every minute. If this Mac stops, the ping stops and
# healthchecks.io raises the alarm.
#
# Both secrets are read from files at runtime (api_url_file / url_file). A
# receiver with no configs is a valid no-op: without secrets, nothing is sent.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, secretPath, o11y, ... }:

let
  slackWebhookUrlFile = secretPath "slack-webhook-url";
  deadmanUrlFile = secretPath "alertmanager-deadman-url";

  config = pkgs.runCommand "alertmanager.yml"
    {
      nativeBuildInputs = [ pkgs.prometheus-alertmanager ];
      config = builtins.toJSON {
        global.resolve_timeout = "5m";
        route = {
          receiver = "default";
          group_by = [ "alertname" "cluster" "namespace" ];
          group_wait = "30s";
          group_interval = "5m";
          repeat_interval = "4h";
          routes = [{
            receiver = "deadman";
            matchers = [ ''alertname="Watchdog"'' ];
            group_wait = "0s";
            group_interval = "1m";
            repeat_interval = "1m";
          }];
        };
        receivers = [
          ({ name = "default"; } // lib.optionalAttrs (slackWebhookUrlFile != null) {
            slack_configs = [{
              api_url_file = slackWebhookUrlFile;
              channel = "#notifications";
              send_resolved = true;
              title = ''{{ template "slack.default.title" . }}'';
              title_link = "https://data.o11y.chezmoi.sh/alerts";
              text = ''{{ template "slack.default.text" . }}'';
              color = ''{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'';
              icon_emoji = ":fire:";
            }];
          })
          ({ name = "deadman"; } // lib.optionalAttrs (deadmanUrlFile != null) {
            webhook_configs = [{
              url_file = deadmanUrlFile;
              send_resolved = false;
            }];
          })
        ];
      };
      passAsFile = [ "config" ];
    }
    ''
      cp "$configPath" $out
      amtool check-config $out
    '';
in
{
  environment.etc."alertmanager/alertmanager.yml".source = config;

  launchd.daemons.o11y-alertmanager = o11y.daemon {
    name = "alertmanager";
    args = [ "${pkgs.prometheus-alertmanager}/bin/alertmanager" ] ++ o11y.flags.alertmanager;
    workdir = "${o11y.stateDir}/alertmanager";
  };
}
