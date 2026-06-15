# ─────────────────────────────────────────────────────────────────────────────
# Alertmanager — existential alert routing + the Dead-Man's-Switch
# ─────────────────────────────────────────────────────────────────────────────
# The LXC Alertmanager handles ONLY existential, cluster-independent alerts
# (ADR-013 two-tier model): cluster-absent, Grafana-down, and the Watchdog/DMS.
# It receives alerts exclusively from the LXC's own vmalert (loopback).
#
# Per-cluster page-tier alerts (node/disk/PVC/crash-loop) are routed by each
# cluster's OWN Alertmanager, fed by that cluster's vmalert. The LXC AM is NOT
# in that path — centralizing only the existential layer here keeps paging
# independent of any single cluster outage.
#
# Notification channels
# ──────────────────────
#   default  — Slack incoming webhook (#notifications). Fires on existential
#               page-tier alerts: cluster-absent, Grafana-down, appliance
#               component down, PVE host/guest down.
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
  dataDir = "/persistent/o11y/alertmanager";

  slackWebhookUrl = secrets.slackWebhookUrl or "";
  deadmanUrl = secrets.alertmanagerDeadmanUrl or "";

  # Slack receiver — a receiver with no configs is a valid no-op in Alertmanager
  # so the config stays syntactically valid on a pure build.
  # Nix ''...'' interpolation only prepends leading spaces to the FIRST line of
  # an interpolated variable. These strings are inserted at 4-space indent inside
  # the receiver list, so lines 2+ must already carry those 4 extra spaces.
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
        # Exposed under /alerts/* via Caddy for operator UI/API access. The LXC
        # vmalert reaches it over loopback (127.0.0.1:9093/alerts). Per-cluster
        # vmalerts notify their OWN Alertmanager — NOT this one. The route-prefix
        # applies to ALL paths: API at /alerts/api/v2, metrics at /alerts/metrics
        # — kept consistent in vmalert.nix and the VM self-scrape config.
        "--web.route-prefix=/alerts"
        "--web.external-url=https://o11y.chezmoi.sh/alerts"
        "--log.format=json"
      ];
      ExecReload = "${pkgs.coreutils}/bin/kill -HUP $MAINPID";

      User = "o11y";
      Group = "o11y";
      Type = "simple";

      Restart = "always";
      RestartSec = "5s";
      TimeoutStopSec = "30s";
      StateDirectory = lib.mkForce ""; # directory managed by tmpfiles.d (/persistent/o11y/alertmanager)
      WorkingDirectory = dataDir;

      NoNewPrivileges = true;
      RestrictSUIDSGID = true;
      RestrictRealtime = true;
      LockPersonality = true;
      SystemCallArchitectures = "native";
    };
  };
}
