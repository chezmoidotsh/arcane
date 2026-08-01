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

## 3. Upload to OCI and import as a custom image

No conversion needed — OCI's image import API accepts qcow2 directly (`--source-image-type QCOW2`). This assumes an
Object Storage bucket already exists for these images (the abandoned Crossplane design provisioned one at
`sh-chezmoi-akn-kazimierz-nixos` in namespace `ax25b8ybxdyk` — the Pulumi stack in `stack/oci/` doesn't recreate that
bucket yet; provision one before this step if it isn't already there).

```sh
COMPARTMENT_ID="<kazimierz compartment OCID — stack/oci/compartments.ts>"
NAMESPACE="<object storage namespace>"
BUCKET="<bucket name>"
DATE=$(date +%Y.%m.%d)

oci os object put --namespace "$NAMESPACE" --bucket-name "$BUCKET" \
  --name "kazimierz-${DATE}-arm64.qcow2" --file "kazimierz.${DATE}-arm64.qcow2"

oci compute image import from-object \
  --compartment-id "$COMPARTMENT_ID" \
  --namespace "$NAMESPACE" --bucket-name "$BUCKET" \
  --name "kazimierz-${DATE}-arm64.qcow2" \
  --display-name "kazimierz-${DATE}" \
  --launch-mode CUSTOM \
  --source-image-type QCOW2
```

Note the resulting image OCID — it's `pulumi config set oci_image_id <ocid>` in the Pulumi stack.

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
