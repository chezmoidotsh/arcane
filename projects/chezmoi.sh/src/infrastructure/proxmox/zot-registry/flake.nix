{
  description = "oci.chezmoi.sh — Zot OCI registry LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # Two-layer architecture:
  #
  #   1. catalog/flakes/chezmoi.sh/zot/  — binary packaging only (stays in
  #      the catalog because other flakes may want just the Zot package).
  #   2. THIS DIRECTORY                  — NixOS modules + site config that
  #      build the actual Proxmox LXC image. The module library (zot, caddy,
  #      hardening) lives alongside the deployment in ./modules/ — there is
  #      no separate reusable layer because this is a single-site deployment.
  #
  # Build modes (both produce a Proxmox-importable .tar.xz):
  #
  #   Pure (no TLS at first boot):
  #       mise run lxc:build
  #
  #   With Cloudflare token baked in (TLS works at first boot):
  #       export CLOUDFLARE_API_TOKEN=…
  #       mise run lxc:build --impure
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  # Zot binary. The catalog flake handles version pinning and package
  # variants (zot vs zot-minimal); we always want the full variant here.
  inputs.zot.url = "path:../../../../../../catalog/flakes/chezmoi.sh/zot";
  inputs.zot.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators, zot }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      zotPackage = zot.packages.${system}.zot;
      cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          ./modules
          ./configuration.nix
          { _module.args = { inherit zotPackage cloudflareToken; }; }
        ];
      };
    };
}
