---
name: lxc-maintenance
description: >
  Build, push, and upgrade Proxmox LXC appliances in the chezmoi.sh project.
  Use when asked to build an LXC image, upload it to Proxmox, upgrade a
  running container, or add a new LXC appliance using the shared library.
compatibility: Requires mise, nix, sops, scp, and SSH access to a Proxmox host
---

# LXC Maintenance Skill

## Overview

The `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/` directory contains
five NixOS-based LXC appliances, each built as an immutable tarball and
upgraded in place: the running container keeps its VMID (and therefore its
static IP and PBS backup identity) while its rootfs volume is swapped for a
freshly built one, with a Proxmox snapshot as the rollback path.

```text
lxc/
├── .mise/
│   └── lib/lxc.sh              ← shared build/push/upgrade library (single source of truth)
├── observability/              ← VictoriaMetrics + Vector + Grafana + Alertmanager
├── oci-registry/               ← Zot OCI registry
├── omni/                       ← Omni cluster manager
├── omni-infra-provider-proxmox/
└── pve-exporter/               ← prometheus-pve-exporter
```

Each appliance has the same layout:

```text
<name>/
├── flake.nix                   ← version declared here (imageVersion or version)
├── modules/                    ← NixOS modules
├── secrets/                    ← SOPS-encrypted .sops.env files
└── .mise/tasks/lxc/
    ├── build                   ← mise run lxc:build
    ├── push                    ← mise run lxc:push -- <pve-host>
    └── upgrade                 ← mise run lxc:upgrade -- <pve-host>
```

## Daily operations

### Build a template

```sh
cd projects/chezmoi.sh/src/infrastructure/proxmox/lxc/<name>
mise run lxc:build
```

What happens:

1. The version is read from `flake.nix` (`imageVersion` or `version` field).
2. Required secrets are decrypted from SOPS files and exported as env vars.
3. `nix:build:lxc` builds the NixOS system closure and produces `<name>.<ver>-amd64.tar.xz`.
4. Secrets are unset from the environment immediately after build.

The artifact lands at `<name>/<name>.<version>-amd64.tar.xz`.

### Push to Proxmox

```sh
mise run lxc:push -- <pve-host>
```

Where `<pve-host>` is the hostname or IP of the target Proxmox node (e.g. `pve.lan`).

* Computes a SHA-256 of the local template and compares it to the remote copy.
* Skips the upload if the SHA matches — safe to run repeatedly.
* Uploads to `/var/lib/vz/template/cache/<name>.<ver>-amd64.tar.xz` on the host.

### Upgrade a running container

```sh
mise run lxc:upgrade -- <pve-host>
# or with an explicit VMID:
mise run lxc:upgrade -- --pve-host <pve-host> --vmid <vmid>
# or non-interactive:
mise run lxc:upgrade -- --pve-host <pve-host> --yes
```

The upgrade executes 7 numbered steps with an ANSI progress display:

| Step | Action                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 1    | Pre-flight: verify template exists on PVE, CT exists, registered mount points present                      |
| 2    | Temporary CT smoke-test: create a disposable CT from the new template, verify NixOS activation, destroy it |
| 3    | Snapshot the CT (`pct snapshot <vmid> pre-upgrade-<timestamp>`)                                            |
| 4    | Stop the CT (downtime starts here)                                                                         |
| 5    | Replace the rootfs volume in place (same VMID), then start the CT                                          |
| 6    | Health check: verify services are active after 30s warm-up, show e2e hint                                  |
| 7    | Commit — delete the snapshot and free the old volume (or roll back on failure)                             |

The VMID never changes across an upgrade, so static IP, PBS backup identity,
and mount point attachments are untouched by the whole process.

**Auto-detection**: if `--vmid` is omitted, the running container is found
by matching PVE tags or hostname against `LXC_TAGS`.

