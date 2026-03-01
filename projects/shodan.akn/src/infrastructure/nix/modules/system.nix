# ┌───────────────────────────────────────────────────────────────────────────┐
# │ System module: shared macOS settings, XDG directory setup, and power      │
# │ management.                                                               │
# └───────────────────────────────────────────────────────────────────────────┘
{
  lib,
  pkgs,
  username,
  xdg,
  ...
}: let
  # Explicit user home path derived from the flake-level username.
  userHome = "/Users/${username}";
in {
  # Homebrew is enabled for macOS userland utilities (e.g., caffeine).
  homebrew = {
    enable = true;
    onActivation.upgrade = true;

    brews = [];
    casks = [
      "caffeine"
      "lm-studio"
    ];
  };

  # Required by nix-darwin to handle backward-incompatible defaults.
  # Set this once for a new installation and keep it stable.
  system.stateVersion = 6;

  # User to which user-scoped options (e.g., Homebrew) are applied.
  system.primaryUser = username;

  # System-wide packages required by the user-level services.
  environment.systemPackages = with pkgs; [];

  # Ensure XDG base directories exist with correct ownership.
  # Also apply power settings during activation:
  #   sleep 0          : system sleep timer in minutes (0 = never sleep)
  #   displaysleep 10  : display sleep timer in minutes (0 = never sleep)
  #   powernap 1       : enable Power Nap (1 = on, 0 = off)
  #   lowpowermode 0   : low power mode (1 = on, 0 = off)
  #   autorestart 1    : auto restart after power loss (1 = on, 0 = off)
  system.activationScripts.extraActivation.text = lib.mkBefore ''
    install -d -m 0755 -o ${username} -g staff ${xdg.config}
    install -d -m 0755 -o ${username} -g staff ${xdg.data}
    install -d -m 0755 -o ${username} -g staff ${xdg.state}
    install -d -m 0755 -o ${username} -g staff ${xdg.log}
    chown -R ${username}:staff ${xdg.config}
    chown -R ${username}:staff ${xdg.data}
    chown -R ${username}:staff ${xdg.state}
    chown -R ${username}:staff ${xdg.log}

    /usr/bin/pmset -a sleep 0
    /usr/bin/pmset -a displaysleep 10
    /usr/bin/pmset -a powernap 1
    /usr/bin/pmset -a lowpowermode 0
    /usr/bin/pmset -a autorestart 1
  '';
}
