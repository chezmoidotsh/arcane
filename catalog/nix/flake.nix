{
  description = "Arcane Nix catalog — shared NixOS modules for LXC appliances and infrastructure";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs, ... }:
    let
      system = "x86_64-linux";
    in
    {
      nixosModules.lxcAgent = ./modules/lxc-o11y-agent;
      nixosModules.staticNetwork = ./modules/lxc-static-network;
    };
}
