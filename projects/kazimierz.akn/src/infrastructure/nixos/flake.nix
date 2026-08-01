{
  description = "kazimierz.akn — immutable NixOS image running Pangolin (issue 1077)";

  # ---------------------------------------------------------------------------
  # Immutable qcow2 image for kazimierz.akn's public gateway (Pangolin + Gerbil
  # + Traefik, no CrowdSec — see docs/decisions and issue 1010/1076/1077 for
  # the full migration rationale). The OS disk is disposable: config changes
  # mean rebuilding and redeploying this image, never mutating a running host.
  # All mutable state (Pangolin DB, Gerbil keys, TLS certs, GeoIP db) lives on
  # a separate block volume mounted by storage.nix, so recreating the
  # instance from a new image never loses that state.
  #
  # Two architectures:
  #   x86_64-linux  — fast local validation on Proxmox before every rollout
  #   aarch64-linux — the production target (OCI Ampere A1, VM.Standard.A1.Flex)
  #
  # Build (produces a qcow2 image next to flake.nix):
  #   mise run image:build:amd64
  #   mise run image:build:arm64
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-unstable";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  # EXPERIMENTAL -- only used by nixosConfigurations.kazimierz-anywhere-test
  # below, while evaluating nixos-anywhere as a replacement for the
  # qcow-efi/KVM-requiring build above (see the Proxmox VM test in
  # docs/network or the session's own notes). Not wired into the production
  # aarch64 config or the packages.*.default outputs yet.
  inputs.disko.url = "github:nix-community/disko";
  inputs.disko.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators, disko }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];

      modules = [
        ./modules
        ./configuration.nix
      ];

      imageFor = system: nixos-generators.nixosGenerate {
        inherit system modules;
        pkgs = import nixpkgs { inherit system; };
        format = "qcow-efi";
      };
    in
    {
      packages = nixpkgs.lib.genAttrs systems (system: {
        default = imageFor system;
      });

      # For inspecting individual option values without going through
      # nixos-generators' image-building wrapper, e.g.:
      #   nix eval .#nixosConfigurations.kazimierz.config.services.pangolin.settings
      # NOT directly buildable as a full system (config.system.build.toplevel):
      # nixos-generators' qcow-efi format injects the root filesystem and
      # bootloader config that a bare nixosSystem eval here doesn't have.
      nixosConfigurations.kazimierz = nixpkgs.lib.nixosSystem {
        system = "aarch64-linux";
        inherit modules;
      };

      # EXPERIMENTAL: nixos-anywhere target for the Proxmox VM test (see
      # flake input comment above). x86_64-linux to match the throwaway
      # Proxmox test VM; disko.nix's /dev/vda assumption is also what OCI's
      # paravirtualized attachment uses, so this should carry over.
      #   nix run github:nix-community/nixos-anywhere -- \
      #     --flake .#kazimierz-anywhere-test root@<test-vm-ip>
      nixosConfigurations.kazimierz-anywhere-test = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = modules ++ [
          disko.nixosModules.disko
          ./modules/disko.nix
        ];
      };
    };
}
