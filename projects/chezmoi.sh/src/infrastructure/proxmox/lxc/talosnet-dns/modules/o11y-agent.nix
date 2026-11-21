# ─────────────────────────────────────────────────────────────────────────────
# observability agent — ships journald logs and node metrics to o11y
# ─────────────────────────────────────────────────────────────────────────────
# hostsOverride pins data.o11y.chezmoi.sh to its LAN IP as a static
# /etc/hosts entry, so log/metric shipping doesn't depend on BIND already being
# up and serving its own zone (this LXC is its own DNS server, so that
# dependency would otherwise be self-referential at boot).
{ ... }: {
  catalog.o11yAgent = {
    enable = true;

    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";

    logs.parsers = [ "named" ];
    metrics.enable = true;
    hostsOverride = {
      "10.0.0.32" = [ "data.o11y.chezmoi.sh" ];
    };
  };
}
