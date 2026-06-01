{
  description = "lxc-oci-registry — NixOS module library for an LXC-hosted Zot OCI registry behind Caddy";

  # ---------------------------------------------------------------------------
  # Module library only: this flake exposes NixOS modules and a package
  # re-export. It does not build an LXC image — that belongs to a deployable
  # flake (see projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/).
  #
  # Why three modules instead of one?
  #
  #   * zot.nix       — registry process (always active when the bundle is
  #                     imported; configures users, systemd unit, settings).
  #   * caddy.nix     — TLS-terminating reverse proxy with optional DNS-01
  #                     ACME via the cloudflare plugin.
  #   * hardening.nix — opinionated NixOS + systemd hardening profile for an
  #                     LXC running this single workload. Disabled by default
  #                     so the modules remain reusable outside our homelab.
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";
  inputs.zot.url = "path:../zot";
  inputs.zot.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, zot }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem =
        f: builtins.listToAttrs (map (s: { name = s; value = f s; }) supportedSystems);
    in
    {
      # -----------------------------------------------------------------------
      # NixOS modules
      # -----------------------------------------------------------------------
      # Import `nixosModules.lxc-oci-registry` to enable the full stack.
      # Or import individual modules (zot, caddy, hardening) for finer control.
      #
      # The bundle imports zot + caddy unconditionally. `hardening` is
      # included but every hardening switch is opt-in (default: false), so
      # importing the bundle does not break existing configurations.
      nixosModules = {
        zot = import ./modules/zot.nix;
        caddy = import ./modules/caddy.nix;
        hardening = import ./modules/hardening.nix;

        lxc-oci-registry = import ./modules/default.nix;
        default = import ./modules/default.nix;
      };

      # -----------------------------------------------------------------------
      # Package re-exports (so consumers don't need both this and the zot flake)
      # -----------------------------------------------------------------------
      packages = forEachSystem (system: {
        inherit (zot.packages.${system}) zot zot-minimal;
        default = zot.packages.${system}.zot;
      });
    };
}
