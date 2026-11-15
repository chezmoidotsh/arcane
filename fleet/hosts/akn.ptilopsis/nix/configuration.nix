# ─────────────────────────────────────────────────────────────────────────────
# ptilopsis.akn — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Mac Studio (Apple Silicon) run as a headless server. This file holds what is
# specific to the machine: its identity, the values the stack is sized with and
# the host agent's settings. How it all works is in ./modules:
#
#   modules/server.nix          sleep, power, macOS updates, firewall, no SSH
#   modules/secrets.nix         sops-nix and the secrets' owners
#   modules/o11y-datastore/     the observability stack (launchd daemons)
# ─────────────────────────────────────────────────────────────────────────────
{ ... }:

{
  imports = [ ./modules/server.nix ./modules/secrets.nix ./modules/o11y-datastore ];

  system.stateVersion = 6;
  nixpkgs.hostPlatform = "aarch64-darwin";

  # otelcol-contrib 0.155.0 does not build with Go 1.27 (github.com/cockroachdb/swiss
  # links into runtime internals that changed): build the collectors with Go 1.26
  # until nixpkgs-unstable fixes it.
  nixpkgs.overlays = [
    (final: prev: {
      opentelemetry-collector-releases = prev.opentelemetry-collector-releases.override {
        buildGoModule = final.buildGo126Module;
        go = final.go_1_26;
      };
    })
  ];

  networking.hostName = "ptilopsis";
  networking.computerName = "ptilopsis.akn";

  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # The macOS admin account must be created with this short name during setup.
  system.primaryUser = "ptilopsis";
  users.users.ptilopsis = {
    name = "ptilopsis";
    home = "/Users/ptilopsis";
  };

  # ── Observability stack (ADR-022) ──────────────────────────────────────────
  services.o11yDatastore = {
    # A dedicated APFS volume with a 250 GB quota (a limit, not a reservation),
    # created at install time on the right disk, never the system one.
    dataDir = "/var/lib/o11y-datastore";
    retention = { metrics = "18M"; logs = "30d"; traces = "2d"; }; # <n>d, <n>w or <n>M
    allowedSources = [ "10.0.0.0/22" ]; # the homelab LAN
  };

  # ── Host agent ─────────────────────────────────────────────────────────────
  # Pushes to the stack's public name, data.o11y.chezmoi.sh.
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";
    metrics.enable = true;
    logs.files = [{ path = "/var/log/o11y-agent/otelcol-contrib.log"; serviceName = "o11y-agent"; }];
  };
}
