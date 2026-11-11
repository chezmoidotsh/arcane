{
  description = "omni.chezmoi.sh — Omni Talos management platform LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # All-in-one flake: NixOS modules + site config → Proxmox-importable .tar.xz.
  #
  # Omni is built from source by the catalog package (pkgs/by-name/om/omni).
  # Module library lives in:
  #   ./modules/omni.nix, ./modules/dex.nix — Omni service + Dex OIDC + PKI init
  #   catalog/nix/modules/o11y-agent — catalog.o11yAgent (journal → o11y)
  #   ./modules/                     — Caddy HTTPS termination + LXC hardening + o11y
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   Pure (no secrets — TLS issuance and Dex login fail until secrets are
  #   provided manually after first boot):
  #       nix build
  #
  #   With secrets baked in (recommended):
  #       mise run lxc:build
  #
  # Host prerequisites (the LXC kernel is the Proxmox kernel — load on the
  # host once, before the LXC starts SideroLink):
  #   echo wireguard >> /etc/modules-load.d/omni-lxc.conf
  #   modprobe wireguard
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.arcane.url = "path:../../../../../../../catalog/nix";
  inputs.arcane.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, arcane }:
    let
      system = "x86_64-linux";

      # Appliance image version — CalVer (YYYY.MM.DD), used to name the
      # Proxmox template (omni.<date>-amd64.tar.xz). The Omni component
      # version itself is tracked in catalog/nix/pkgs/by-name/om/omni/package.nix
      # and bumped by Renovate. Bump this date before every `mise run
      # lxc:build`; append -N for multiple builds on the same day.
      version = "2026.11.11-1";

      # -----------------------------------------------------------------------
      # Build-time secrets, forwarded to the modules via _module.args.
      #
      # Both are read from the environment so the build stays pure when they
      # are empty (CI smoke build) and reproducible when `mise run lxc:build`
      # sources them from the SOPS-encrypted files under ./secrets/.
      #
      #   cloudflareToken         — Caddy ACME DNS-01 (caddy.sops.env)
      #   dexAdminPasswordHash    — bcrypt hash for the Dex admin user
      #                             (omni.sops.env)
      # -----------------------------------------------------------------------
      cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
      dexAdminPasswordHash = builtins.getEnv "DEX_ADMIN_PASSWORD_HASH";
    in
    {
      nixosConfigurations.omni = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          # allowUnfree is required because Omni is BSL-1.1, which nixpkgs
          # classifies as unfree.
          { nixpkgs.config.allowUnfree = true; }
          { services.omni.package = arcane.packages.${system}.omni; }
          arcane.nixosModules.o11yAgent
          arcane.nixosModules.staticNetwork
          ./modules
          ./configuration.nix
          { _module.args = { inherit cloudflareToken dexAdminPasswordHash; }; }
        ];
      };

      # `nixos-rebuild build-image --image-variant lxc` builds this same
      # attribute; exposed as the default package so `nix build` and the
      # existing `mise run lxc:build` / `scripts/nix:build:lxc` pipeline
      # (which expects a `tarball/*.tar.xz` output) keep working unchanged.
      packages.${system}.default =
        self.nixosConfigurations.omni.config.system.build.images.lxc;
    };
}