**Rollback**: if the health check fails or the user answers "N" at step 7, the
CT is stopped, `pct rollback`ed to the pre-upgrade snapshot, and restarted. The
orphaned rootfs volume created during step 5 is freed automatically.

## Shared library reference

All appliance scripts source the shared library:

```bash
CONFIG_ROOT="$(pwd)"
# shellcheck source=/dev/null
source "${CONFIG_ROOT}/../.mise/lib/lxc.sh"
```

The library is at `lxc/.mise/lib/lxc.sh`. Functions:

### `lxc_init <name> <config_root> [tag ...]`

Must be called first. Sets all globals used by subsequent functions.

* `<name>` — LXC appliance name (e.g. `observability`)
* `<config_root>` — absolute path to the appliance directory (`$CONFIG_ROOT`)
* `[tag ...]` — extra PVE tag names for auto-detection (e.g. `_o11y`)

Sets: `LXC_NAME`, `LXC_VERSION`, `LXC_TAGS`, `LXC_TEMPLATE`, `LXC_ARTIFACT`, `LXC_REMOTE_PATH`

### `lxc_secret <sops-file> <KEY> [KEY ...]`

Register required secrets from a SOPS-encrypted `.env` file. Secrets are extracted
at `lxc_build` time and must all be present (non-empty) or the build fails.

```bash
lxc_secret "secrets/caddy.sops.env" CLOUDFLARE_API_TOKEN TAILSCALE_OAUTH_KEY
```

### `lxc_secret_optional <sops-file> <KEY> [KEY ...]`

Same as `lxc_secret` but silently exports an empty string if the file or key is missing.

```bash
lxc_secret_optional "secrets/omni.sops.env" OMNI_SERVICE_ACCOUNT_KEY
```

### `lxc_build`

Decrypts secrets, runs `nix:build:lxc`, cleans env. Call after all `lxc_secret*` registrations.

### `lxc_push <pve-host>`

Uploads the built template with SHA-256 dedup. Requires the artifact to exist (run `lxc_build` first).

### `lxc_services <svc> [svc ...]`

Register systemd services to health-check in step 6 of the upgrade.

```bash
lxc_services "caddy" "vector" "victoriametrics" "lxc-agent"
```

### `lxc_mp <mp-id> <subdir> <uid>`

Register a persistent mount point subdirectory, checked for presence during
pre-flight. Since the upgrade never detaches mount points (same VMID
throughout), this is a sanity check only — not a re-attachment mechanism.

```bash
lxc_mp "mp0" "o11y" 100980    # /persistent/o11y owned by UID 100980
lxc_mp "mp0" "caddy" 100997   # /persistent/caddy owned by UID 100997
```

The `<mp-id>` must match the Proxmox config key (e.g. `mp0`, `mp1`).

### `lxc_e2e_hint <cmd>`

Print a one-liner end-to-end check command after step 6 (informational only).

```bash
lxc_e2e_hint "curl -sSf https://o11y.chezmoi.sh/metrics/api/v1/query?query=up"
```

### `lxc_upgrade [flags]`

Run the full upgrade flow. Flags:

| Flag                | Default        | Description                         |
| ------------------- | -------------- | ----------------------------------- |
| `--pve-host <host>` | required       | Proxmox node hostname or IP         |
| `--vmid <vmid>`     | auto-detect    | VMID of the running container       |
| `--version <ver>`   | from flake.nix | Image version string                |
| `--yes` / `-y`      | off            | Skip confirmation prompts (CI-safe) |

## Adding a new LXC appliance

1. Create the directory structure:

   ```text
   lxc/<name>/
   ├── flake.nix              ← declare version = "YYYY.MM.DD" or imageVersion = "..."
   ├── modules/               ← NixOS modules
   └── secrets/               ← SOPS-encrypted .sops.env files
   ```

