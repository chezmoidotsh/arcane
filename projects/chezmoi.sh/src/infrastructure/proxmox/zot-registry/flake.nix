{
  description = "oci.chezmoi.sh — Zot OCI registry LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # Three-layer architecture (see ../../../../../../AGENTS.md):
  #
  #   1. catalog/flakes/chezmoi.sh/zot/           — binary packaging only
  #   2. catalog/flakes/chezmoi.sh/lxc-oci-registry/ — NixOS module library
  #   3. THIS FLAKE                                — site-specific deployment
  #
  # This flake's only job is to combine the module library with the
  # site config in `configuration.nix` and produce a Proxmox LXC tarball
  # via `nixos-generators`.
  #
  # Two build modes are supported through the same flake:
  #
  #   • Pure build (no secrets baked in)
  #       nix:build:lxc <flake-dir>
  #
  #   • Build with the Cloudflare token baked in (TLS works at first boot)
  #       export CLOUDFLARE_API_TOKEN=…
  #       nix:build:lxc --impure <flake-dir>
  #
  #   The `--impure` flag is what allows `builtins.getEnv` below to read
  #   the token. The token is then forwarded into `configuration.nix` via
  #   `_module.args`, where it is materialised as /etc/caddy/secrets.
  # ---------------------------------------------------------------------------

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

      # Zot package to run inside the LXC. Pulled from the catalog flake so
      # the hash bumps stay in one place.
      zotPackage = lxc-oci-registry.packages.${system}.zot;

      # `builtins.getEnv` returns "" in pure-eval mode. The caller drives
      # impurity via `nix:build:lxc --impure` (see ./README.md), which is
      # the *only* way the token reaches the build sandbox.
      cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
    in
    {
      # ─── LXC image ───────────────────────────────────────────────────────
      # Output: ./result   (Proxmox-importable .tar.xz)
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
