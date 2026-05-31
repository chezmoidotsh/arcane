{
  description = "lxc-oci-registry — NixOS module library for a Zot + Caddy OCI registry LXC";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";
  inputs.zot.url = "path:../zot";
  inputs.zot.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, zot }:
    {
      # ── NixOS module ────────────────────────────────────────────────────────
      # Import this module in a NixOS configuration to enable the registry stack.
      # Both Zot and Caddy are always active when this module is imported — no
      # enable flags. All options live under services.lxc-oci-registry.*.
      nixosModules.lxc-oci-registry = import ./modules/default.nix;
      nixosModules.default = self.nixosModules.lxc-oci-registry;

      # ── Convenience re-exports of the Zot packages ───────────────────────
      packages =
        let
          forEachSystem =
            f:
            builtins.listToAttrs (
              map (system: {
                name = system;
                value = f system;
              }) [ "x86_64-linux" "aarch64-linux" ]
            );
        in
        forEachSystem (system: {
          inherit (zot.packages.${system}) zot zot-minimal;
          default = zot.packages.${system}.zot;
        });
    };
}
