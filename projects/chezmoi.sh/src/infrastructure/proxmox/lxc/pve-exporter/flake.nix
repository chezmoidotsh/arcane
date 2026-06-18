{
  description = "pve-exporter — Proxmox VE monitoring LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # All-in-one flake: NixOS modules + site config.
  #
  # A single unprivileged LXC running:
  #
  #   prometheus-pve-exporter  — scrape PVE API → Prometheus metrics  :9221 (loopback)
  #   vector                   — ship metrics + logs to o11y appliance (catalog.lxcAgent)
  #
  # No public services: the LXC only pushes outbound (metrics + logs). No Caddy,
  # no TLS termination, no ingress.
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   Pure (no secrets — exporter fails to authenticate against PVE):
  #       nix build
  #
  #   With secrets baked in (recommended):
  #       mise run lxc:build
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  inputs.arcane-catalog.url = "path:../../../../../../../catalog/nix";
  inputs.arcane-catalog.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators, arcane-catalog }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # Appliance image version — CalVer (YYYY.MM.DD), used only to name the
      # Proxmox template (pve-exporter.<date>-amd64.tar.xz). Component
      # versions track the nixpkgs pin. Bump this date before every
      # `mise run lxc:build`; append -N for multiple builds on the same day.
      version = "2026.06.18";

      # -----------------------------------------------------------------------
      # Build-time secrets, forwarded to the modules via _module.args.
      #
      # All are read from the environment so the build stays pure when they are
      # empty (CI smoke build) and reproducible when `mise run lxc:build` sources
      # them from the SOPS-encrypted files under ./secrets/.
      #
      #   pveHost        — PVE API host address (e.g. 10.0.0.254)            (operator-provided)
      #   pveTokenValue  — PVE API token secret (baked into image)            (operator-provided)
      # -----------------------------------------------------------------------
      pveHost = builtins.getEnv "PVE_HOST";
      pveTokenValue = builtins.getEnv "PVE_TOKEN_VALUE";
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          arcane-catalog.nixosModules.lxcAgent
          ./modules
          ./configuration.nix
          { _module.args = { inherit pveHost pveTokenValue; }; }
        ];
      };
    };
}
