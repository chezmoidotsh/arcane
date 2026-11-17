# ─────────────────────────────────────────────────────────────────────────────
# observability agent — ships journald logs and node metrics to o11y
# ─────────────────────────────────────────────────────────────────────────────
# hostsOverride pins data.o11y.chezmoi.sh to the Mac Studio akn.ptilopsis on
# VLAN 5 (10.0.0.32, reached from talosnet through the pve-01 SNAT) as a static
# /etc/hosts entry. BIND serves the same address, but the pin is kept, like on
# the other LXCs, so shipping doesn't depend on this very resolver being up.
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
