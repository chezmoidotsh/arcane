{
  description = "AI Stack: Caddy, LiteLLM, Kokoro (user-level)";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    darwin.url = "github:lnl7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = {darwin, ...}: let
    # Primary macOS account used for user-level services and XDG paths.
    username = "shodan";
    # Target platform (Apple Silicon).
    system = "aarch64-darwin";
  in {
    darwinConfigurations."shodan" = darwin.lib.darwinSystem {
      inherit system;
      # Pass the username into modules for user-level path configuration.
      specialArgs = {inherit username;};
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
