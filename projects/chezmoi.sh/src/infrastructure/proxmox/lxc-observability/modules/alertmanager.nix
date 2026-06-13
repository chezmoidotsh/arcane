# ─────────────────────────────────────────────────────────────────────────────
# Alertmanager — existential alert routing + the Dead-Man's-Switch
# ─────────────────────────────────────────────────────────────────────────────
# The central, cluster-independent notification hub (ADR-013). It receives alerts
# from BOTH the LXC's existential vmalert AND every cluster's vmalert (which
# notifies it through Caddy under /alerts), routes on the `cluster` label,
# and runs the Dead-Man's-Switch. Centralizing notification here keeps paging
# independent of any single cluster — more resilient than alerting inside amiya.
#
# Notification channels
# ──────────────────────
#   default  — Slack incoming webhook (#notifications). Fires on any page-tier
#               alert (severity=page) including cluster-absent, Grafana-down,
#               node/disk/PVC events sent by per-cluster vmalert.
#   deadman  — HTTP webhook pinging an external heartbeat service (e.g.
#               healthchecks.io). Always fires the Watchdog alert on a 1-minute
#               cadence. If the heartbeat stops, the external service pages —
#               catching appliance/vmalert/Alertmanager death independently.
#
# Build args:
#   secrets.slackWebhookUrl    — Slack incoming webhook URL. When empty (pure
#     build) the Slack receiver has no configs; Alertmanager still starts but
#     page alerts are silently dropped until the secret is present.
#   secrets.alertmanagerDeadmanUrl — External heartbeat URL. When empty the
#     deadman receiver is a no-op; the Dead-Man's-Switch fires but is unheard.
#
# Binds 127.0.0.1:9093 (loopback only); egress is allowed for notifications
# and heartbeats. Served at /alerts/* via Caddy (see caddy.nix).
# ─────────────────────────────────────────────────────────────────────────────
{ lib, pkgs, secrets ? { }, ... }:

let
  listenAddr = "127.0.0.1:9093";
  dataDir = "/var/lib/victoria/alertmanager";

  slackWebhookUrl = secrets.slackWebhookUrl or "";
  deadmanUrl = secrets.alertmanagerDeadmanUrl or "";

  # Slack receiver — a receiver with no configs is a valid no-op in Alertmanager
  # so the config stays syntactically valid on a pure build.
  slackConfig = lib.optionalString (slackWebhookUrl != "") ''
    slack_configs:
      - api_url: '${slackWebhookUrl}'
        channel: '#notifications'
        send_resolved: true
        title: '{{ template "slack.default.title" . }}'
        title_link: 'https://o11y.chezmoi.sh/alerts'
        text: '{{ template "slack.default.text" . }}'
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
        icon_emoji: ':fire:'
  '';

  deadmanWebhook = lib.optionalString (deadmanUrl != "") ''
    webhook_configs:
      - url: '${deadmanUrl}'
        send_resolved: false
  '';

  configFile = pkgs.writeText "alertmanager.yml" ''
    global:
      resolve_timeout: 5m

    route:
      receiver: default
      group_by: ["alertname", "cluster", "namespace"]
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      routes:
        # Dead-Man's-Switch — heartbeat the external snitch every minute.
        - receiver: deadman
          matchers:
            - alertname="Watchdog"
          group_wait: 0s
          group_interval: 1m
          repeat_interval: 1m

    receivers:
      - name: default
        ${slackConfig}
      - name: deadman
        ${deadmanWebhook}
  '';
in
{
  environment.etc."alertmanager/alertmanager.yml".source = configFile;

  systemd.services.alertmanager = {
    description = "Alertmanager — routing / dedup / deadman switch";
    documentation = [ "https://prometheus.io/docs/alerting/latest/alertmanager/" ];
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    serviceConfig = {
      ExecStart = lib.concatStringsSep " " [
        "${pkgs.prometheus-alertmanager}/bin/alertmanager"
        "--config.file=/etc/alertmanager/alertmanager.yml"
        "--storage.path=${dataDir}"
        "--web.listen-address=${listenAddr}"
        # Served under /alerts/* so per-cluster vmalert instances can notify
        # it through Caddy (the only exposed surface). The route-prefix applies to
        # ALL paths: API at /alerts/api/v2, metrics at /alerts/metrics —
        # kept consistent in vmalert.nix and the VM self-scrape config.
        "--web.route-prefix=/alerts"
        "--web.external-url=https://o11y.chezmoi.sh/alerts"
        "--log.format=json"
      ];
      ExecReload = "${pkgs.coreutils}/bin/kill -HUP $MAINPID";

      User = "victoria";
      Group = "victoria";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      WorkingDirectory = dataDir;

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
    };
  };
}
