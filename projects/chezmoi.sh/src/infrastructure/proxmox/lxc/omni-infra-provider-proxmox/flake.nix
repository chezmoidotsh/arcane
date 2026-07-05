{
  description = "omni-infra-provider-proxmox.chezmoi.sh — Omni Proxmox infrastructure provider LXC image";

  # ---------------------------------------------------------------------------
  # Builds a Proxmox-importable .tar.xz running the omni-infra-provider-proxmox
  # binary, enabling Omni to provision Talos VMs directly on Proxmox.
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   Pure (no secrets — provider starts but cannot authenticate):
  #       nix build
  #
  #   With secrets baked in (recommended):
  #       mise run lxc:build
  #
  # Two-phase deployment:
  #   Phase 1 — proxmox.sops.env only (PROXMOX_PASSWORD)
  #       mise run lxc:secrets:proxmox && mise run lxc:build && mise run lxc:push -- <pve>
  #   Phase 2 — after registering the provider in Omni UI
  #       mise run lxc:secrets:omni && mise run lxc:build && mise run lxc:push -- <pve>
  #       mise run lxc:upgrade -- <pve> --vmid <vmid>
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
      # allowUnfree required: omni-infra-provider-proxmox is BSL-1.1.
      pkgs = import nixpkgs { inherit system; config.allowUnfree = true; };

      # Appliance image version — CalVer (YYYY.MM.DD). Bump before each build;
      # append -N for multiple builds on the same day.
      version = "2026.06.28";

      # -----------------------------------------------------------------------
      # Build-time secrets, read from the environment so the build stays pure
      # when they are empty (CI smoke build).
      #
      #   proxmoxPassword       — Proxmox API password  (proxmox.sops.env)
      #   omniServiceAccountKey — Omni infra provider key (omni.sops.env)
      # -----------------------------------------------------------------------
      proxmoxPassword = builtins.getEnv "PROXMOX_PASSWORD";
      omniServiceAccountKey = builtins.getEnv "OMNI_SERVICE_ACCOUNT_KEY";
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          arcane-catalog.nixosModules.lxcAgent
          ./modules
          ./configuration.nix
          { _module.args = { inherit proxmoxPassword omniServiceAccountKey; }; }
        ];
      };
    };
}
