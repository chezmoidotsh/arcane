# OpenBao Disaster Recovery

This document covers restoring OpenBao's state onto a **new** Kubernetes cluster after the cluster that hosted it
(`rhodes.akn`) has been lost and rebuilt from scratch. It assumes the new cluster already exists through CNI/CSI/CCM,
the CNPG operator + `barman-cloud.cloudnative-pg.io` plugin, and External Secrets Operator — see
[OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md). ArgoCD is **not**
assumed to exist yet: per `rhodes.akn`'s bring-up order, ArgoCD bootstraps last, so every step below is a manual
`kubectl apply`, not a GitOps sync.

OpenBao backs every other cluster's secret delivery
([ADR-002](../../../../docs/decisions/002-openbao-secrets-topology.md),
[ADR-003](../../../../docs/decisions/003-openbao-path-naming-conventions.md),
[ADR-004](../../../../docs/decisions/004-openbao-policy-naming-conventions.md)) and Vault UI/CLI admin access for the
whole homelab — of every disaster-recovery procedure in this repo, this is one of the highest-blast-radius (Pocket-Id,
its only peer in that respect, is covered separately). Read it end to end before running anything.

This document covers restoring a **previously-initialized** instance whose storage (all mounts, policies, roles, auth
backends, secrets) is restored from backup and arrives already configured — there is no `bao operator init`, no
`bao auth enable` here, both already happened on the source instance and are baked into the data being restored. What
this document solves is **regaining admin access** to that already-configured instance without a root token.

## Technical framework and conventions

- **Storage backend is PostgreSQL, not Raft.** `storage "postgresql"` in `openbao-config.externalsecret.yaml` — the CNPG
  cluster `openbao-database` **is** Vault's data. Restoring that Postgres cluster from its S3 backup restores every
  mount, policy, role, and auth backend exactly as they were, with no need to re-run Pulumi's `cluster-vault` component
  — this holds even though the Kubernetes auth backends' trust config is cluster-specific, because of the self-heal
  behavior described below, not in spite of it.
- **Auto-unseal is PKCS#11 via SoftHSM**, not Shamir. The token + PIN are SOPS-encrypted in git
  (`openbao-softhsm-tokens.secret.yaml`) — this is the second, and only other, piece of state needed to bring OpenBao
  back. **If this secret is ever lost, the restored Postgres data can never be decrypted again** — there is no fallback;
  the instance would have to be reinitialized from empty, discarding all data.
