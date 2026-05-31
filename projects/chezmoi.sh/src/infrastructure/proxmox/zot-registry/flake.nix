{
  description = "oci.chezmoi.sh — Zot OCI registry LXC image (Proxmox)";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";
  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  inputs.lxc-oci-registry.url = "path:../../../../../../catalog/flakes/chezmoi.sh/lxc-oci-registry";
  inputs.lxc-oci-registry.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators, lxc-oci-registry }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      zotPackage = lxc-oci-registry.packages.${system}.zot;

      # Read from the build environment when --secrets is passed to nix:build:lxc.
      # Returns "" in pure mode (no secrets baked in); non-empty only with --impure.
      cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
    in
    {
      # ── LXC image ────────────────────────────────────────────────────────────
      # Build: nix:build:lxc projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry
      # Output: result  (a .tar.xz Proxmox LXC template)
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          lxc-oci-registry.nixosModules.lxc-oci-registry
          ./configuration.nix
          { _module.args = { inherit zotPackage cloudflareToken; }; }
        ];
      };
    };
}
