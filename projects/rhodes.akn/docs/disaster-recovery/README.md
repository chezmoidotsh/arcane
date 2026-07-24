# Rhodes·AKN Disaster Recovery

This document is the entry point for recovering `rhodes.akn` end to end after the cluster that hosts it has been lost
and rebuilt from scratch. It ties together the cluster-level bring-up (Omni) with the two component-specific procedures
that live alongside it in this folder — [OpenBao Disaster Recovery](openbao.md) and
[Pocket-Id Disaster Recovery](pocket-id.md) — into a single ordered chain, from an empty Proxmox environment to a fully
synced, GitOps-managed cluster.

## Recovery order and why

The chain below is ordered so that **every step only depends on what has already been restored**, never on something
still ahead of it:

- Cilium, the Proxmox CCM/CSI plugin, OpenBao, ESO, cert-manager, ExternalDNS, and Pocket-Id are all applied by hand
  (`kubectl apply`), because none of them can depend on ArgoCD to exist yet.
- **ArgoCD is bootstrapped last, deliberately.** It self-hosts on this cluster (the hub pattern — see
  [OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md#hub--spoke-gitops-topology)),
  and its OIDC login and secret delivery both depend on Pocket-Id and OpenBao being reachable. Bootstrapping it last
  means it **adopts** every resource already applied by hand in the steps before it, rather than being a dependency
  those steps have to work around. There is no step in this chain that waits on a working ArgoCD to restore ArgoCD's own
  dependencies.
- Once ArgoCD is up, it takes over: every application and infrastructure component from that point on — including the
  ones just applied manually — is reconciled through GitOps, not touched by hand again.

## Prerequisites

Before starting, ensure the following tools are installed and configured: `omnictl`, `kubectl`, `s3cmd`, `kustomize`,
`ksops`. Run `mise install` from `projects/rhodes.akn/` to provision all of them, and from this folder specifically to
get the `dr:openbao:*` / `dr:pocket-id:*` convenience tasks referenced by the two component procedures below.

You must also have:

- Access to Omni (`omnictl config new/add` already run) to provision the cluster in Step 1.
- A valid `SOPS_AGE_KEY_FILE` (via `mise install` / this repo's environment) to decrypt every `sops/` secret applied
  along this chain (`vault/sops`, `pocket-id/sops`, `argocd/sops`).
- Access to the `rhodes.akn` Pulumi stack (`pulumi login`, correct stack selected) — needed for OpenBao's break-glass
  admin token (Step 3) and for any Cloudflare/DNS-01 credentials cert-manager expects from ESO (Step 5).

## Required inputs

- `CLUSTER_CONTEXT`: kubectl context for the new cluster (e.g., `admin@rhodes.akn`).

---

## Step 1 — Provision the cluster

Apply `src/infrastructure/omni/rhodes.clustertemplate.yaml` via `omnictl`, following
[OMNI-20260721-00](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md) **up through its
CNI/CSI/CCM validation checklist only** — stop short of that procedure's GitOps registration step. This chain defers
ArgoCD bootstrap to Step 7 below, once OpenBao and Pocket-Id are restored; registering ArgoCD any earlier would give it
nothing to adopt yet and no working secret delivery to authenticate with.

## Step 2 — Bring up CNI/CSI/CCM

Cilium comes up automatically via the cluster template's `extraManifests` as part of Step 1. Once the cluster is
`Ready`, apply the Proxmox cloud-provider components by hand:

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/proxmox-cloud-controller-manager/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/proxmox-csi-plugin/
```

Verify both against OMNI-20260721-00's own CNI/CSI/CCM validation checklist before continuing — nodes need working
storage and cloud-provider integration for the CNPG restores in the next two steps to succeed.

## Step 3 — Restore OpenBao

Follow [OpenBao Disaster Recovery](openbao.md) in full. It restores the `openbao-database` CNPG cluster from its Garage
S3 backup and regains admin access to the already-configured instance.

At this point in the chain, Pocket-Id has not been restored yet (Step 6), so use **Option A (break-glass Pulumi token)**
from that document's Step 5 — Option B (Pocket-Id SSO) only becomes available once Pocket-Id and the Gateway are both
up. Return here once OpenBao's own Quick verifications pass.

> [!IMPORTANT]
>
> Writing this document surfaced an open question: `stack/vault.ts` and `stack/cert-manager.ts` in
> `src/infrastructure/pulumi/` gate ESO's Vault auth backend/KV mount/role, cert-manager's Cloudflare token push into
> Vault, and Pocket-Id's SSO auth backend/policies behind Pulumi's `bootstrap_mode` config — none of it exists until
> that flag is turned off and `pulumi up` is re-run against the restored cluster. This chain doesn't yet say when that
> transition happens. Left open for now; resolve once the Pulumi bootstrap/recovery-mode handling for this cluster is
> settled.

## Step 4 — Bootstrap ESO against the restored OpenBao

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-secrets/
```

This is the first component pointed at Vault — every step below it depends on ESO being able to pull secrets from the
OpenBao restored in Step 3.

## Step 5 — Cert-manager and ExternalDNS

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/cert-manager/
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-dns/
```

Cert-manager sources its own scoped Cloudflare DNS-01 token from ESO (Step 4), so it must come after it. ExternalDNS has
no such dependency — it comes up independently against the UniFi provider, with no OpenBao/ESO involvement.

## Step 6 — Restore Pocket-Id

Follow [Pocket-Id Disaster Recovery](pocket-id.md) in full. It restores Pocket-Id's own CNPG database and app secret,
independent of OpenBao. Once it's serving logins, validate its OIDC integration against the OpenBao restored in Step 3 —
this is also what unlocks OpenBao's Option B admin-recovery path for any subsequent access needs.

## Step 7 — Bootstrap ArgoCD last

```sh
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/argocd/
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/argocd/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/src/bootstrap.applications.yaml
```

This self-hosts ArgoCD on `rhodes.akn` per the hub pattern (see
[OMNI-20260721-00 § Hub & spoke GitOps topology](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md#hub--spoke-gitops-topology)).
Its OIDC credentials `ExternalSecret` depends on ESO (Step 4) and Pocket-Id (Step 6) both being up. As covered in
[Recovery order and why](#recovery-order-and-why), ArgoCD adopts every resource applied by hand in Steps 2-6 instead of
being a dependency of them.

## Step 8 — Sync remaining applications

Once the `seed` Application is `Synced`/`Healthy`, ArgoCD's `applications` and `system` ApplicationSets take over: they
discover every directory under `dist/apps/*` and `dist/infrastructure/kubernetes/*` — including the components just
applied by hand — and reconcile them through GitOps from this point on. No further manual `kubectl apply` should be
needed.

---

No external-ingress step: `rhodes.akn` currently runs with no public gateway, so disaster recovery doesn't need to
restore one either.

## Quick verifications

- **CNI/CSI/CCM**: OMNI-20260721-00's own validation checklist passes (Step 2)
- **OpenBao**: see [openbao.md § Quick verifications](openbao.md#quick-verifications) (Step 3)
- **ESO**: `kubectl get externalsecret -A` shows `SecretSynced`, not `SecretSyncedError` (Step 4)
- **Cert-manager / ExternalDNS**: a `Certificate` issues successfully and DNS records appear in Cloudflare (Step 5)
- **Pocket-Id**: see [pocket-id.md § Quick verifications](pocket-id.md#quick-verifications) (Step 6)
- **ArgoCD**: the `seed` `Application` and every adopted `Application` report `Synced`/`Healthy` (Step 7-8)

## References

- [OMNI-20260721-00: Talos cluster bring-up on Proxmox](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)
  — cluster provisioning and CNI/CSI/CCM bring-up (Steps 1-2)
- [OpenBao Disaster Recovery](openbao.md) — the OpenBao restore procedure (Step 3)
- [Pocket-Id Disaster Recovery](pocket-id.md) — the Pocket-Id restore procedure (Step 6)

## History

- _2026-07-24_: Initial creation — extracted the full cluster recovery chain out of the project `README.md` (which now
  only summarizes it) into its own document, tying `openbao.md` and `pocket-id.md` together with the surrounding
  cluster-level steps that don't have a procedure of their own yet (CNI/CSI/CCM, ESO, cert-manager/ExternalDNS, ArgoCD
  bootstrap).
