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
    xdg = {
      config = "/Users/${username}/.config";
      share = "/Users/${username}/.local/share";
      state = "/Users/${username}/.local/state";
      log = "/Users/${username}/.local/state/log";
    };
  in {
    # ┌───────────────────────────────────────────────────────────────────────────┐
    # │ <darwinConfigurations."shodan">: AI Stack macOS configuration             │
    # │ Builds user-level launchd agents (Caddy, Kokoro, LiteLLM) and sets up     │
    # │ XDG base directories.                                                     │
    # │                                                                           │
    # │ @sh.chezmoi.app.type: config                                              │
    # └───────────────────────────────────────────────────────────────────────────┘
    darwinConfigurations."shodan" = darwin.lib.darwinSystem {
      inherit system;
      # Pass the username and XDG paths into modules for user-level path configuration.
      specialArgs = {inherit username xdg;};
      # Service modules are separated for clarity and maintainability.
      modules = [
        ./modules/system.nix
        ./modules/caddy.nix
        ./modules/kokoro.nix
        ./modules/litellm.nix
      ];
    };
  };
}
