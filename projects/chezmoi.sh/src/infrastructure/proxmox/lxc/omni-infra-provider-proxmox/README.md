# `omni-infra-provider-proxmox` — Omni Infrastructure Provider LXC (Proxmox)

Standalone Proxmox LXC running NixOS + `omni-infra-provider-proxmox`. Registers
with the Omni instance at `omni.chezmoi.sh` and enables provisioning of Talos VMs
directly from the Omni UI — select a machine class, Omni calls this provider, the
provider creates a VM on Proxmox and boots it with a Talos image.

This LXC is a **companion to `../omni/`** and is deployed and operated
independently. Each LXC has its own `.mise/tasks` and lifecycle.

## Table of contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Proxmox user and role setup](#proxmox-user-and-role-setup)
4. [Secrets — two-phase setup](#secrets--two-phase-setup)
5. [Build & deploy](#build--deploy)
6. [Proxmox LXC creation](#proxmox-lxc-creation)
7. [Operations](#operations)
8. [Troubleshooting](#troubleshooting)
9. [References](#references)

## Architecture

```text
                      ┌─────────────────────┐
                      │    Internet / LAN    │
                      └─────────┬───────────┘
                                │
                   ┌────────────▼────────────┐
                   │  Proxmox host           │
                   │  pve-01.pve.chezmoi.sh  │
                   │                         │
                   │  ┌───────────────────┐  │
                   │  │  LXC: omni        │  │
                   │  │  omni.chezmoi.sh  │  │
                   │  └────────┬──────────┘  │
                   │           │              │
                   │  ┌────────▼──────────┐  │
                   │  │  LXC: infra-     │  │
                   │  │  provider-proxmox│──┤──→ Omni API
                   │  │  (no inbound)    │  │    (omni.chezmoi.sh)
                   │  └────────┬──────────┘  │
                   │           │              │
                   │           └──→ Proxmox API
                   │                (localhost:8006)
                   │                         │
                   │  Creates Talos VMs ◄────┘
                   └─────────────────────────┘
```

* **No inbound ports** — the provider connects out to Omni and Proxmox only.
  No Caddy, no TLS termination, no firewall rules needed.
* **Stateless** — no persistent volume. Upgrades replace the rootfs entirely.
* **No TUN/WireGuard** — unlike the Omni LXC, no special kernel or device
  prerequisites are needed.
* **Proxmox user** — authenticates as `omni@pve` with VM lifecycle permissions
  (see [Proxmox user and role setup](#proxmox-user-and-role-setup)).

## Prerequisites

* `mise` with the repo's `.mise.toml` trusted (`mise trust`).
* `sops` with the repo age key loaded (`SOPS_AGE_KEY_FILE` set by mise).
* SSH key-based root access to the Proxmox node.
* The `omni` LXC must be running and reachable at `omni.chezmoi.sh`.

## Proxmox user and role setup

The infra provider authenticates with Proxmox using a dedicated `omni@pve` user.
Create it on the Proxmox host before first deployment:

```sh
# On the Proxmox node (pve-01.pve.chezmoi.sh):

# 1. Create a PVE realm user
pveum user add omni@pve

# 2. Create a role with the minimum permissions for VM lifecycle
pveum role add OmniProvider -privs \
  "VM.Allocate VM.Clone VM.Config.CPU VM.Config.Disk VM.Config.Memory \
   VM.Config.Network VM.Config.Options VM.Monitor VM.PowerMgmt \
   VM.Console Datastore.AllocateSpace Datastore.Audit"

# 3. Assign the role to the user on the target path
#    '/' = all nodes and VMs — restrict to a specific node or pool if needed.
pveum acl modify / --users omni@pve --roles OmniProvider

# 4. Set a password for the user (this is the PROXMOX_PASSWORD secret)
pveum passwd omni@pve

# 5. (Optional) Create an API token for non-interactive use
pveum user token add omni@pve provider --privsep 0
# Record the full token ID (omni@pve!provider) and secret for automation.
```

### Proxmox permissions reference

| Privilege                 | Why needed                                  |
| ------------------------- | ------------------------------------------- |
| `VM.Allocate`             | Create new VMs for Talos nodes.             |
| `VM.Clone`                | Clone VM templates (if using a base image). |
| `VM.Config.CPU`           | Set CPU cores/count on new VMs.             |
| `VM.Config.Disk`          | Attach and resize disks.                    |
| `VM.Config.Memory`        | Set memory allocation.                      |
| `VM.Config.Network`       | Configure NICs (bridge, VLAN, model).       |
| `VM.Config.Options`       | Set boot order, OSType, description.        |
| `VM.Monitor`              | Query VM status via QEMU monitor.           |
| `VM.PowerMgmt`            | Start, stop, reset VMs.                     |
| `VM.Console`              | Access VNC/terminal for debugging.          |
| `Datastore.AllocateSpace` | Create disks on storage (local-zfs, etc.).  |
| `Datastore.Audit`         | List available storage and templates.       |

> **Security note.** Restrict the ACL path to `/nodes/<name>` or a resource
> pool if the Proxmox host runs workloads beyond Omni-managed Talos VMs. The
> `omni@pve` user should not have access to unrelated VMs or containers.

### Configuration mapping

The Proxmox user configured above maps to these options in `configuration.nix`:

```nix
services.omniInfraProviderProxmox.proxmox = {
  url = "https://pve-01.pve.chezmoi.sh:8006/api2/json";
  username = "omni@pve";    # from pveum user add
  realm = "pve";            # PVE realm (not pam)
};
```

The password is stored in `secrets/proxmox.sops.env` and baked into the image at
build time.

## Secrets — two-phase setup

The provider needs credentials from two sources. They are collected in two
separate SOPS env files and baked into the image at build time.

| File                       | Variable                   | When available          |
| -------------------------- | -------------------------- | ----------------------- |
| `secrets/proxmox.sops.env` | `PROXMOX_PASSWORD`         | Before first build      |
| `secrets/omni.sops.env`    | `OMNI_SERVICE_ACCOUNT_KEY` | After Omni registration |

### Phase 1 — Proxmox credentials

```sh
mise run lxc:secrets:proxmox
```

Prompts for the Proxmox API password for the user configured in
`configuration.nix` (`services.omniInfraProviderProxmox.proxmox.username`).

### Phase 2 — Omni infrastructure provider key

1. Deploy the phase-1 image (provider starts but cannot connect to Omni).
2. In the Omni UI: **Settings → Infrastructure Providers → Create**.
   Copy the generated key.
3. Run:
   ```sh
   mise run lxc:secrets:omni
   ```
4. Rebuild and redeploy.

### Key rotation

* **Proxmox password** — re-run `lxc:secrets:proxmox`, rebuild, redeploy.
* **Omni key** — delete the provider in Omni UI, re-register, re-run
  `lxc:secrets:omni`, rebuild, redeploy.

## Build & deploy

```sh
# 1. Build the LXC tarball with secrets baked in
mise run lxc:build

# 2. Upload to Proxmox
mise run lxc:push -- pve.lan
```

The template name is `omni-infra-provider-proxmox.<CalVer>-amd64.tar.xz`.
Bump the `version` in `flake.nix` before each build.

### Task reference

| Task                                          | What it does                                     |
| --------------------------------------------- | ------------------------------------------------ |
| `mise run lxc:secrets:proxmox`                | Proxmox password → `secrets/proxmox.sops.env`    |
| `mise run lxc:secrets:omni`                   | Omni provider key → `secrets/omni.sops.env`      |
| `mise run lxc:build`                          | Build LXC tarball with both secrets baked in     |
| `mise run lxc:push -- <pve-host>`             | Upload template to Proxmox                       |
| `mise run lxc:upgrade -- <pve-host> <src_id>` | Rootfs-swap upgrade (stateless — no volume swap) |

## Proxmox LXC creation

After `lxc:push` uploads the template:

```sh
VMID="<vmid>"
TEMPLATE=omni-infra-provider-proxmox.<version>-amd64.tar.xz
NODE=pve.lan

ssh root@${NODE} pct create ${VMID} local:vztmpl/${TEMPLATE} \
    --hostname     omni-infra-provider-proxmox \
    --description  "Omni infra provider for Proxmox — managed by chezmoidotsh/arcane" \
    --ostype       nixos \
    --arch         amd64 \
    --unprivileged 1 \
    --features     nesting=1 \
    --cores        1 \
    --memory       512 \
    --swap         0 \
    --rootfs       local-zfs:4 \
    --net0         name=eth0,bridge=vmbr1,ip=dhcp,firewall=1,tag=5 \
    --onboot       1

# Wire up the console device
ssh root@${NODE} "echo 'lxc.console.path: /dev/console' >> /etc/pve/lxc/${VMID}.conf"

# Start
ssh root@${NODE} pct start ${VMID}
```

No persistent volume, no TUN device, no WireGuard — simpler than `omni`.

### Resource sizing

| Workload  | Recommended |
| --------- | ----------- |
| CPU       | 1 vCPU      |
| Memory    | 512 MiB     |
| Root disk | 4 GiB       |
| Swap      | 0           |

## Operations

### Check provider status

```sh
# Service status
ssh root@pve.lan pct exec <vmid> -- journalctl -u omni-infra-provider-proxmox -f

# Is it connected to Omni?
# → Check Omni UI: Settings → Infrastructure Providers
#   The provider should show as "connected".
```

### Update configuration

1. Edit `configuration.nix` (e.g. change `proxmox.url` or `proxmox.username`).
2. `mise run lxc:build && mise run lxc:push -- pve.lan`
3. `mise run lxc:upgrade -- pve.lan <source_id>`

### Upgrade provider version

1. Bump `services.omniInfraProviderProxmox.version` and `hashes` in
   `catalog/nix/siderolabs/omni/infra-provider-proxmox.nix` (Renovate proposes this).
2. Bump `version` in `flake.nix`.
3. Build, push, upgrade.

## Troubleshooting

### Provider not appearing in Omni UI

Check that `omniApiEndpoint` in `configuration.nix` matches the running Omni
URL exactly (including trailing slash). Verify connectivity:

```sh
ssh root@pve.lan pct exec <vmid> -- \
  curl -sSf https://omni.chezmoi.sh/healthz
```

### Authentication failure to Proxmox

Verify the password and username in `configuration.nix` and
`secrets/proxmox.sops.env`. The username must be in `user@realm` format.

### Phase-1 deploy — provider logs "empty key"

Expected — the `OMNI_SERVICE_ACCOUNT_KEY` is not set yet. Complete phase 2
(register in Omni UI, run `lxc:secrets:omni`, rebuild).

## References

* [omni-infra-provider-proxmox GitHub](https://github.com/siderolabs/omni-infra-provider-proxmox)
* [Omni documentation](https://omni.siderolabs.com)
* [Omni infrastructure providers docs](https://omni.siderolabs.com/docs/how-to-guides/infrastructure-providers/)
* [Proxmox VE user management](https://pve.proxmox.com/pve-docs/pveum.1.html)
* [Catalog NixOS module](../../../../../catalog/nix/siderolabs/omni/infra-provider/proxmox.nix)
* [Companion LXC — Omni](../omni/)
