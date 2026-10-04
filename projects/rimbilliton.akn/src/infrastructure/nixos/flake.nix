{
  description = "rimbilliton.akn — Minecraft server (Crafty + SSO + B2 backups) on OCI Always Free ARM";

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

  outputs = { nixpkgs, disko, sops-nix, ... }: {
    nixosConfigurations.rimbilliton = nixpkgs.lib.nixosSystem {
      system = "aarch64-linux";
      modules = [
        disko.nixosModules.disko
        sops-nix.nixosModules.sops
        ./disko.nix
        ./configuration.nix
        ./modules/crafty.nix
        ./modules/sso.nix
        ./modules/backup.nix
      ];
    };
  };
}
