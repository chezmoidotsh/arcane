{
  description = "talosnet-dns — split-horizon DNS resolver for the talosnet SDN subnet (Proxmox)";

  # ---------------------------------------------------------------------------
  # Split-horizon DNS resolver for the talosnet Proxmox SDN subnet (10.128.0.0/24).
  #
  # BIND is authoritative for static talosnet-only records (omni/oci/o11y/nas)
  # and for talosnet.chezmoi.sh, updatable at runtime via external-dns
  # (RFC2136/TSIG) — everything else forwards upstream. Needed because
  # talosnet has SNAT egress: routing traffic to hosts with Proxmox firewall
  # enabled crosses two conntrack zones and gets stuck in SYN_RECV. This LXC
  # resolves affected hostnames to their talosnet-side IPs instead, keeping
  # traffic local.
  #
  # vector ships logs + metrics to o11y.
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   Pure (no secrets — RFC2136 dynamic updates rejected until a TSIG key
  #   is provided):
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
      # Proxmox template (talosnet-dns.<date>-amd64.tar.xz). Component
      # versions track the nixpkgs pin. Bump this date before every
      # `mise run lxc:build`; append -N for multiple builds on the same day.
      version = "2026.07.27";

      # bindTsigSecret — HMAC-SHA256 TSIG key securing RFC2136 dynamic
      # updates to talosnet.chezmoi.sh (bind.sops.env). Read from the
      # environment so the build stays pure when empty (CI smoke build).
      bindTsigSecret = builtins.getEnv "BIND_TSIG_SECRET";
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          arcane-catalog.nixosModules.lxcAgent
          arcane-catalog.nixosModules.staticNetwork
          ./modules
          ./configuration.nix
          { _module.args = { inherit bindTsigSecret; }; }
        ];
      };
    };
}
