{
  description = "pve-exporter — Proxmox VE monitoring LXC image";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      pveHost = builtins.getEnv "PVE_HOST";
      pveTokenValue = builtins.getEnv "PVE_TOKEN_VALUE";
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          ./modules
          ./configuration.nix
          { _module.args = { inherit pveHost pveTokenValue; }; }
        ];
      };
    };
}
