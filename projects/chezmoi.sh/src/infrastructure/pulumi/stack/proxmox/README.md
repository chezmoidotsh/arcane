# Proxmox VE (pve-01.pve.chezmoi.sh) as Code

This folder contains the Pulumi TypeScript stack that manages a narrow, deliberately scoped slice of
`pve-01.pve.chezmoi.sh` — the Proxmox VE host every cluster in this homelab runs on — as declarative code. It follows
the same bridged-provider pattern already established for [`../proxmox-backup-server/`](../proxmox-backup-server/) and
[`../truenas/`](../truenas/): [`@pulumi/proxmox`](../../../../../../catalog/pulumi/sdks/proxmox/), a Pulumi provider
dynamically bridged from the [`bpg/terraform-provider-proxmox`](https://github.com/bpg/terraform-provider-proxmox)
Terraform provider.

See
[docs/decisions/015-migrate-crossplane-to-pulumi.md](../../../../../../docs/decisions/015-migrate-crossplane-to-pulumi.md),
"Non-Goals" for why this scope is narrow: Proxmox VE's **VM/LXC lifecycle** stays fully manual — this stack manages
administrative config objects (ACLs, SDN, backup-storage registration, resource pools, ACME) that don't carry the
`Proxmox → hosts K8s → K8s manages Proxmox` trust-cycle risk that non-goal exists to block.

## What's managed here

| File/Folder   | Responsibility                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access.ts`   | Custom roles (`Exporter`, `KubernetesCCM`, `KubernetesCSI`, `OmniProvider`, `OmniProviderNode`), the `prometheus@pve`, `kubernetes-ccm@pve`, `kubernetes-csi@pve`, `omni@pve` service accounts, their API tokens, and every ACL binding |
| `sdn.ts`      | The `pvenet` SDN zone, `talosnet` VNet + subnet (shared node-traffic network for all Talos/Omni clusters), and the SDN apply step                                                                                                       |
| `pools.ts`    | The `core` and `talos` resource pools, and `talos`'s storage-level pool membership (`local`, `nvme-lvm`)                                                                                                                                |
| `storage.ts`  | Registers Proxmox VE's `pbs`-type storage entry against the datastore [`../proxmox-backup-server/`](../proxmox-backup-server/) manages                                                                                                  |
| `acme.ts`     | The node's ACME account (`default`) and Cloudflare DNS-01 plugin, plus the scoped Cloudflare token that plugin uses                                                                                                                     |
| `firewall.ts` | The `talos` cluster Security Group — a baseline firewall policy every Omni-managed Talos VM can opt into                                                                                                                                |

### Intentionally not managed via Pulumi

- **VM/LXC lifecycle** (create/modify/delete compute) — the actual trust-cycle risk
  `docs/decisions/015-migrate-crossplane-to-pulumi.md`'s Proxmox non-goal protects against. Structurally unreachable
  from this stack's code: no `VirtualEnvironmentVm`/`VirtualEnvironmentContainer`/`ClonedVm` import anywhere here, even
  though the bridged SDK exposes them.
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

Four service identities, each scoped to the minimum the manual `pveum`/`pvesh` recipes they replace actually granted
(see `docs/experiments/20260617-proxmox-csi-ccm/README.md` and
`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md`, "Proxmox user and role
setup" — the recipes this stack codifies):

- **`prometheus@pve`** — read-only cluster audit (`Exporter` role at `/`) for `pve-exporter` monitoring.
- **`kubernetes-ccm@pve`** — node/VM audit only, scoped to `/nodes/pve` and `/pool/talos`. No VM lifecycle privileges —
  the CCM only labels nodes and detects VM deletion, never creates or modifies VMs.
- **`kubernetes-csi@pve`** — VM/disk lifecycle scoped to `/pool/talos` only, for dynamic volume provisioning.
- **`omni@pve`** — the widest identity (VM allocate/clone/config/power), still scoped to `/pool/talos` plus
  `Sys.AccessNetwork`/`Sys.Audit` on `/nodes/pve-01` and `SDN.Use` on both bridges it attaches Talos VM NICs to.
  Authenticates with a password (`PROXMOX_PASSWORD`), not a token — `access.ts` never sets or reads that password, so it
  stays untouched by this stack.

No credential here can act outside `/pool/talos` on VM/LXC resources, and none has any privilege on the `core` pool (the
platform LXCs this stack itself indirectly depends on via `oci-registry`/`omni`/`o11y`).

## Bootstrapping

One-time setup before the first `pulumi up` against this stack:

> [!IMPORTANT] **Credentials never go into Pulumi config, full stop — not even as `--secret`.**
> `pulumi config set --secret` still writes an encrypted blob into `Pulumi.chezmoi_sh.live.yaml`, and that file is
> committed to git. Encrypted-at-rest is not the same as "safe to commit" — this project's rule is that no credential
> (password, API token, private key) ever lands in a git-tracked file, encrypted or not. Every credential below is
> supplied through an **environment variable, set for a single command and never exported into the shell session** —
> never through `pulumi config set`. Only non-sensitive connection details (`proxmox:endpoint`, `proxmox:insecure` — a
> URL and a boolean, not credentials) belong in Pulumi config, matching the existing
> `pbs:endpoint`/`pbs:insecure`/`truenas:url` convention.

1. **Authenticate as `root@pam` with a username/password, not an API token — mandatory, not optional.** Every other
   stack in this project (`../proxmox-backup-server/`, `../truenas/`) authenticates via a scoped API token, and that
   remains the default posture to aim for. This stack is the deliberate exception: `acme.ts`'s `AcmeAccount` resource
   manages Proxmox VE's `/cluster/acme/account` endpoint, which **hard-rejects API token authentication entirely** —
   confirmed live, `pulumi import`/`preview` fail with `Permission check failed (user != root@pam)` no matter how the
   token is scoped, even with `privsep` disabled (a token still authenticates as `root@pam!<tokenname>`, a different
   identity string than a real `root@pam` ticket/password session, which is what this endpoint specifically checks for).
   There is no ACL grant, role, or token configuration that works around this — a genuine password-based login is the
   only way any tool can manage this resource, Pulumi included. If ACME weren't in scope, a scoped token would be
   preferable and this whole requirement would go away; it's in scope because managing the Cloudflare DNS-01 plugin
   without also managing the account it authenticates against doesn't accomplish anything (see `acme.ts`'s comment).

   > [!CAUTION] The `root@pam!pulumi-import` token on this host is **not** the read-only credential its name suggests:
   > it holds both `PVEAuditor` and `Administrator` at `/`, i.e. full cluster control including `Permissions.Modify` and
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

   `../proxmox-backup-server/`'s provider accepts the same kind of username/password env-var pair as an alternative to
   an API token — nothing in that stack's current scope requires it (PBS has no equivalent root-only endpoint), but the
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

   > [!WARNING] **`-w` must be the last argument, always.** `security`'s argument parser treats `-w` as taking a
   > mandatory value, and it isn't fussy about that value starting with a dash: `-w -U` silently stores the literal
   > string `-U` as the password — no prompt, no error, just a wrong secret sitting in the Keychain. Only when `-w` is
   > the final token does `security` fall back to a secure interactive prompt. Confirmed live: `-a ... -s ... -w -U`
   > created an entry with zero prompt. If you've ever run it in that order, delete and redo it:
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

2. **Copy the shared Slack webhook URL and Cloudflare account/zone IDs** — already configured as project-level secret
   config (`cloudflare_account_id`, `cloudflare_zone_id`), reused as-is by `acme.ts`. Nothing to do here if
   `../proxmox-backup-server/`'s bootstrapping already ran.

3. **Provide the PBS datastore's client-side encryption key** for `storage.ts`'s `StoragePbs` resource — the same key
   material documented in `../proxmox-backup-server/README.md`, "Bootstrapping" step 6. Point
   `PVE_PBS_STORE_ENCRYPTION_KEY` at a local copy of the keyfile for the one apply that needs it:

   ```sh
   PVE_PBS_STORE_ENCRYPTION_KEY=/path/to/key pulumi up
   ```

   The value is applied once, at creation, and ignored afterwards (`ignoreChanges` in `storage.ts`) — a normal
   `pulumi up` with the env var unset shows no diff, so there's no reason to keep the key around between bootstrap runs.
   There is no Pulumi-config fallback for this by design — a credential this sensitive never gets an option that writes
   it to a git-tracked file.

4. **Import existing live resources** with zero recreation (see
   `docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md` for the general procedure). Everything
   declared in `access.ts`, `sdn.ts`, `pools.ts` and `storage.ts`, plus `acme.ts`'s `AcmeAccount`, `AcmeDnsPlugin` and
   `AcmeCertificate`, already exists on `pve-01` — created by the manual recipes this stack replaces — and was imported
   rather than recreated. The three ACME imports require the username/password credential from step 1: they fail under
   an API token no matter how it is scoped, the same way `pulumi up` would.

   Only two things are genuinely new: the Cloudflare DNS-01 token in `acme.ts` (a deliberate rotation of the
   hand-configured one) and `firewall.ts`'s `talos` Security Group — no Security Group was in use on this host before
   (see `firewall.ts`'s own comment for the state it replaces).

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

## Running Pulumi commands

```bash
cd projects/chezmoi.sh/src/infrastructure/pulumi
mise run pulumi:diff     # Preview pending changes
mise run pulumi:apply    # Apply changes (requires confirmation)
pulumi stack             # Show current stack state
```

See `.agents/skills/` and `AGENTS.md` for commit and PR workflows.
