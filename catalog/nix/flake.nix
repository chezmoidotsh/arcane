{
  description = "Arcane Nix catalog — shared NixOS and nix-darwin modules for appliances and infrastructure";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs, ... }:
    let
      # Every package builds on all of these systems (see each README).
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];

      # Omni is BSL-1.1, which nixpkgs classifies as unfree.
      pkgsFor = system: import nixpkgs { inherit system; config.allowUnfree = true; };
    in
    {
      nixosModules.o11yAgent = ./modules/o11y-agent;
      nixosModules.staticNetwork = ./modules/lxc-static-network;

      # nix-darwin modules (launchd daemons), used by the Mac hosts.
      darwinModules.o11yAgent = ./modules/o11y-agent/darwin.nix;
      darwinModules.logTrim = ./modules/darwin-log-trim;

      # Packages missing from nixpkgs, written in nixpkgs' `pkgs/by-name`
      # layout (callPackage-able, no flake-specific code) so they can be
      # upstreamed as-is.
      packages = nixpkgs.lib.genAttrs systems (system:
        let pkgs = pkgsFor system; in {
          omni = pkgs.callPackage ./pkgs/by-name/om/omni/package.nix { };
          omni-infra-provider-proxmox = pkgs.callPackage ./pkgs/by-name/om/omni-infra-provider-proxmox/package.nix { };
        });
    };
}