2. Create the three mise task scripts under `lxc/<name>/.mise/tasks/lxc/`:

   **`build`**:

   ```bash
   #!/usr/bin/env bash
   # [MISE] description="Build the <name> LXC template with secrets baked in"
   # [MISE] dir="{{config_root}}"

   set -euo pipefail

   CONFIG_ROOT="$(pwd)"
   # shellcheck source=/dev/null
   source "${CONFIG_ROOT}/../.mise/lib/lxc.sh"

   lxc_init "<name>" "${CONFIG_ROOT}" _<tag>
   lxc_secret "secrets/<file>.sops.env" KEY1 KEY2
   lxc_build
   ```

   **`push`**:

   ```bash
   #!/usr/bin/env bash
   # [MISE] description="Upload the <name> LXC template to Proxmox"
   # [MISE] depends=["lxc:build"]
   # [MISE] dir="{{config_root}}"
   # [USAGE] arg "<pve_host>" help="Hostname or IP of the Proxmox node (e.g. pve.lan)"

   set -euo pipefail

   CONFIG_ROOT="$(pwd)"
   # shellcheck source=/dev/null
   source "${CONFIG_ROOT}/../.mise/lib/lxc.sh"

   lxc_init "<name>" "${CONFIG_ROOT}" _<tag>
   lxc_push "${usage_pve_host}"
   ```

   **`upgrade`**:

   ```bash
   #!/usr/bin/env bash
   # [MISE] description="Upgrade the <name> LXC to a new image version in place"
   # [MISE] dir="{{config_root}}"
   # [USAGE] arg "<pve_host>" help="Hostname or IP of the Proxmox node (e.g. pve.lan)"
   # [USAGE] flag "-i --vmid <id>" help="VMID of the running container (auto-detected via PVE tags if omitted)"
   # [USAGE] flag "-V --version <version>" help="Image version — auto-detected from flake if omitted"
   # [USAGE] flag "-y --yes" help="Skip confirmation prompts"

   set -euo pipefail

   CONFIG_ROOT="$(pwd)"
   # shellcheck source=/dev/null
   source "${CONFIG_ROOT}/../.mise/lib/lxc.sh"

   lxc_init "<name>" "${CONFIG_ROOT}" _<tag>
   lxc_services "service1" "service2" "lxc-agent"
   lxc_mp "mp0" "subdir" <uid>
   lxc_e2e_hint "curl -sSf https://<name>.chezmoi.sh/"

   lxc_upgrade \
     --pve-host "${usage_pve_host}" \
     --vmid "${usage_vmid-}" \
     --version "${usage_version-}" \
     ${usage_yes:+--yes}
   ```

3. Make the scripts executable: `chmod +x lxc/<name>/.mise/tasks/lxc/{build,push,upgrade}`

4. Register the tasks in `lxc/<name>/.mise.toml` (the task discovery file for mise).

5. Run `trunk check --filter=-conftest` on the new scripts before committing.

## Common issues

| Symptom                                   | Cause                                                      | Fix                                                                 |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `Could not detect version from flake.nix` | `imageVersion` or `version` field not found                | Check the flake.nix field name matches the grep pattern             |
| `<KEY> is empty in <file>`                | SOPS key exists but is blank                               | Populate the key in the SOPS file                                   |
| `Template not found on <host>`            | `lxc:push` was not run yet                                 | Run `mise run lxc:push -- <host>`                                   |
| CT not auto-detected                      | PVE tags don't include any of `LXC_TAGS`                   | Pass `--vmid` explicitly or add the tag in PVE                      |
| Smoke test fails                          | NixOS activation error, often missing `features.nesting=1` | Add `features: nesting=1` to the Proxmox CT config                  |
| Orphaned rootfs volume after a failed run | Script interrupted between step 5 and step 7               | Check `pvesm list <storage>` and free unreferenced volumes manually |

## References

* Shared library: `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/.mise/lib/lxc.sh`
* Existing appliances: `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/`
* Observability README (full deploy procedure): `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/observability/README.md`
