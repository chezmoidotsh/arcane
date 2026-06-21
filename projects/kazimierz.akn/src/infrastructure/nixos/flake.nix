{
  description = "kazimierz.akn — VPS public-access gateway, immutable NixOS disk image";

  # ---------------------------------------------------------------------------
  # All-in-one flake: NixOS modules + site config → bootable UEFI qcow2.
  #
  # kazimierz is the public-facing VPS that terminates ingress and runs Pangolin
  # (WireGuard gateway), Gerbil (tunnel manager), and Traefik as native NixOS
  # systemd services — no container runtime, no comin, no nixos-infect.
  #
  # The image is IMMUTABLE: it carries no state and no secrets.  All mutable
  # data (Pangolin DB/config, Traefik ACME certs, Gerbil WireGuard keys) and the
  # operator-provisioned secrets live on a separate block volume mounted at
  # /var/lib/kazimierz (see modules/storage.nix).  Rebuild + redeploy by hand;
  # the volume survives instance recreation.
  #
  # Build a bootable qcow2 (per architecture):
  #
  #   nix build .#qcow-amd64      # x86_64 — for Proxmox validation
  #   nix build .#qcow-arm64      # aarch64 — production target (OCI Ampere A1)
  #
  # or via the wrappers:
  #
  #   mise run image:build:amd64
  #   mise run image:build:arm64
  #
  # Workflow: build → validate the amd64 image on Proxmox → upload the arm64
  # image to the OCI bucket → import as a custom image → recreate the instance.
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators, ... }:
    let
      # Appliance image version — CalVer (YYYY.MM.DD).  Bump before every build;
      # append -N for multiple builds on the same day.  Parsed by the mise tasks
      # to name the artifact (kazimierz.<version>-<arch>.qcow2).
      imageVersion = "2026.06.21";

      # NixOS configuration shared by every architecture.  nixos-generators'
      # qcow-efi format adds the disk-image + UEFI/GRUB plumbing on top.
      mkImage = system: nixos-generators.nixosGenerate {
        inherit system;
        format = "qcow-efi";
        modules = [
          ./configuration.nix
          ./modules/default.nix
        ];
      };
    in
    {
      packages.x86_64-linux = {
        qcow-amd64 = mkImage "x86_64-linux";
        default = self.packages.x86_64-linux.qcow-amd64;
      };

      packages.aarch64-linux = {
        qcow-arm64 = mkImage "aarch64-linux";
        default = self.packages.aarch64-linux.qcow-arm64;
      };

      # Exposed for the mise tasks / version detection.
      inherit imageVersion;
    };
}
