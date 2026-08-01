# kazimierz.akn — NixOS image

Immutable qcow2 image running Pangolin + Gerbil + Traefik natively (no Docker, no CrowdSec) for the kazimierz.akn public
gateway. See issue 1077 (part of the Crossplane→Pulumi/OCI migration tracked in issue 1010) for the full rationale, and
`stack/oci/` in `projects/kazimierz.akn/src/infrastructure/pulumi/` for the OCI infra this image runs on.

**The OS disk is disposable.** Every change means rebuilding this image and recreating the instance from it — never
editing a running host. All mutable state (Pangolin's db, Gerbil's WireGuard key, Let's Encrypt certs, the GeoIP
database, and the runtime secrets file) lives on a separate block volume (`modules/storage.nix`) that survives instance
recreation untouched.

## Prerequisites

- Docker (the dev host doesn't run Nix/Linux natively — builds happen in a `nixos/nix` container via
  `scripts/nix:build:qcow2`)
- An OCI CLI session (`oci iam compartment list --include-root`) for the upload/import steps
- Proxmox access for the validation step

## 1. Build

```sh
SSH_AUTHORIZED_KEYS="ssh-ed25519 AAAA... you@host" mise run image:build:amd64   # Proxmox validation
SSH_AUTHORIZED_KEYS="ssh-ed25519 AAAA... you@host" mise run image:build:arm64  # OCI production target
```

`SSH_AUTHORIZED_KEYS` is required — `configuration.nix` bakes it into the image (`builtins.getEnv`, hence `--impure`). A
public key isn't secret, but it's still the operator's, never invented by the flake. Both commands drop a
`kazimierz.<date>-<arch>.qcow2` file next to `flake.nix`.

## 2. Validate on Proxmox (amd64)

The persistent volume is a second, separate disk on Proxmox too — a throwaway scratch disk standing in for the real OCI
block volume.

```sh
# Upload and import the disk
scp kazimierz.<date>-amd64.qcow2 root@<pve-host>:/tmp/
ssh root@<pve-host>
qm create <vmid> --name kazimierz-test --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0 \
  --serial0 socket --vga serial0 --ostype l26
qm importdisk <vmid> /tmp/kazimierz.<date>-amd64.qcow2 local-lvm
qm set <vmid> --scsi0 local-lvm:vm-<vmid>-disk-0 --boot order=scsi0 --bios ovmf --efidisk0 local-lvm:0

# Second disk standing in for the OCI block volume (storage.nix expects /dev/vdb)
qm set <vmid> --virtio1 local-lvm:10

qm start <vmid>
qm terminal <vmid>   # serial console — configuration.nix enables serial-getty@ttyS0
```

Verify:

- Boots to a login prompt over the serial console
- `systemctl status pangolin gerbil traefik` all active
- `/var/lib/pangolin` is mounted on the second disk (`findmnt /var/lib/pangolin`) and auto-formatted on first boot
- Dashboard reachable once DNS/firewall allow it, or via `curl -k https://localhost` on the VM itself

Destroy the test VM once satisfied — it's throwaway (`qm stop <vmid> && qm destroy <vmid>`).

## 3. Build + push the arm64 image to OCI

```sh
SSH_AUTHORIZED_KEYS="ssh-ed25519 AAAA... you@host" mise run image:push
```

`image:push` depends on `image:build:arm64`, so this alone builds and pushes. It assumes an Object Storage bucket
already exists for these images (the abandoned Crossplane design provisioned one at `sh-chezmoi-akn-kazimierz-nixos` in
namespace `ax25b8ybxdyk` — the Pulumi stack in `stack/oci/` doesn't recreate that bucket yet; provision one before this
step if it isn't already there) and an authenticated `oci` CLI session.

What it does (`.mise/tasks/image/push`):

1. Picks the most recently built `kazimierz.*-arm64.qcow2` in this directory
2. Resolves the `kazimierz.akn` compartment OCID (child of `chezmoi.sh`, created by `stack/oci/compartments.ts`)
3. `oci os object put` — uploads the image to the bucket
4. `oci compute image import from-object --source-image-type QCOW2` — imports it as a custom compute image (no
   conversion needed, OCI accepts qcow2 directly)

Prints the resulting image OCID and the `pulumi config set oci_image_id <ocid>` command to run next.

## 4. Provision runtime secrets (once, survives every recreate)

Before the instance's `pangolin.service` can start, `/var/lib/pangolin/secrets/pangolin.env` must exist on the
persistent volume (referenced by `services.pangolin.environmentFile` in `modules/pangolin.nix`):

```sh
SERVER_SECRET=<32+ random chars>
EMAIL_SMTP_USER=<Mailjet SMTP username>
EMAIL_SMTP_PASS=<Mailjet SMTP password>
```

Create this file directly on the volume (e.g. attach it to a throwaway instance once, or `dd`/mount it before first
boot) — it's operator-provisioned, not something Nix or Pulumi manages.

## 5. Recreate the instance

The block volume survives instance deletion — recreating from a new image never loses Pangolin/Gerbil/Traefik state:

```sh
pulumi config set oci_image_id <new-image-ocid>
pulumi up   # projects/kazimierz.akn/src/infrastructure/pulumi
```

## Updating nixpkgs

`inputs.nixpkgs.url` tracks `nixos-unstable` (rolling, not a stable point release like `nixos-26.05`) — expect more
frequent breaking changes than a stable channel, in exchange for picking up `services.pangolin` fixes/features faster.

```sh
docker run --rm -v nix-store-cache:/nix -v "$(pwd)/../../../../..:/src" \
  -w /src/projects/kazimierz.akn/src/infrastructure/nixos \
  nixos/nix nix --extra-experimental-features "nix-command flakes" flake update
```

This rewrites `flake.lock` to the latest `nixos-unstable` + `nixos-generators` revisions — commit the updated lock file,
then rebuild and go through steps 1-3 above as usual (build, validate on Proxmox, push + recreate). Nothing here is
automatic: an update is a deliberate rebuild-and-redeploy, same as any other image change.

To pin a single input instead of updating everything: `nix flake lock --update-input nixpkgs`.

## Known simplifications / open questions

- **`/dev/vdb` device assumption (`modules/storage.nix`)** — unverified against real hardware. Assumes the persistent
  volume is always the second attached disk on both Proxmox (virtio) and OCI (paravirtualized, which OCI itself exposes
  as `/dev/oracleoci/oraclevdb` over the same underlying device). This is issue 1077's own flagged highest-risk unknown
  — confirm on first real boot on each target before trusting it blindly.
- **error-pages dropped** — no native nix package exists; Traefik's default (unthemed) error responses are used instead
  rather than adding a container runtime for one cosmetic piece.
- **Tailscale dropped** — the current Ansible-managed host also runs Tailscale for admin SSH; this image relies on
  direct pubkey SSH (already NSG-restricted) only. Add `services.tailscale` if the mesh fallback still matters.
- **`email.no_reply` key unverified** — the Ansible template uses `smtp_from`, current Pangolin docs say `no_reply`.
  Check the rendered config / mail delivery after first boot.
- **nixos-generators, not `nixos-rebuild build-image`** — matches every other flake in this repo today; issue 1079
  tracks migrating everything (including this flake) once that's done repo-wide.
