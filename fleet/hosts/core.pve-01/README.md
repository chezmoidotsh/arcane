# Proxmox VE (pve-01.pve.chezmoi.sh) as Code

The [`pulumi/`](pulumi/) folder of this host holds the Pulumi TypeScript project (`pve-01-core`, stack
`pve-01_core.live`) that manages a narrow, deliberately scoped slice of `pve-01.pve.chezmoi.sh` — the Proxmox VE host
every cluster in this homelab runs on — as declarative code. It follows the same bridged-provider pattern already
established for [`core.pbs`](../core.pbs/) and [`core.nas`](../core.nas/):
[`@pulumi/proxmox`](../../../catalog/pulumi/sdks/proxmox/), a Pulumi provider dynamically bridged from the
[`bpg/terraform-provider-proxmox`](https://github.com/bpg/terraform-provider-proxmox) Terraform provider. The
[`fs/`](fs/) folder holds the files installed on the node by hand (see [Host files](#host-files-fs) below).

The generated human-facing documentation is published at [`PROXMOX-VE.md`](PROXMOX-VE.md) (see
[`pulumi/toolbox/proxmox-docs/`](pulumi/toolbox/proxmox-docs/README.md)).

See
[docs/decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md](../../../docs/decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md),
"Non-Goals" for why this scope is narrow: Proxmox VE's **VM/LXC lifecycle** stays fully manual — this stack manages
administrative config objects (ACLs, SDN, backup-storage registration, resource pools, ACME) that don't carry the
`Proxmox → hosts K8s → K8s manages Proxmox` trust-cycle risk that non-goal exists to block.

## What's managed here

| File (`pulumi/`) | Responsibility                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access/`        | Custom roles (`OmniProvider`, `OmniProviderNode`), the `rhodes-akn-bootstrap@pve`, `omni@pve` service accounts, their API tokens, and every ACL binding |
| `sdn.ts`         | The `pvenet` SDN zone, `talosnet` VNet + subnet (shared node-traffic network for all Talos/Omni clusters), and the SDN apply step                       |
| `pools.ts`       | The `core` and `talos` resource pools, and `talos`'s storage-level pool membership (`local`, `nvme-lvm`)                                                |
| `storage.ts`     | Registers Proxmox VE's `pbs`-type storage entry against the datastore [`core.pbs`](../core.pbs/) manages                                                |
| `acme.ts`        | The node's ACME account (`default`) and Cloudflare DNS-01 plugin, plus the scoped Cloudflare token that plugin uses                                     |
| `firewall.ts`    | The `talos` cluster Security Group — a baseline firewall policy every Omni-managed Talos VM can opt into                                                |

### Intentionally not managed via Pulumi

- **VM/LXC lifecycle** (create/modify/delete compute) — the actual trust-cycle risk
  `docs/decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md`'s Proxmox non-goal protects against. Structurally
  unreachable from this stack's code: no `VirtualEnvironmentVm`/`VirtualEnvironmentContainer`/`ClonedVm` import anywhere
  here, even though the bridged SDK exposes them.
- **Realms** (`pam`, `pve`) — both are Proxmox VE built-ins; no `pocket-id` or other custom realm exists on this host.
  Not worth codifying two realms that ship with every install.
- **Local storage config** (`local`, `nvme-lvm`) — stays manual, same reasoning as the VM/OS layer. Only the
  **pbs**-type storage entry (`storage.ts`) is in scope.
- **PCI/USB resource mapping** (`HBA-4xSATA`, `NIC-10G`, `INTERNAL-6xSATA`) — these encode host-specific IOMMU addresses
  that need `lspci` rediscovery on any rebuild regardless of whether the mapping object itself is versioned, and are
  only consumed by one VM's passthrough config (VM-lifecycle-adjacent, out of scope). Revisit if passthrough config
  starts changing often.
- **Notifications** — the bridged provider has no PVE notification resource type (unlike PBS). The node stays on its
  built-in `sendmail`→`root@pam` matcher; no Pulumi equivalent exists to replace it.
- **Backup jobs themselves** (which VMs/LXCs get backed up, on what schedule) — Proxmox VE `vzdump` resources, staying
  manual for the same reason VM/LXC lifecycle does. `storage.ts` only prepares the _destination_ those jobs push to.
- **The `testing` ACME account** — exists on the host (Let's Encrypt staging directory) but no node certificate config
  references it. Not imported; dropped the same way ADR-015 dropped `DomainIdentity` — no live consumer, not worth
  codifying. (The `default` account **is** managed — see `acme.ts` and "Bootstrapping" below for why that requires
  username/password authentication instead of an API token.)
- **The legacy `vmbr1` SDN ACL's target zone** (`localnetwork`) — the ACL grant itself is declared in `access.ts`
  (`omniSdnVmbr1Acl`), but the `localnetwork` zone/`vmbr1` bridge it points at predates this stack and is manual,
  outside the SDN abstraction `sdn.ts` manages.

## Access model

Two service identities, each scoped to the minimum the manual `pveum`/`pvesh` recipes they replace actually granted (see
`docs/experiments/20260617-proxmox-csi-ccm/README.md` and `fleet/hosts/core.omni-infra-provider-proxmox/README.md`,
"Proxmox user and role setup" — the recipes this stack codifies):

- **`rhodes-akn-bootstrap@pve`** — `Administrator` scoped to `/access` only (users, roles, ACLs, tokens — nothing on
  VMs, storage or SDN). A delegation credential, not a service identity for a workload: `rhodes.akn`'s own Pulumi
  program (`fleet/clusters/akn.rhodes/pulumi/stack/proxmox.ts`) uses it to self-provision its own
  `kubernetes-cloud-provider@pve` identity (CCM+CSI, merged) directly against `pve-01`, via
  `catalog/pulumi/components/proxmox-cluster-identity`, instead of this stack minting that token on its behalf. This
  stack no longer owns any Kubernetes CCM/CSI identity for that reason — see that component's README for the full
  pattern, and this stack's `git log` for the identities/roles that used to live here (`kubernetes-ccm@pve`,
  `kubernetes-csi@pve`, `KubernetesCCM`, `KubernetesCSI`).
- **`omni@pve`** — the widest identity (VM allocate/clone/config/power), scoped to `/pool/talos` plus
  `Sys.AccessNetwork`/`Sys.Audit` on `/nodes/pve-01` and `SDN.Use` on both bridges it attaches Talos VM NICs to.
  Authenticates with a password (`PROXMOX_PASSWORD`), not a token — `access.ts` never sets or reads that password, so it
  stays untouched by this stack.

No credential here can act outside `/pool/talos` on VM/LXC resources, `/access` on permission management, and none has
any privilege on the `core` pool (the platform LXCs this stack itself indirectly depends on via
`oci-registry`/`omni`/`o11y`).

## Bootstrapping

One-time setup before the first `pulumi up` against this stack:

> [!IMPORTANT]\
> **Credentials never go into Pulumi config, full stop — not even as `--secret`.** `pulumi config set --secret` still
> writes an encrypted blob into `pulumi/Pulumi.pve-01_core.live.yaml`, and that file is committed to git.
> Encrypted-at-rest is not the same as "safe to commit" — this project's rule is that no credential (password, API
> token, private key) ever lands in a git-tracked file, encrypted or not. Every credential below is supplied through an
> **environment variable, set for a single command and never exported into the shell session** — never through
> `pulumi config set`. Only non-sensitive connection details (`proxmox:endpoint`, `proxmox:insecure` — a URL and a
> boolean, not credentials) belong in Pulumi config, matching the existing `pbs:endpoint`/`pbs:insecure`/`truenas:url`
> convention.

1. **Authenticate as `root@pam` with a username/password, not an API token — mandatory, not optional.** Every other
   stack next to this one (`fleet/hosts/core.nas/`, `fleet/hosts/core.pbs/`) authenticates via a scoped API token, and
   that remains the default posture to aim for. This stack is the deliberate exception: `acme.ts`'s `AcmeAccount`
   resource manages Proxmox VE's `/cluster/acme/account` endpoint, which **hard-rejects API token authentication
   entirely** — confirmed live, `pulumi import`/`preview` fail with `Permission check failed (user != root@pam)` no
   matter how the token is scoped, even with `privsep` disabled (a token still authenticates as `root@pam!<tokenname>`,
   a different identity string than a real `root@pam` ticket/password session, which is what this endpoint specifically
   checks for). There is no ACL grant, role, or token configuration that works around this — a genuine password-based
   login is the only way any tool can manage this resource, Pulumi included. If ACME weren't in scope, a scoped token
   would be preferable and this whole requirement would go away; it's in scope because managing the Cloudflare DNS-01
   plugin without also managing the account it authenticates against doesn't accomplish anything (see `acme.ts`'s
   comment).

   > [!CAUTION]\
   > The `root@pam!pulumi-import` token on this host is **not** the read-only credential its name suggests: it holds
   > both `PVEAuditor` and `Administrator` at `/`, i.e. full cluster control including `Permissions.Modify` and
   > `User.Modify`. The `Administrator` grant was added while trying to get the ACME import to work, before it was
   > established that no token can reach those endpoints — it served no purpose and was never rolled back. Nothing in
   > this stack needs that token any more, since every operation authenticates as `root@pam` with a password. Revoke it,
   > or at minimum drop the `Administrator` ACL:
   >
   > ```sh
   > pveum user token remove root@pam pulumi-import                       # preferred
   > pveum acl delete / --tokens 'root@pam!pulumi-import' --roles Administrator  # minimum
   > ```

   Set the non-sensitive connection details in Pulumi config (safe to commit — a URL and a boolean, not credentials):

   ```sh
   pulumi config set proxmox:endpoint https://pve-01.pve.chezmoi.sh:8006/api2/json
   pulumi config set proxmox:insecure "true"   # self-signed cert, same as pbs:insecure
   ```

   Then supply the actual credential as an environment variable, scoped to the single command that needs it (see
   "Storing the root password securely" below for retrieving it from macOS Keychain without it ever touching shell
   history):

   ```sh
   PROXMOX_VE_USERNAME="root@pam" \
   PROXMOX_VE_PASSWORD="$(security find-generic-password -a root@pam -s pve-01.pve.chezmoi.sh -w)" \
     pulumi up
   ```

   `PROXMOX_VE_ENDPOINT` and `PROXMOX_VE_API_TOKEN` env vars also work as one-off overrides of the Pulumi-config values
   above — confirmed live (`PROXMOX_VE_API_TOKEN=... pulumi preview` authenticated correctly with the read-only import
   token, no config file touched) — but `PROXMOX_VE_USERNAME`/`PROXMOX_VE_PASSWORD` are the two that matter here, since
   they're what makes `AcmeAccount` reachable at all.

   `fleet/hosts/core.pbs/`'s provider accepts the same kind of username/password env-var pair as an alternative to an
   API token — nothing in that stack's current scope requires it (PBS has no equivalent root-only endpoint), but the
   option is deliberately kept available there too, documented in that stack's own README, for whenever a future
   PBS-side resource needs it. **That stack's current bootstrapping doc still shows
   `pulumi config set --secret pbs:apiToken` — a pre-existing pattern from before this credentials-never-in-git rule was
   established, not something newly introduced here. Flagged as a cleanup this repo still owes itself, not fixed in this
   change.**

   ### Storing the root password securely (macOS Keychain)

   `root@pam`'s password is a materially bigger secret than any scoped API token this project otherwise uses — never put
   it in shell history, a plaintext file, a Pulumi config value (secret or not), or an env var left `export`ed in a
   long-lived shell session. macOS's system Keychain is the right place for an operator running `pulumi up` from a Mac:
   encrypted at rest, unlockable only by the logged-in user, and the same mechanism macOS itself uses for WiFi and
   website passwords.

   **Store it once** (the `-U` flag updates an existing entry instead of erroring if one is already there; `-w` with no
   value prompts interactively — never pass the password as a `-w <value>` argument, which would land in shell history):

   ```sh
   security add-generic-password -a "root@pam" -s "pve-01.pve.chezmoi.sh" -U -w
   ```

   > [!WARNING]\
   > **`-w` must be the last argument, always.** `security`'s argument parser treats `-w` as taking a mandatory value,
   > and it isn't fussy about that value starting with a dash: `-w -U` silently stores the literal string `-U` as the
   > password — no prompt, no error, just a wrong secret sitting in the Keychain. Only when `-w` is the final token does
   > `security` fall back to a secure interactive prompt. Confirmed live: `-a ... -s ... -w -U` created an entry with
   > zero prompt. If you've ever run it in that order, delete and redo it:
   >
   > ```sh
   > security delete-generic-password -a "root@pam" -s "pve-01.pve.chezmoi.sh"
   > security add-generic-password -a "root@pam" -s "pve-01.pve.chezmoi.sh" -U -w
   > ```

   **Retrieve it straight into the command that needs it**, as a command-substitution inline in the env-var assignment
   shown in step 1 above — never assigned to a shell variable or `export`ed first, and never piped into
   `pulumi config set`. The value exists only for the duration of that one `pulumi up`/`preview` invocation.

   On a non-macOS machine, substitute the platform's equivalent (`pass`, `gopass`, a password manager's CLI, …) for the
   `security` invocation above — inlining the retrieval directly into the command's env-var assignment is what matters,
   not the specific keychain tool.

2. **Set the Cloudflare account/zone IDs** as secret config (`cloudflare_account_id`, `cloudflare_zone_id`), read by
   `acme.ts`. Each project that mints a Cloudflare token keeps its own copy in its own stack config, without
   `StackReference` (ADR-017).

   Also copy the `pveBackupTokenSecret` output of the `pbs-core` stack (`fleet/hosts/core.pbs/`) into this stack's
   secret config, read by `storage.ts`, through a pipe so that the secret never reaches the shell history:

   ```sh
   (cd ../../core.pbs/pulumi && pulumi stack output pveBackupTokenSecret --show-secrets) \
     | pulumi config set --secret pveBackupTokenSecret
   ```

   The two kubectl contexts the cluster bootstrap Secrets are written through (`rhodesAknKubernetesContext`,
   `lungmenAknKubernetesContext`) are plain values, already in `pulumi/Pulumi.pve-01_core.live.yaml`.

3. **Provide the PBS datastore's client-side encryption key** for `storage.ts`'s `StoragePbs` resource — the same key
   material documented in `fleet/hosts/core.pbs/README.md`, "Bootstrapping" step 6. Point `PVE_PBS_STORE_ENCRYPTION_KEY`
   at a local copy of the keyfile for the one apply that needs it:

   ```sh
   PVE_PBS_STORE_ENCRYPTION_KEY=/path/to/key pulumi up
   ```

   The value is applied once, at creation, and ignored afterwards (`ignoreChanges` in `storage.ts`) — a normal
   `pulumi up` with the env var unset shows no diff, so there's no reason to keep the key around between bootstrap runs.
   There is no Pulumi-config fallback for this by design — a credential this sensitive never gets an option that writes
   it to a git-tracked file.

4. **Import existing live resources** with zero recreation (see
   `docs/procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md` for the general
   procedure). Everything declared in `access.ts`, `sdn.ts`, `pools.ts` and `storage.ts`, plus `acme.ts`'s
   `AcmeAccount`, `AcmeDnsPlugin` and `AcmeCertificate`, already exists on `pve-01` — created by the manual recipes this
   stack replaces — and was imported rather than recreated. The three ACME imports require the username/password
   credential from step 1: they fail under an API token no matter how it is scoped, the same way `pulumi up` would.

   Genuinely new, not imported: the Cloudflare DNS-01 token in `acme.ts` (a deliberate rotation of the hand-configured
   one), `firewall.ts`'s `talos` Security Group (no Security Group was in use on this host before — see `firewall.ts`'s
   own comment for the state it replaces), and `rhodes-akn-bootstrap@pve` (its user, token, and `/access`-scoped ACL) —
   created specifically to let `rhodes.akn`'s own Pulumi program self-provision its Kubernetes CCM/CSI identity; no
   equivalent existed before that change.

5. **Run `pulumi up`** (see "Running Pulumi commands" below). The Cloudflare DNS-01 token in `acme.ts` rotates on first
   apply — the previously hand-configured long-lived token stops being used by the `cloudflare` ACME plugin at that
   point; revoke it in the Cloudflare dashboard once the apply succeeds.

## Adding a new identity or ACL binding

Follow `access.ts`'s per-identity block pattern: a `VirtualEnvironmentRole` (only if the built-in roles don't already
cover it), a `VirtualEnvironmentUser`, an optional `UserToken`, and one `Acl` per `(path, role)` grant. None of these
use the `parent` resource option — every import in this stack was done without a matching `--parent`, so a resource
declared with `parent` gets a different URN than what's in state and shows as a spurious delete+create; keep new
resources flat, matching the rest of the stack. Keep every grant scoped to the narrowest path that works (a resource
pool, a specific node) rather than `/`.

## Host files (`fs/`)

Files installed on the Proxmox VE nodes themselves, which are configured by hand (see
[`docs/reference/Infrastructure-Manuelle-Reference.md`](../../../docs/reference/Infrastructure-Manuelle-Reference.md)).
They live under `fs/` with a dot-encoded target directory, like the LXC appliances: `fs/etc.otelcol-contrib/config.yaml`
is installed as `/etc/otelcol-contrib/config.yaml`.

### OpenTelemetry Collector

Each node runs `otelcol-contrib` (official Debian package, version and checksum pinned in [`.mise.toml`](./.mise.toml)).
It ships the node to the o11y appliance (`data.o11y.chezmoi.sh:4318`, OTLP/HTTP):

- **Logs**: the systemd journal (`journald` receiver, cursor kept in `/var/lib/otelcol-contrib`), mapped like the LXC
  agents (`catalog/nix/modules/o11y-agent`): `MESSAGE` as the body, `SYSLOG_IDENTIFIER` as `service.name`, `PRIORITY` as
  the severity.
- **Metrics**: `hostmetrics` (CPU, load, memory, paging, processes, system, physical disks, filesystems, physical NICs
  and bridges), `service.name=hostmetrics`.

`host.name` is the node hostname (`pve-01`). The Proxmox VE API metrics (nodes, guests, storage) do not come from here:
the PVE OpenTelemetry metric server pushes them (`/etc/pve/status.cfg`).

This replaces `prometheus-node-exporter` and the rsyslog forwarding to the former `pve-exporter` LXC.

| File                                                            | Installed as                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `fs/etc.otelcol-contrib/config.yaml`                            | `/etc/otelcol-contrib/config.yaml`                            |
| `fs/etc.systemd.system.otelcol-contrib.service.d/override.conf` | `/etc/systemd/system/otelcol-contrib.service.d/override.conf` |

```sh
mise run host:otelcol:install -- pve-01.pve.chezmoi.sh   # package (first time, or after a version bump)
mise run host:otelcol:deploy  -- pve-01.pve.chezmoi.sh   # config + drop-in, validated on the node, then restart
```

Procedure:
[`INF-20261111-00-Installer-le-Collecteur-OpenTelemetry-sur-Proxmox.md`](../../../docs/procedures/infrastructure/INF-20261111-00-Installer-le-Collecteur-OpenTelemetry-sur-Proxmox.md).

### QEMU guest agent ping

`qemu-ga` (the `siderolabs/qemu-guest-agent` extension of the Talos VMs, 11.1.1 as of 2026-11) busy-loops at 100% of a
CPU when a reply stays stuck in its virtio-serial port: the host client went away before reading it, every `write()`
returns `EAGAIN` and the agent retries without waiting. It lasts until something reads the port again, which Proxmox
only does on demand (shutdown, backup, IP display). On 2026-11-14, 6 of the 7 Talos VMs had been spinning for weeks, ~6
cores of the host lost (signature: millions of `syscw` for a few KB of `wchar` in `/proc/<pid>/io`, fd on
`/dev/vportNpN`).

A `qm agent <vmid> ping` reads the pending data and stops the loop. `qga-ping` does the same every minute (systemd
timer) for every running VM with the agent enabled, so an occurrence costs at most a minute of CPU. It sends a
`guest-sync` straight to `/var/run/qemu-server/<vmid>.qga` and reads until its reply: `qm` starts a Perl interpreter per
call, ~50 s of CPU per run for ten VMs, against ~0.1 s this way. Only failures are logged (journal, then VictoriaLogs).

Remove it once the fix is in the extension: unmerged qemu-devel patch "qga: don't busy-loop writing to virtio-serial
when host disconnected" (2026-07), which waits for `POLLOUT` instead of retrying.

| File                                     | Installed as                           |
| ---------------------------------------- | -------------------------------------- |
| `fs/usr.local.sbin/qga-ping`             | `/usr/local/sbin/qga-ping`             |
| `fs/etc.systemd.system/qga-ping.service` | `/etc/systemd/system/qga-ping.service` |
| `fs/etc.systemd.system/qga-ping.timer`   | `/etc/systemd/system/qga-ping.timer`   |

```sh
mise run host:qga-ping:deploy -- pve-01.pve.chezmoi.sh   # script + units, one run, timer enabled
```

## Running Pulumi commands

```bash
cd fleet/hosts/core.pve-01/pulumi
mise run pulumi:diff     # Preview pending changes
mise run pulumi:apply    # Apply changes (requires confirmation)
pulumi stack             # Show current stack state
```

See `.agents/skills/` and `AGENTS.md` for commit and PR workflows.
