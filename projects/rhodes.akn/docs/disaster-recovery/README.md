# Rhodes·AKN Disaster Recovery

This document is the entry point for recovering `rhodes.akn` end to end after the cluster that hosts it has been lost
and rebuilt from scratch. It ties together the cluster-level bring-up (Omni) with the two component-specific procedures
that live alongside it in this folder — [OpenBao Disaster Recovery](openbao.md) and
[Pocket-Id Disaster Recovery](pocket-id.md) — into a single ordered chain, from an empty Proxmox environment to a fully
synced, GitOps-managed cluster.

## Prerequisites

Before starting, ensure the following tools are installed and configured: `omnictl`, `kubectl`, `s3cmd`, `kustomize`,
`ksops`. Run `mise install` from `projects/rhodes.akn/` to provision all of them, and from this folder specifically to
get the `dr:openbao:*` and `dr:pocket-id:*` convenience tasks referenced by the two component procedures below.

You must also have:

- Access to Omni (`omnictl config new/add` already run) to provision the cluster in Step 1.
- A valid `SOPS_AGE_KEY_FILE` (via `mise install` / this repo's environment) to decrypt every `sops/` secret applied
  along this chain (`vault/sops`, `pocket-id/sops`, `argocd/sops`).
- Access to the `rhodes.akn` Pulumi stack (`pulumi login`, correct stack selected) — needed for Step 3's recovery-mode
  `pulumi up`, OpenBao's break-glass admin token (Step 5), and for the Cloudflare/DNS-01 credentials cert-manager
  (applied in Step 2) expects from ESO once Step 7 pushes them into Vault.

## Required inputs

- `CLUSTER_CONTEXT`: kubectl context for the new cluster (e.g., `admin@rhodes.akn`).

---

## Step 1 — Provision the cluster

> [!NOTE] Cilium comes up in two phases: Talos installs its base (DaemonSet, operator) automatically here via the
> cluster template's `extraManifests`. Its remaining config — L2 announcements, the LoadBalancer IP pool, the
> `GatewayClass`, `NetworkPolicy`s — is applied by hand in Step 2, not here.

Apply `src/infrastructure/omni/rhodes.clustertemplate.yaml` via `omnictl`, following
[OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md) **up through its
CNI/CSI/CCM validation checklist only** — stop short of that procedure's GitOps registration step. ArgoCD bootstraps
last.

## Step 2 — Deploy `dist/infrastructure/kubernetes/`

> [!NOTE] None of this depends on Vault, ESO, or ArgoCD. Unlike other clusters, these apps don't get their secrets from
> ESO/Vault at all — Pulumi writes them directly (Step 3), so everything here, including cert-manager, is fully
> functional as soon as it's applied.

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/cilium/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/proxmox/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/cert-manager/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/cloudnative-pg/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-secrets/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-dns/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/ingress-gateway/
```

> [!WARNING] Run these one at a time and confirm each succeeds before the next — the list above doesn't chain with `&&`,
> so pasting the whole block at once won't stop on a failure. Two pairs must stay in this order: `cert-manager` before
> `cloudnative-pg` (its `Issuer`/`Certificate` need cert-manager's CRDs already registered), and `cilium` before
> `ingress-gateway` (its `Gateway` needs the `GatewayClass` `cilium` ships).

## Step 3 — Turn Pulumi into recovery mode

> [!IMPORTANT] `recovery` must be `true` here, not its normal (unset/`false`) value. `stack/vault.ts` gates every
> Vault-side resource behind `if (!config.getBoolean("recovery"))` — without this, this `pulumi up` would also try to
> reconcile those resources against an OpenBao that doesn't exist yet on the new cluster, and fail before OpenBao is
> even restored.

```sh
kubectl --context <CLUSTER_CONTEXT> create namespace vault --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply -f -
kubectl --context <CLUSTER_CONTEXT> create namespace pocket-id --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply -f -

cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi config set recovery true
pulumi up --refresh --parallel 15
```

This creates `cnpg-backup-credentials` in both the `vault` and `pocket-id` namespaces just created above
(`stack/cloudnative-pg.ts`, a direct Kubernetes-provider write, not gated by `recovery` either way) — the S3 credentials
the CNPG restores in Steps 5 and 6 need so that the CNPG operator deployed in Step 2 has something to restore from. Do
this once, here; the per-app procedures below no longer repeat it.

## Step 4 — Validate the cluster is operational

Confirm CNI/CSI/CCM before restoring any CNPG cluster on top of them:

```sh
cilium status --wait
```

Then walk OMNI-20260721-00's own
[Validation checklist](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md#validation-checklist)
(criteria V-001 through V-010). There is no dedicated, ready-to-run script for this yet —
`docs/experiments/20260617-proxmox-csi-ccm/scripts/validate.sh` covers the same criteria but is hardcoded to that
experiment's own `StorageClass`/`StatefulSet` names, not `rhodes.akn`'s; treat it as a reference for what to check by
hand, not a tool to run as-is.

Also confirm ESO and the CNPG operator are up, since Steps 5-6 depend on both:

```sh
kubectl --context <CLUSTER_CONTEXT> get pods -n external-secrets-system
kubectl --context <CLUSTER_CONTEXT> get pods -n cnpg-system
# → both Running (the vault.chezmoi.sh ClusterSecretStore itself stays unhealthy until Step 5 — expected)
```

## Step 5 — Restore OpenBao

> [!NOTE] Pocket-Id hasn't been restored yet (Step 6 comes after this one), so use **Option A (break-glass Pulumi
> token)** from `openbao.md`'s own Step 5 — Option B (Pocket-Id SSO) only becomes available once Pocket-Id and the
> Gateway are both up, which isn't guaranteed until Step 7.

Follow [OpenBao Disaster Recovery](openbao.md) in full. It restores the `openbao-database` CNPG cluster from its Garage
S3 backup and regains admin access to the already-configured instance. Return here once its own Quick verifications
pass.

## Step 6 — Restore Pocket-Id

Follow [Pocket-Id Disaster Recovery](pocket-id.md) in full. It restores Pocket-Id's own CNPG database and app secret,
independent of OpenBao and of Vault. HTTPS/passkey login isn't verifiable yet at this point — the Gateway's certificate
isn't valid until Step 7 — `pocket-id.md`'s own Step 4 covers the port-forward fallback for that. The OIDC round-trip
into OpenBao is validated later, in Step 8.

## Step 7 — Turn Pulumi's `recovery` flag off

OpenBao being reachable and unsealed (Step 5) is the signal to flip Pulumi back out of recovery mode:

```sh
cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi config set recovery false
pulumi up --refresh --parallel 15
```

This is what actually creates ESO's Vault auth backend/KV mount/role and Pocket-Id's SSO auth backend/policies. ArgoCD's
own OIDC `ExternalSecret` (Step 9) depends on this having succeeded.

## Step 8 — Validate everything is OK

Walk the [Quick verifications](#quick-verifications) list below for Steps 1-7. Now that Step 7 has run, also confirm the
one thing that couldn't be checked earlier: **Pocket-Id SSO into OpenBao** — log into `https://vault.chezmoi.sh/ui` via
Pocket-Id OIDC as an `admin`-group user. This is [openbao.md](openbao.md)'s Option B, and confirms Pocket-Id's OIDC
round-trip end to end.

## Step 9 — Bootstrap ArgoCD and final validation

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/argocd/
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/argocd/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/src/bootstrap.applications.yaml
```

> [!NOTE] ArgoCD self-hosts on `rhodes.akn` (the hub pattern — see
> [OMNI-20260721-00 § Hub & spoke GitOps topology](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md#hub--spoke-gitops-topology)),
> and bootstraps last, deliberately: it **adopts** every resource already applied by hand in Steps 2-8 instead of being
> a dependency of them, and its own OIDC `ExternalSecret` needs Step 7 already done.

Once the `seed` `Application` is `Synced`/`Healthy`, ArgoCD's `applications` and `system` ApplicationSets take over:
they discover every directory under `dist/apps/*` and `dist/infrastructure/kubernetes/*` — including everything just
applied by hand — and reconcile it through GitOps from here on. No further manual `kubectl apply` should be needed.

---

## Quick verifications

- **CNI/CSI/CCM**: `cilium status --wait` and OMNI-20260721-00's own validation checklist pass (Step 1-2, gated in
  Step 4)
- **ESO / CNPG operator up**: `kubectl get pods -n external-secrets-system` and `-n cnpg-system` show `Running`
  (`ClusterSecretStore vault.chezmoi.sh` itself stays unhealthy until Step 5 — expected) (Step 2, gated in Step 4)
- **Pulumi in recovery mode**: `pulumi config get recovery` reports `true`, `cnpg-backup-credentials` exists in both the
  `vault` and `pocket-id` namespaces (Step 3)
- **OpenBao**: see [openbao.md § Quick verifications](openbao.md#quick-verifications) (Step 5)
- **Pocket-Id**: see [pocket-id.md § Quick verifications](pocket-id.md#quick-verifications) (Step 6)
- **ESO fully synced**: `kubectl get externalsecret -A` shows `SecretSynced`, not `SecretSyncedError` (Step 7)
- **Cert-manager / ExternalDNS / Gateway**: a `Certificate` issues successfully and DNS records appear in Cloudflare
  (Step 2, functional immediately)
- **ArgoCD**: the `seed` `Application` and every adopted `Application` report `Synced`/`Healthy` (Step 9)

## References

- [OMNI-20260721-00: Talos cluster bring-up on Proxmox](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)
  — cluster provisioning, CNI/CSI/CCM bring-up, and validation checklist (Steps 1, 4)
- [OpenBao Disaster Recovery](openbao.md) — the OpenBao restore procedure (Step 5)
- [Pocket-Id Disaster Recovery](pocket-id.md) — the Pocket-Id restore procedure (Step 6)

## History

- _2026-07-24_: Initial creation — extracted the cluster recovery chain out of the project `README.md` into its own
  document, tying `openbao.md`/`pocket-id.md` to the surrounding cluster-level steps.
- _2026-07-25_: Moved ESO bootstrap ahead of OpenBao restore — its `Generator` now sources both apps' CNPG role
  passwords, so its CRDs/controller must exist first. Split the old "ESO + flip `recovery`" step in two.
- _2026-07-26_: Fixed `recovery` never being set to `true` before the chain's first `pulumi up` (silently defaulted to
  non-recovery mode, would have failed against a not-yet-restored OpenBao) — added an explicit recovery-mode step and a
  cluster-validation step. Merged cert-manager/ExternalDNS into the early `kubectl apply` pass; moved Pocket-Id's
  restore ahead of the `recovery`-off flip. Added the CNPG operator, Cilium's remaining config, and the internal Gateway
  to Step 2 — none were applied anywhere before — and fixed the wrong `proxmox-*` directory paths. Replaced the upfront
  "Recovery order and why" section with per-step callouts.
- _2026-07-26_ (review follow-up): Refactored `stack/cert-manager.ts` to write the Cloudflare token as a direct
  Kubernetes `Secret` instead of via Vault — cert-manager is now functional right after Step 2, not gated on Step 7.
  Removed the redundant `dr:*:secrets`/`dr:pulumi:recovery-mode` mise tasks and trimmed intros.
