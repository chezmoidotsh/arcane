{
  description = "signoz.chezmoi.sh — SigNoz observability LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # SigNoz is not in nixpkgs: its packages (built from source) live in
  # catalog/nix/pkgs/by-name/ in nixpkgs layout, ready to be upstreamed.
  # ClickHouse (store + embedded keeper) comes from nixpkgs. The unit layout
  # mirrors Foundry's `systemd/binary` flavor (SigNoz's own bare-metal install).
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   mise run lxc:build
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.arcane.url = "path:../../../../../../../catalog/nix";
  inputs.arcane.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, arcane }:
    let
      system = "x86_64-linux";

      # Image version — CalVer (YYYY.MM.DD), used only to name the Proxmox
      # template (signoz.<date>-amd64.tar.xz). Bump before every
      # `mise run lxc:build`; append -N for multiple builds on the same day.
      imageVersion = "2026.11.09";

      # oripathy: type=nixpkg pkg=clickhouse upstream=github.com/ClickHouse/ClickHouse
      catalogPackages = arcane.packages.${system};

      cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
    in
    {
      nixosConfigurations.signoz = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          arcane.nixosModules.lxcAgent
          arcane.nixosModules.staticNetwork
          ./modules
          ./configuration.nix
          {
            _module.args = {
              signozPackage = catalogPackages.signoz;
              collectorPackage = catalogPackages.signoz-otel-collector;
              inherit cloudflareToken;
            };
          }
        ];
      };

      # Same contract as the other appliances: `nix build` and
      # `mise run lxc:build` expect a `tarball/*.tar.xz` output.
      packages.${system}.default =
        self.nixosConfigurations.signoz.config.system.build.images.lxc;
    };
}
