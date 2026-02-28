# System module: shared macOS settings, XDG directory setup, and power management.
{
  lib,
  pkgs,
  username,
  ...
}: let
  # Explicit user home path derived from the flake-level username.
  userHome = "/Users/${username}";
in {
  # Homebrew is enabled for macOS userland utilities (e.g., caffeine).
  homebrew = {
    enable = true;
    onActivation.upgrade = true;
  };

  # Required by nix-darwin to handle backward-incompatible defaults.
  # Set this once for a new installation and keep it stable.
  system.stateVersion = 6;

  # User to which user-scoped options (e.g., Homebrew) are applied.
  system.primaryUser = username;

  # System-wide packages required by the user-level services.
  environment.systemPackages = with pkgs; [];

  # Ensure XDG base directories exist with correct ownership.
  # Also apply power settings during activation.
  system.activationScripts.extraActivation.text = lib.mkBefore ''
    install -d -m 0755 -o ${username} -g staff ${userHome}/.config
    install -d -m 0755 -o ${username} -g staff ${userHome}/.local
    install -d -m 0755 -o ${username} -g staff ${userHome}/.local/share
    install -d -m 0755 -o ${username} -g staff ${userHome}/.local/state
    install -d -m 0755 -o ${username} -g staff ${userHome}/.local/state/log
    chown -R ${username}:staff ${userHome}/.config
    chown -R ${username}:staff ${userHome}/.local

    /usr/bin/pmset -a sleep 0
    /usr/bin/pmset -a displaysleep 10
    /usr/bin/pmset -a powernap 1
    /usr/bin/pmset -a lowpowermode 0
    /usr/bin/pmset -a autorestart 1
  '';
}
