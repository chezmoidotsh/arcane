{
  description = "kazimierz.akn — Pangolin + Gerbil + Traefik public gateway on OCI Always Free ARM";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-26.05";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, disko, sops-nix, ... }:
    let
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
      nixosConfigurations.kazimierz-akn-aarch64 = mk "aarch64-linux" ./platforms/oci.a1.nix;
      # Test VM (x86_64, legacy BIOS) to rehearse the install procedure.
      nixosConfigurations.kazimierz-akn-x86_64 = mk "x86_64-linux" ./platforms/proxmox.kvm.nix;
    };
}