- **No root token and no recovery keys are held for this instance.** Two admin-recovery paths exist instead of the usual
  `bao operator generate-root` ceremony (which requires recovery key shares this instance's operators do not have):
  1. **Pocket-Id SSO**, logging in as a member of the `admin` OIDC group → binds `sso-admin-policy` (`stack/vault.ts`),
     which grants `path "*"` except seal/unseal, replication, rekey/rotate, and the root-token endpoint —
     root-equivalent for virtually every practical recovery action. Depends on Pocket-Id itself being reachable — see
     `projects/rhodes.akn/docs/disaster-recovery/pocket-id.md`.
  2. **The `dr-recovery-admin-token`** — a Pulumi-managed break-glass token (`stack/vault.ts`, same `sso-admin-policy`,
     `noParent: true`, `ttl: 8760h`), recreated on roughly a 6-month cadence via a rotation trigger. It is independent
     of the cluster and of Pocket-Id entirely — retrievable from Pulumi state (Garage S3) alone.

  > [!WARNING]
  >
  > **If both paths are unavailable** (Pocket-Id also unrecoverable, and the break-glass token expired with no
  > `pulumi up` having run in over a year), Vault admin access is **unrecoverable** short of a full `bao operator init`,
  > which destroys all existing data. This is a known, accepted gap for this instance, not something this procedure
  > closes — see Known issues.

- **Kubernetes auth backends should self-heal, but this is unverified in practice.** Both the `kubernetes/` backend
  (used for the Pulumi Vault provider's own authentication) and the `rhodes.akn` ESO backend are configured via the
  `ClusterVaultComponent` "Local" variant (`catalog/pulumi/components/cluster-vault/src/index.ts`), which never sets
  `disableLocalCaJwt` — it defaults to `false`, meaning OpenBao re-derives the reviewer JWT and CA live from its own
  pod's mounted ServiceAccount on every login request, rather than trusting a value pinned in storage. In theory this
  means both backends work again automatically on the new cluster with **no manual `auth/kubernetes/config` edit**, as
  long as the `system:auth-delegator` ClusterRoleBinding and the `openbao` ServiceAccount are (re)applied (Step 3 does
  this).

  > [!IMPORTANT]
  >
  > This is the expected behavior per the code, **not a guarantee** — it has not yet been observed against an actual
  > cluster recreation. Confirm it during Step 6, and if it fails, do not assume the fallback is "reconfigure by hand
  > and move on" without understanding why the self-heal didn't happen. Tracked in
  > [chezmoidotsh/arcane#1138](https://github.com/chezmoidotsh/arcane/issues/1138) — validate on the first real drill.

## Prerequisites

Before starting, ensure the following tools are installed and configured: `kubectl`, `s3cmd`, `kustomize`, `ksops`. Run
`mise install` from `projects/rhodes.akn/docs/disaster-recovery/` to provision `s3cmd` (the other three are already
global via this repo's root `.mise.toml`) and to get the `dr:openbao:*` convenience tasks referenced below.

You must also have:

- The new cluster up through CNI/CSI/CCM, CNPG operator + `barman-cloud.cloudnative-pg.io` plugin, and ESO (see
  [OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)). No ArgoCD required.
- `kubectl` access to the new cluster with permission to create namespaces and manage resources cluster-wide (RBAC
  bindings are part of what's restored) — configured per `OMNI-20260721-00`'s kubeconfig retrieval step.
- `s3cmd`, `kustomize`, `ksops` on PATH — all provisioned by `mise install` from this folder's own `.mise.toml` (`s3cmd`
  needs no config file; credentials are passed as flags in each command below). `kustomize` and `ksops` need no
  configuration either.
- A valid `SOPS_AGE_KEY_FILE` (via `mise install` / this repo's environment) to decrypt the `vault/sops/` secrets.
- **Either** Pocket-Id already restored and reachable (`projects/rhodes.akn/docs/disaster-recovery/pocket-id.md`),
  **or** access to the `rhodes.akn` Pulumi stack (`pulumi login`, correct stack selected) to retrieve the break-glass
  token — you need at least one of these for Step 5, and **Option B (Pocket-Id) additionally requires the Gateway and a
  valid TLS certificate to be up** (see the callout in Step 5).

## Required inputs

- `CLUSTER_CONTEXT`: kubectl context for the new cluster (e.g., `admin@rhodes.akn`).

---

## Step 1 — Restore the `vault` namespace's SOPS secrets

> [!TIP]
>
> `mise run dr:openbao:secrets -- <CLUSTER_CONTEXT>` runs both commands below in one call.

```sh
# Namespace isn't created by any manifest in this app — create it first
kubectl --context <CLUSTER_CONTEXT> create namespace vault \
  --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply -f -

# Decrypt and apply: cnpg-backup-credentials, openbao-softhsm-tokens, openbao-database-credentials
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/apps/vault/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
```

```sh
# Verify all three landed
kubectl --context <CLUSTER_CONTEXT> get secrets -n vault
# → cnpg-backup-credentials, openbao-softhsm-tokens, openbao-database-credentials present
```

> [!IMPORTANT]
>
> If `openbao-softhsm-tokens` fails to decrypt (wrong/missing `SOPS_AGE_KEY_FILE`), stop here. Nothing past this point
> works without it, and there is no fallback (see [Technical framework](#technical-framework-and-conventions) above).

## Step 2 — Restore the `openbao-database` CNPG cluster

> [!TIP]
>
> `mise run dr:openbao:backup:latest -- <CLUSTER_CONTEXT>` prints the latest `serverName` (Steps 1-2 of the procedure
> below), and `mise run dr:openbao:patch-recovery -- <SERVER_NAME>` writes it into `openbao.postgresql.yaml` (Step 3) —
> it edits the file only, it does not `kubectl apply` anything. Both wrap the manual steps; use whichever you trust more
> mid-incident.

Follow [DB-20260723-00](../../../../docs/procedures/databases/DB-20260723-00.cnpg-restore-from-object-store.md) in full,
with:

- `NAMESPACE=vault`
- `CLUSTER_MANIFEST=projects/rhodes.akn/src/apps/vault/openbao.postgresql.yaml`
- `OBJECTSTORE_MANIFEST=projects/rhodes.akn/src/apps/vault/openbao.postgresql-objectstore.yaml`
- `SCHEDULEDBACKUP_MANIFEST=projects/rhodes.akn/src/apps/vault/openbao.postgresql-backup.yaml`

Return here once that procedure's Quick verifications pass (`Cluster in healthy state`).

## Step 3 — Apply the rest of the vault app

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/apps/vault/
```

This applies the OpenBao `StatefulSet`, the `openbao` `ServiceAccount` and `system:auth-delegator` `ClusterRoleBinding`,
the `openbao-config` `ExternalSecret` + local `SecretStore`, `Service`s, and the `HTTPRoute`.

```sh
# Watch the pod come up
kubectl --context <CLUSTER_CONTEXT> get pods -n vault -w
```

## Step 4 — Verify auto-unseal

```sh
POD=$(kubectl --context <CLUSTER_CONTEXT> get pods -n vault -l app.kubernetes.io/name=vault \
  -o jsonpath='{.items[0].metadata.name}')

kubectl --context <CLUSTER_CONTEXT> exec -n vault "$POD" -- bao status -tls-skip-verify
# → Sealed: false
# → Storage Type: postgresql
```

`Sealed: false` confirms two things at once: the restored Postgres data is intact and reachable, and the SoftHSM
token/PIN restored in Step 1 correctly decrypts it via PKCS#11 auto-unseal.

> [!WARNING]
>
> If `Sealed: true` or the pod is crash-looping, stop and diagnose before proceeding — do not attempt any of the
> admin-recovery steps below against a sealed instance. Check `kubectl logs` on the `openbao` container first; a
> mismatch between the restored Postgres data and the restored SoftHSM token (e.g. secrets from two different
> source-instance snapshots) is the most likely cause.

## Step 5 — Regain admin access

Pick whichever of the two paths from Technical framework is available:

**Option A — break-glass Pulumi token (no dependency on Pocket-Id, no dependency on the Gateway):**

```sh
cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi stack output drRecoveryAdminTokenValue --show-secrets
```

At this point in a real recovery, the Gateway and a valid TLS certificate are unlikely to be up yet (ArgoCD hasn't
bootstrapped, cert-manager may not have issued anything). Reach OpenBao directly instead of through `vault.chezmoi.sh`:

```sh
kubectl --context <CLUSTER_CONTEXT> port-forward -n vault svc/openbao 8200:8200 &

export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN="<value from above>"
bao token lookup   # → confirms the token is valid and shows its policies
```

Once the Gateway and a valid certificate are confirmed up (see Known issues / regular operation), `VAULT_ADDR` can
switch to `https://vault.chezmoi.sh`.

**Option B — Pocket-Id SSO (requires `projects/rhodes.akn/docs/disaster-recovery/pocket-id.md` already done):**

> [!IMPORTANT]
>
> Unlike Option A, this path is **not** available until the Gateway and a valid TLS certificate are serving
> `vault.chezmoi.sh`. Pocket-Id's OIDC device-flow login requires HTTPS — there is no port-forward equivalent for it. If
> the Gateway/cert-manager aren't up yet, use Option A first, even if Pocket-Id itself is already restored.

Log into the OpenBao UI (`https://vault.chezmoi.sh/ui`) via the Pocket-Id OIDC method, as a user in the `admin` OIDC
group. This binds `sso-admin-policy` automatically — no CLI steps needed beyond a normal SSO login.

## Step 6 — Verify Kubernetes auth backends self-healed

With admin access from Step 5, confirm ESO can authenticate through the `rhodes.akn` backend without any manual
reconfiguration:

```sh
# Once ESO is deployed and a SecretStore/ExternalSecret exists for this cluster:
kubectl --context <CLUSTER_CONTEXT> get externalsecret -A
# → SecretSyncedError should clear within one refresh interval; if it persists,
#   auth/kubernetes/config did NOT self-heal as expected — see the callout in
#   Technical framework and reconfigure manually:
#   bao write auth/rhodes.akn/config kubernetes_host="https://kubernetes.default.svc.cluster.local" disable_local_ca_jwt=false
```

If this is the first time this procedure has ever been run for real, record the outcome (worked automatically, or needed
a manual `bao write auth/<path>/config ...`) in this document's [History](#history) section — this closes the open
verification flagged in Technical framework for the next operator.

---

## Quick verifications

- **CNPG cluster healthy**: `kubectl --context <CTX> get cluster openbao-database -n vault` → `Cluster in healthy state`
- **Unsealed**: `bao status -tls-skip-verify` (via `kubectl exec`) → `Sealed: false`
- **Admin access**: `bao token lookup` (Option A) or a successful OIDC login (Option B)
- **Kubernetes auth**: ESO `ExternalSecret`s across the cluster report `SecretSynced`, not `SecretSyncedError`
- **UI reachable**: `https://vault.chezmoi.sh/ui` loads and shows the unsealed/unauthenticated login screen

## Known issues

### No fallback if both admin-recovery paths fail

Neither the root token nor recovery keys are held for this instance. If Pocket-Id cannot be restored (see its own
disaster recovery doc) **and** the break-glass Pulumi token has expired with no `pulumi up` run in the preceding year,
there is no way to authenticate as an admin to the restored OpenBao. The only remaining option is a full
`bao operator init` against empty storage, which discards every secret, policy, and role this instance holds for every
downstream cluster. Mitigate by periodically exercising this document as an actual drill (not just reading it), which
exercises both recovery paths and catches an expired break-glass token before it's needed for real.

### Recovery keys were never generated for this instance

Because no recovery keys exist, neither `bao operator generate-root` nor `bao operator rekey -target=recovery` can ever
be used on this instance — both require providing a threshold of the _existing_ recovery keys as authorization, which is
a Shamir-style ceremony, not an ACL-gated one; a privileged token (even `sso-admin-policy`) cannot substitute for it.
This was a deliberate trade-off in favor of the two paths in Step 5, not an oversight, but it is worth revisiting if
this instance's operators ever change.

## References

- [DB-20260723-00: Restore a CNPG cluster from its S3 object-store backup](../../../../docs/procedures/databases/DB-20260723-00.cnpg-restore-from-object-store.md)
  — the CNPG restore mechanics used in Step 2
- [Pocket-Id Disaster Recovery](pocket-id.md) — the SSO admin-recovery dependency in Step 5, Option B
- [ADR-002: OpenBao Secrets Mount Topology and Organizational Structure](../../../../docs/decisions/002-openbao-secrets-topology.md),
  [ADR-003: OpenBao Path and Naming Conventions](../../../../docs/decisions/003-openbao-path-naming-conventions.md),
  [ADR-004: OpenBao Policy Naming and Scope Conventions](../../../../docs/decisions/004-openbao-policy-naming-conventions.md)
  — the conventions this instance's mounts/policies follow
- [`@chezmoi.sh/pulumi-cluster-vault`](../../../../catalog/pulumi/components/cluster-vault/README.md) — the component
  that provisions the KV mount, auth backend, and ESO role restored in Step 2
- [OMNI-20260721-00: Talos cluster bring-up on Proxmox](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)
  — the cluster-shell prerequisite for this document

## History

- _2026-07-23_: Initial creation, ahead of any actual need — written as a proactive DR exercise before the amiya.akn →
  rhodes.akn migration, to surface gaps (no recovery keys, no root token) before they matter in a real incident. Steps 5
  and 6 have not yet been exercised against a real cluster recreation.
- _2026-07-24_: Peer review pass — fixed the SSO hostname reference, added the Gateway/TLS dependency callouts and a
  port-forward path for Option A/Step 4 (Gateway/cert-manager may not be up yet at this point in a real recovery), added
  `openbao:*` mise tasks for the mechanical parts of Steps 1-2, linked cross-references throughout.
- _2026-07-24_: GitHub Copilot PR review — unescaped `\[!TYPE]` callout markers so they actually render as GitHub
  alerts.
