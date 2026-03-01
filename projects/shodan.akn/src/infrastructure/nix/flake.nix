{
  description = "Shodan: MacOS based AI Platform";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    darwin.url = "github:lnl7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = {darwin, ...}: let
    # Target platform (Apple Silicon).
    system = "aarch64-darwin";

    # Primary macOS account used for user-level services and XDG paths.
    username = "shodan";

    # XDG directory mappings exposed to modules via `specialArgs`.
    # All variables below are standard XDG locations or useful aliases.
    #
    # English descriptions:
    # - config: XDG_CONFIG_HOME — user-specific configuration files (default: ~/.config).
    #           Use for YAML/INI/TOML/etc application configs.
    # - data:   XDG_DATA_HOME   — user-specific persistent data (default: ~/.local/share).
    #           Use for application data, downloaded assets, persistent DBs (recommended
    #           location for SQLite DBs and models).
    # - state:  XDG_STATE_HOME  — user-specific state files (default: ~/.local/state).
    #           Use for machine-specific state that shouldn't be synced between machines
    #           (logs, transient application state).
    # - cache:  XDG_CACHE_HOME  — non-essential, re-creatable cache files (default: ~/.cache).
    #           Use for caches, temporary downloads, build caches.
    # - run:    XDG_RUNTIME_DIR — runtime directory for ephemeral files (sockets, pidfiles).
    #           Often emptied on reboot; not suitable for persistent DBs.
    # - log:    Derived alias that points into state for storing logs (convenience).
    # - config_dirs/data_dirs: system-wide read-only locations for config/data.
    #
    xdg = {
      config      = "/Users/${username}/.config";                   # XDG_CONFIG_HOME
      data        = "/Users/${username}/.local/share";              # XDG_DATA_HOME (recommended for DBs)
      state       = "/Users/${username}/.local/state";              # XDG_STATE_HOME
      cache       = "/Users/${username}/.cache";                    # XDG_CACHE_HOME
      # XDG_RUNTIME_DIR is typically /run/user/<uid>. We represent it here as an alias.
      # Note: this string contains a shell-style uid lookup; it is informational and
      # can be adapted to your environment if you prefer a concrete user id.
      run         = "/run/user/$(id -u ${username})";               # XDG_RUNTIME_DIR (ephemeral)
      log         = "/Users/${username}/.local/state/log";          # Derived log directory (convenience)
      # System-wide configuration and data directories (read-only precedence order).
      config_dirs = [ "/etc/xdg" ];                                 # XDG_CONFIG_DIRS
      data_dirs   = [ "/usr/local/share" "/usr/share" ];            # XDG_DATA_DIRS
    };
  in {
    # ┌───────────────────────────────────────────────────────────────────────────┐
    # │ <darwinConfigurations."shodan">: AI Stack macOS configuration             │
    # │ Builds user-level launchd agents (Caddy, Kokoro) and sets up             │
    # │ XDG base directories.                                                     │
    # │                                                                           │
    # │ @sh.chezmoi.app.type: config                                              │
    # └───────────────────────────────────────────────────────────────────────────┘
    darwinConfigurations."shodan" = darwin.lib.darwinSystem {
      inherit system;
      # Pass the username and XDG paths into modules for user-level path configuration.
      specialArgs = { inherit username xdg; };
      # Service modules are separated for clarity and maintainability.
      modules = [
        ./modules/system.nix
        ./modules/caddy.nix
        ./modules/kokoro.nix
      ];
    };
  };
}
