# Pocket-Id Disaster Recovery

This document covers restoring Pocket-Id's state onto a **new** Kubernetes cluster after the cluster that hosted it
(`rhodes.akn`) has been lost and rebuilt from scratch — see [docs/disaster-recovery/README.md](README.md) for
prerequisites and where this fits in the full recovery chain.

Unlike [OpenBao Disaster Recovery](openbao.md), this one is genuinely simple: Pocket-Id has no HSM, no seal to unseal,
and no admin-access chicken-and-egg — restore its database and its app secret, and it serves logins again. It's still
worth its own document because **OpenBao's own admin-recovery path (Option B in `openbao.md` Step 5) depends on
Pocket-Id being reachable** — if both instances are being restored together after a full cluster loss, restore Pocket-Id
first, or at least in parallel, rather than after OpenBao.

> [!IMPORTANT]
>
> Pocket-Id requires the Gateway and a valid TLS certificate (cert-manager) to be serving `auth.chezmoi.sh` before it is
> usable end to end: passkeys (WebAuthn) require a "secure context," i.e. HTTPS, and will not register or authenticate
> over plain HTTP or a port-forward. If the Gateway/cert-manager aren't up yet on the new cluster, Step 4's reachability
> check will pass over a port-forward, but passkey login will not work until HTTPS is live — plan accordingly if this is
> blocking OpenBao's Option B (see `openbao.md`).

## Prerequisites

Before starting, ensure the following tools are installed and configured: `kubectl`, `s3cmd`, `kustomize`, `ksops`. Run
`mise install` from `projects/rhodes.akn/` to provision all of them, and from this folder specifically to get the
`dr:pocket-id:*` convenience tasks referenced below.

You must also have:

- The new cluster up through CNI/CSI/CCM (see
  [OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)) and the CNPG
  operator + `barman-cloud.cloudnative-pg.io` plugin and ESO deployed (see [docs/disaster-recovery/README.md](README.md)
  Step 2). No ArgoCD and no OpenBao required — none of Pocket-Id's own secrets are sourced from the real Vault, only
  from ESO's local `Generator` and this repo's Pulumi stack (see Step 1).
