{
  description = "Arcane Nix catalog — shared NixOS modules for LXC appliances and infrastructure";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs, ... }:
    let
      # The packages only target Linux; build them from another host with
      # `nix build .#packages.x86_64-linux.<name>` and a Linux builder.
      systems = [ "x86_64-linux" "aarch64-linux" ];

      # Omni is BSL-1.1, which nixpkgs classifies as unfree.
      pkgsFor = system: import nixpkgs { inherit system; config.allowUnfree = true; };
    in
    {
      nixosModules.lxcAgent = ./modules/lxc-o11y-agent;
      nixosModules.staticNetwork = ./modules/lxc-static-network;

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
