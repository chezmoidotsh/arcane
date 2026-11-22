{
  description = "horn.akn (formerly kazimierz.akn) — Pangolin + Gerbil + Traefik public gateway on OCI Always Free ARM";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # Installer, run from the workstation by `mise run nixos:oci:install` and `nixos:e2e`. Pinned in flake.lock
    # (bump with `nix flake update nixos-anywhere`).
    nixos-anywhere = {
      url = "github:nix-community/nixos-anywhere/b6be7b277b468d55082584441cbef1fed8530eb3";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.disko.follows = "disko";
    };
  };

  outputs = { nixpkgs, disko, sops-nix, nixos-anywhere, ... }:
    let
      # Workstation systems (the tools below run there, the hosts are the nixosConfigurations).
      forAllSystems = nixpkgs.lib.genAttrs [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      mk = system: platform: nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          disko.nixosModules.disko
          sops-nix.nixosModules.sops
          platform
          ./configuration.nix
          ./modules/pangolin.nix
          ./modules/geoip.nix
        ];
      };
    in
    {
      # Production: OCI Always Free A1. nixos-anywhere cannot guess the target, pick the output with `--flake .#<host>-<arch>`.
      nixosConfigurations.horn-akn-aarch64 = mk "aarch64-linux" ./platforms/oci.a1.nix;
      # Test VM (x86_64, legacy BIOS) to rehearse the install procedure.
      nixosConfigurations.horn-akn-x86_64 = mk "x86_64-linux" ./platforms/proxmox.kvm.nix;

      # Tools of the mise tasks (`nix run .#<name>`), versions pinned by flake.lock.
      packages = forAllSystems (system: {
        nixos-anywhere = nixos-anywhere.packages.${system}.default;
        nixos-rebuild = nixpkgs.legacyPackages.${system}.nixos-rebuild;
      });
    };
}
