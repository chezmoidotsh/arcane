# Bootstrap Rimbilliton.AKN Minecraft Server

This document describes how to bootstrap the Rimbilliton.AKN server from nothing into a NixOS host running Crafty
Controller, protected by Pocket-ID SSO and backed up to Backblaze B2.

## Overview

The OCI resources (compartment, VCN/subnet/NSG, instance), the DNS records, the B2 bucket, the Tailscale key and the
Pocket-ID OIDC client are provisioned by the Pulumi stack in `src/infrastructure/pulumi/`. The instance boots from a
stock Ubuntu image with only an SSH key injected via cloud-init (Pulumi's `ssh_authorized_keys` config). NixOS is then
installed over it with `nixos-anywhere`, which is the only manual step.

**Key Components** (defined in `src/infrastructure/nixos/`):

- **configuration.nix**: Boot, network, SSH (Tailscale only), Tailscale, sops-nix
- **modules/crafty.nix**: Crafty Controller as a Podman container
- **modules/sso.nix**: Caddy and oauth2-proxy in front of Crafty (Pocket-ID, `admin` and `minecraft` groups)
- **modules/backup.nix**: restic backups to Backblaze B2

## Prerequisites

1. **Tooling**: `mise install`, plus `nix`, `sops` and `ssh-to-age`.
2. **Credentials**: OCI as `TF_VAR_tenancy_ocid` / `TF_VAR_user_ocid` / `TF_VAR_fingerprint` / `TF_VAR_private_key` /
   `TF_VAR_region` (same as kazimierz.akn), `POCKET_ID_API_KEY`, and the Backblaze, Cloudflare and Tailscale provider
   credentials.
3. **Tailnet ACL**: `tag:minecraft` declared in `tagOwners`.
4. **Pulumi stacks**: `kazimierz_akn.live` (parent compartment) and `chezmoi_sh.live` (Pocket-ID groups) already
   applied.

## Bootstrap Procedure

### 1. Provision the infrastructure

```bash
cd projects/rimbilliton.akn/src/infrastructure/pulumi
pnpm install
pulumi stack init rimbilliton_akn.live   # then set the configuration below
mise run pulumi:diff && mise run pulumi:apply
```

Pulumi configuration (`pulumi config set <key> <value>`, add `--secret` for the secret ones):

| Key                                                   | Secret | Value                                    |
| ----------------------------------------------------- | ------ | ---------------------------------------- |
| `oci:region`                                          | no     | `eu-paris-1`                             |
| `ssh_authorized_keys`                                 | no     | public key used for the first SSH access |
| `cloudflare_account_id`, `cloudflare_zone_id`         | yes    | from the Cloudflare dashboard            |
| `tailscale:tailnet`                                   | yes    | tailnet name                             |
| `pocket-id-api:baseUrl`, `pocket-id-api:apiKeyHeader` | no     | `https://auth.chezmoi.sh`, `X-API-KEY`   |

If OCI answers `Out of host capacity`, retry later (known Always Free A1 issue).

### 2. Prepare the host key and secrets

sops-nix decrypts secrets with the host SSH key, which must therefore exist before the first boot:

```bash
cd ../nixos
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
ssh-to-age < extra/etc/ssh/ssh_host_ed25519_key.pub          # host age key, add it to .sops.yaml
cp secrets/rimbilliton.example.yaml secrets/rimbilliton.sops.yaml   # fill from `pulumi stack output --show-secrets`
sops --encrypt --in-place secrets/rimbilliton.sops.yaml
```

Then set `clientID` (`modules/sso.nix`), `bucket` (`modules/backup.nix`), pin the Crafty image tag
(`modules/crafty.nix`) and add your SSH public key (`configuration.nix`). Do not commit `extra/`.

### 3. Install NixOS

SSH is closed on the OCI network security group: temporarily run `pulumi config set unsecure true && pulumi up`, then
set it back once NixOS is installed.

```bash
nix run github:nix-community/nixos-anywhere -- --flake .#rimbilliton \
  --extra-files extra --target-host ubuntu@$(pulumi -C ../pulumi stack output publicIp)
```

### 4. Verify Deployment

```bash
tailscale status | grep rimbilliton                      # the host joined the tailnet
ssh root@rimbilliton systemctl status podman-crafty oauth2-proxy caddy
```

Open `https://minecraft.chezmoi.sh`: the Pocket-ID login must appear, and refuse a user outside the `admin` and
`minecraft` groups.

## Post-Bootstrap Configuration

1. **Crafty**: get the initial password from `/var/lib/crafty/config/default-creds.txt`, create a Paper server on port
   25565, set `-Xmx4G`, and schedule a backup every 6 hours (keep 3).
2. **Give someone their own server**: add the user to the `minecraft` group in the Pocket-ID UI (they can then reach the
   panel), then create their account in Crafty (Config > Users) with a role allowing server creation and management.
   Only one server can listen on 25565 at a time (the only game port open on the OCI network security group): extra
   servers must be stopped, or another port opened in `network.ts` and `crafty.nix`. The VM has 1 OCPU and 6 GB: about 4
   GB of Java heap, which suits Paper/Fabric for a few players, not heavy modpacks.
3. **Backups**: run `systemctl start restic-backups-minecraft`, then check the snapshot with `restic snapshots` against
   the B2 repository.

Later changes are deployed over Tailscale:

```bash
nixos-rebuild switch --flake .#rimbilliton --target-host root@rimbilliton
```
