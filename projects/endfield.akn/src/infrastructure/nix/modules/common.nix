# ┌───────────────────────────────────────────────────────────────────────────┐
# │ common.nix — shared baseline for all machines                             │
# │                                                                           │
# │ Responsibilities:                                                         │
# │   · system.stateVersion / system.primaryUser                             │
# │   · XDG base directories (created + chowned on each activation)          │
# │   · Power management (pmset: no sleep, autorestart, Power Nap)           │
# │                                                                           │
# │ Produces no launchd agents and no user-visible endpoints.                 │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, username
, xdg
, ...
}:
{
  # Required by nix-darwin to handle backward-incompatible defaults.
  # Set this once for a new installation and keep it stable.
  system.stateVersion = 6;

  # User to which user-scoped options (e.g., Homebrew) are applied.
  system.primaryUser = username;

  # Ensure XDG base directories exist with correct ownership on every activation.
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