- A valid `SOPS_AGE_KEY_FILE` (via `mise install` / this repo's environment) to decrypt the `pocket-id/sops/` secrets.
- Access to the `rhodes.akn` Pulumi stack (`pulumi login`, correct stack selected) — needed for the S3 backup
  credentials in Step 1.
- If passkey login needs to be verified end to end (Step 4), the Gateway and a valid TLS certificate for
  `auth.chezmoi.sh` — see the callout above.

## Required inputs

- `CLUSTER_CONTEXT`: kubectl context for the new cluster (e.g., `admin@rhodes.akn`).

---

## Step 1 — Restore the `pocket-id` namespace's bootstrap secrets

The `pocket-id` namespace and `cnpg-backup-credentials` already exist ([README.md](README.md) Step 3). Two secrets left,
neither from Vault (Pocket-Id has no Vault dependency by design — see the intro above):

```sh
# pocket-id-secrets: the one secret that must stay SOPS-committed (the app's own
# config secret — see sops/config.secret.yaml)
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/apps/pocket-id/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -

# pocket-id-database-pocket-id: generated locally by an ESO Generator, no Vault
# involved — requires ESO already deployed (see docs/disaster-recovery/README.md
# Step 2, done before this document)
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/src/apps/pocket-id/database.externalsecret.yaml
```

```sh
# Verify all three landed
kubectl --context <CLUSTER_CONTEXT> get secrets -n pocket-id
# → pocket-id-secrets, cnpg-backup-credentials, pocket-id-database-pocket-id present
```

## Step 2 — Restore the Pocket-Id CNPG cluster

> [!TIP]
>
> `mise run dr:pocket-id:backup:latest -- <CLUSTER_CONTEXT>` prints the latest `serverName`, and
> `mise run dr:pocket-id:patch-recovery -- <SERVER_NAME>` writes it into `cnpg.cluster.yaml` — it edits the file only,
> it does not `kubectl apply` anything.

Follow [BKP-20260723-00](../../../../docs/procedures/backups/BKP-20260723-00.cnpg-restore-from-object-store.md) in full,
with:

- `NAMESPACE=pocket-id`
- `CLUSTER_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml`
- `OBJECTSTORE_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/cnpg.objectstore.yaml`
- `SCHEDULEDBACKUP_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/cnpg.scheduledbackup.yaml`

> [!NOTE]
>
> The cluster name (`pocket-id-20260530`) embeds a generation suffix that changes whenever this cluster is recreated —
> the same pattern the `cnpg-backup` skill's discovery script accounts for. Confirm the current name in
> `projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml` rather than assuming this exact value still applies.

Return here once that procedure's Quick verifications pass (`Cluster in healthy state`).

## Step 3 — Apply the rest of the pocket-id app

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/apps/pocket-id/
```

```sh
kubectl --context <CLUSTER_CONTEXT> get pods -n pocket-id -w
# → pocket-id-server pod Running
```

## Step 4 — Verify Pocket-Id itself is serving logins

If the Gateway and a valid certificate for `auth.chezmoi.sh` are already up:

```sh
curl -sI https://auth.chezmoi.sh/ | head -1
# → HTTP/2 200 (or a redirect to the login page)
```

To validate passkey login specifically, prefer
[README.md's `/etc/hosts` override](README.md#between-steps-6-and-9---validate-over-real-https-via-etchosts-optional)
instead — a port-forward confirms the app itself is healthy, but not passkey login (see the callout above):

```sh
kubectl --context <CLUSTER_CONTEXT> port-forward -n pocket-id svc/pocket-id 8080:80 &
curl -sI http://localhost:8080/ | head -1
# → HTTP/1.1 200 (or a redirect to the login page)
```

This confirms Pocket-Id's own database and app secret are correctly restored — its login UI, user accounts, and OIDC
client registrations all live in the CNPG database restored in Step 2. Verifying the actual SSO round-trip into OpenBao
(as a consumer of Pocket-Id, not a property of Pocket-Id itself) is covered in [openbao.md](openbao.md) Step 5 Option B
— not repeated here.

---

## Quick verifications

- **CNPG cluster healthy**: `kubectl --context <CTX> get cluster pocket-id-<gen> -n pocket-id` →
  `Cluster in healthy state`
- **Pod running**: `kubectl --context <CTX> get pods -n pocket-id` → `Running`
- **HTTP reachable**: `curl -sI https://auth.chezmoi.sh/` → `200`/redirect, not a connection error
- **Passkey login** (requires Gateway + valid cert — see the callout above): a full login flow succeeds, not just the
  HTTP check

## References

- [BKP-20260723-00: Restore a CNPG cluster from its S3 object-store backup](../../../../docs/procedures/backups/BKP-20260723-00.cnpg-restore-from-object-store.md)
  — the CNPG restore mechanics used in Step 2
- [OpenBao Disaster Recovery](openbao.md) — the reverse dependency (OpenBao admin recovery needs this document done
  first, and its Step 5 Option B is where the SSO round-trip into OpenBao is actually verified)

## History

- _2026-07-23_: Initial creation, ahead of any actual need — written alongside `openbao.md`, proactive DR exercise
  before the amiya.akn → rhodes.akn migration.
- _2026-07-24_: Peer review — fixed the hostname (`id.` → `auth.chezmoi.sh`), added the Gateway/passkey dependency
  callout, dropped the out-of-scope OpenBao-SSO step, added `pocket-id:*` mise tasks, fixed callout markers and the Step
  1 verification comment.
- _2026-07-25_: Moved Pocket-Id's own CNPG role password and S3 backup credentials off SOPS — the former to a local ESO
  `Generator`, the latter to a direct Pulumi-managed `Secret` — neither ever sourced from the real Vault, only their
  origin changed. Reordered Step 1 accordingly; requires ESO deployed first.
- _2026-07-26_: Moved the `pocket-id` namespace creation and `pulumi up` call out of Step 1 — both now happen once, for
  this document and `openbao.md`, in `README.md`'s Step 3.
- _2026-07-26_ (review follow-up): Trimmed the intro to a single sentence pointing at `README.md`. Removed the
  `dr:pocket-id:secrets` mise task — two commands, not worth a wrapper.
- _2026-07-30_: Pointed Step 4's passkey validation at README.md's new `/etc/hosts` override section instead of only the
  port-forward fallback, since the latter can't validate passkey login at all (no secure context).
