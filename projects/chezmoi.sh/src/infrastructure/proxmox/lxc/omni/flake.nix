{
  description = "omni.chezmoi.sh — Omni Talos management platform LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # All-in-one flake: NixOS modules + site config → Proxmox-importable .tar.xz.
  #
  # The Omni binary is fetched from the upstream GitHub release (statically
  # linked Go binary, no patchelf needed). Module library lives in:
  #   catalog/nix/siderolabs/omni/   — Omni service + Dex OIDC + PKI init
  #   catalog/nix/modules/lxc-o11y-agent — catalog.lxcAgent (journal → o11y)
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

  inputs.arcane-catalog.url = "path:../../../../../../../catalog/nix";
  inputs.arcane-catalog.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, arcane-catalog }:
    let
      system = "x86_64-linux";

      # Appliance image version — CalVer (YYYY.MM.DD), used to name the
      # Proxmox template (omni.<date>-amd64.tar.xz). The Omni component
      # version itself is tracked in catalog/nix/siderolabs/omni/omni.nix
      # and bumped by Renovate. Bump this date before every `mise run
      # lxc:build`; append -N for multiple builds on the same day.
      version = "2026.08.04";

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
          arcane-catalog.nixosModules.lxcAgent
          arcane-catalog.nixosModules.staticNetwork
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
