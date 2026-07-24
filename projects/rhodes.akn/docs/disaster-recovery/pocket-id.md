# Pocket-Id Disaster Recovery

This document covers restoring Pocket-Id's state onto a **new** Kubernetes cluster after the cluster that hosted it
(`rhodes.akn`) has been lost and rebuilt from scratch. It assumes the new cluster already exists through CNI/CSI/CCM and
the CNPG operator + `barman-cloud.cloudnative-pg.io` plugin — see
[OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md). ArgoCD is **not**
assumed to exist yet, so every step below is a manual `kubectl apply`.

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
`mise install` from `projects/rhodes.akn/docs/disaster-recovery/` to provision `s3cmd` (the other three are already
global via this repo's root `.mise.toml`) and to get the `dr:pocket-id:*` convenience tasks referenced below.

You must also have:

- The new cluster up through CNI/CSI/CCM and the CNPG operator + `barman-cloud.cloudnative-pg.io` plugin (see
  [OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)). No ArgoCD, no ESO,
  and no OpenBao required — Pocket-Id's secrets are SOPS-committed directly, not sourced from Vault.
- A valid `SOPS_AGE_KEY_FILE` (via `mise install` / this repo's environment) to decrypt the `pocket-id/sops/` secrets.
- If passkey login needs to be verified end to end (Step 4), the Gateway and a valid TLS certificate for
  `auth.chezmoi.sh` — see the callout above.

## Required inputs

- `CLUSTER_CONTEXT`: kubectl context for the new cluster (e.g., `admin@rhodes.akn`).

---

## Step 1 — Restore the `pocket-id` namespace's SOPS secrets

> [!TIP]
>
> `mise run dr:pocket-id:secrets -- <CLUSTER_CONTEXT>` runs both commands below in one call.

```sh
kubectl --context <CLUSTER_CONTEXT> create namespace pocket-id \
  --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply -f -

# Decrypt and apply: cnpg-backup-credentials, the Pocket-Id app secret, and the
# CNPG role password secret
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/apps/pocket-id/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
```

```sh
# Verify
kubectl --context <CLUSTER_CONTEXT> get secrets -n pocket-id
# → cnpg-backup-credentials, pocket-id-secrets, pocket-id-database-pocket-id present
```

## Step 2 — Restore the Pocket-Id CNPG cluster

> [!TIP]
>
> `mise run dr:pocket-id:backup:latest -- <CLUSTER_CONTEXT>` prints the latest `serverName`, and
> `mise run dr:pocket-id:patch-recovery -- <SERVER_NAME>` writes it into `pocket-id.postgresql.yaml` — it edits the file
> only, it does not `kubectl apply` anything.

Follow [DB-20260723-00](../../../../docs/procedures/databases/DB-20260723-00.cnpg-restore-from-object-store.md) in full,
with:

- `NAMESPACE=pocket-id`
- `CLUSTER_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/pocket-id.postgresql.yaml`
- `OBJECTSTORE_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/pocket-id.postgresql-objectstore.yaml`
- `SCHEDULEDBACKUP_MANIFEST=projects/rhodes.akn/src/apps/pocket-id/pocket-id.postgresql-backup.yaml`

> [!NOTE]
>
> The cluster name (`pocket-id-20260530`) embeds a generation suffix that changes whenever this cluster is recreated —
> the same pattern the `cnpg-backup` skill's discovery script accounts for. Confirm the current name in
> `projects/rhodes.akn/src/apps/pocket-id/pocket-id.postgresql.yaml` rather than assuming this exact value still
> applies.

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

Otherwise, a port-forward confirms the app itself is healthy (but not passkey login — see the callout above):

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

- [DB-20260723-00: Restore a CNPG cluster from its S3 object-store backup](../../../../docs/procedures/databases/DB-20260723-00.cnpg-restore-from-object-store.md)
  — the CNPG restore mechanics used in Step 2
- [OpenBao Disaster Recovery](openbao.md) — the reverse dependency (OpenBao admin recovery needs this document done
  first, and its Step 5 Option B is where the SSO round-trip into OpenBao is actually verified)

## History

- _2026-07-23_: Initial creation, ahead of any actual need — written alongside `openbao.md` as part of a proactive DR
  exercise before the amiya.akn → rhodes.akn migration.
- _2026-07-24_: Peer review pass — fixed `id.chezmoi.sh` → `auth.chezmoi.sh` (wrong hostname), added the Gateway/
  cert-manager/passkey dependency callout, removed the OpenBao-SSO verification step (out of scope for this document,
  covered in `openbao.md` instead), added `pocket-id:*` mise tasks for Steps 1-2, linked cross-references throughout.
- _2026-07-24_: GitHub Copilot PR review — unescaped `\[!TYPE]` callout markers so they actually render as GitHub
  alerts, fixed the Step 1 verification comment (`pocket-id-secrets`, not "pocket-id secret" — matches the real secret
  name in `sops/pocket-id.secret.yaml`).
