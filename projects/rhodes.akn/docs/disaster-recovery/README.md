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
- Access to the `rhodes-akn-infra` Pulumi stack (`pulumi login`, correct stack selected) — needed for Step 3's
  recovery-mode `pulumi up` and for the Cloudflare/DNS-01 credentials cert-manager (applied in Step 2) expects from ESO
  once Step 7 pushes them into Vault.
- The root token, retrieved ahead of time from your personal secret manager — needed for Step 5 (regaining OpenBao admin
  access) and for Step 7's `pulumi up`. Not tracked anywhere in this repo — see
  [openbao.md § Technical framework](openbao.md#technical-framework-and-conventions).

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

> [!NOTE] None of this depends on Vault, ESO, or ArgoCD — Pulumi writes every secret these apps need directly (Step 3),
> not through ESO. It is not, however, all immediately healthy: `cert-manager`, `cloudnative-pg`, and `external-secrets`
> each ship at least one resource gated behind a validating webhook that only comes up once the Proxmox CCM/CSI
> credentials arrive in Step 3 — see the callout below the apply commands.

First, create the namespaces these apps don't create for themselves — unlike `cilium` (whose chart creates
`cilium-secrets`), none of the rest ship a `Namespace` object; they normally rely on ArgoCD's `CreateNamespace=true`,
which doesn't exist yet at this point in the chain:

```sh
for ns in proxmox-system cert-manager-system cloudnative-pg-system external-secrets-system external-dns-system; do
  kubectl --context <CLUSTER_CONTEXT> create namespace "$ns" --dry-run=client -o yaml \
    | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -
done
kubectl --context <CLUSTER_CONTEXT> label namespace proxmox-system pod-security.kubernetes.io/enforce=privileged pod-security.kubernetes.io/enforce-version=v1.33
```

> [!WARNING] Use `kubectl label`, not `kubectl annotate` — Pod Security Admission reads namespace **labels**, not
> annotations. `annotate` silently no-ops (the namespace keeps the cluster's default `baseline` policy) and the
> `proxmox-csi-plugin-node` DaemonSet fails every pod with `violates PodSecurity "baseline:latest"`, 0/3 nodes ever
> getting a CSI node pod. First hit during a live drill (2026-07-28) — `describe daemonset` in the CSI/CCM validation
> below is what surfaces it if it recurs.

Then apply each app, one at a time:

```sh
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cilium/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/proxmox/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cert-manager/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cloudnative-pg/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-secrets/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-dns/
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/infrastructure/kubernetes/external-dns/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cilium/
```

> [!NOTE] The `external-dns/sops` line above is separate because `dist:render` never bakes ksops-sourced secrets into
> `dist/` (see its `_has_ksops` check) — every `sops/` directory in this chain needs this same explicit
> `kustomize build ... | kubectl apply` treatment, same as `openbao.md` Step 1 and `pocket-id.md` Step 1 already do for
> their own `sops/` directories. This one delivers the BIND RFC2136/TSIG credential the `external-dns-bind` release
> (applied by the `dist/` line just above) needs.

> [!NOTE] `cilium/` is applied twice: first (above) to bring up the CNI, then again here at the end. Its `Gateway`s and
> wildcard `Certificate` live in this same directory (Cilium's Gateway API has no separate per-Gateway pod — the
> dataplane is the Envoy embedded in `cilium-agent`, stuck in this Helm release's `kube-system` namespace with no chart
> value to move it — see `src/infrastructure/kubernetes/README.md`), but the `Certificate` needs cert-manager's CRD,
> which doesn't exist yet on the first pass. The second apply is a no-op on everything already reconciled (same field
> manager, unchanged content) and only picks up what failed the first time. `--server-side --force-conflicts` on this
> second pass does **not** repeat the rolling-update blip from the first pass — that was a one-time field manager
> ownership transfer from Talos's bootstrap `extraManifests`, already resolved by then.

> [!WARNING] Run these one at a time and confirm each succeeds before the next — the list above doesn't chain with `&&`,
> so pasting the whole block at once won't stop on a failure. `cert-manager` must come before `cloudnative-pg` (its
> `Issuer`/`Certificate` need cert-manager's CRDs already registered) and before the second `cilium` apply (same reason,
> for its wildcard `Certificate`). `--server-side` is required, not optional: client-side apply rejects the Gateway API
> `httproutes` CRD outright (`metadata.annotations: Too long: may not be more than 262144 bytes` — its schema exceeds
> the `last-applied-configuration` annotation size limit).

> [!WARNING] The `cilium` apply fails with several `Apply failed with N conflicts` errors on first try — Talos's own
> bootstrap `extraManifests` (Step 1's CNI, applied under the Omni-managed field manager `cilium`) already owns the
> DaemonSet/Deployment/ConfigMap objects, and this step's `kubectl` field manager conflicts with it on SSA. Re-run with
> `--force-conflicts` added; this adopts ownership from the bootstrap manifest onto the `dist/`-rendered one (same
> pattern as ArgoCD adopting hand-applied resources in Step 9) and triggers a short rolling update of the Cilium
> DaemonSet — expected, see the ~2-minute connectivity blip called out in
> [OMNI-20260721-00 § Known issues](../../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md#2-minute-connectivity-blip-during-cilium-kubeproxyreplacement-takeover).

> [!NOTE] Expect two harmless, self-resolving classes of error on first pass — neither means Step 2 failed:
>
> - **`no matches for kind "X" ... ensure CRDs are installed first`** on a resource whose CRD was created earlier in the
>   _same_ `apply -f <dir>` command (seen on `cilium`'s `GatewayClass`). `kubectl` resolves the API surface once at the
>   start of each invocation, so a CRD it just created isn't visible yet to a later resource in that same batch. Re-run
>   the exact same `apply -f <dir>` command a second time — the CRD is registered by then and it goes through clean. The
>   first `cilium` apply also fails on its wildcard `Certificate` with the same-looking error, but for a different
>   reason — `cert-manager.io`'s CRD doesn't exist at all yet at that point (`cert-manager` hasn't been applied), so an
>   immediate retry of `cilium/` won't fix it. That one only resolves at the second `cilium` apply, below.
> - **Webhook calls failing with `dial tcp ...: connect: operation not permitted`** (the full error names
>   `webhook.cert-manager.io` or `....external-secrets.io`) on `cert-manager`'s `ClusterIssuer`, `cloudnative-pg`'s two
>   `Certificate`s (`barman-cloud-client`/`barman-cloud-server`), `external-secrets`'s `ClusterSecretStore`, one
>   `ExternalSecret` in `external-dns`, and the second `cilium` apply's wildcard `Certificate`. Root cause: the
>   `cert-manager-webhook` and `external-secrets-webhook` pods stay `Pending` (nodes still carry the
>   `node.cloudprovider.kubernetes.io/uninitialized` taint) until the Proxmox CCM pod is actually running — and the CCM
>   pod itself can't start until it can mount its `proxmox-cloud-provider` credential `Secret`, which **Step 3's
>   `pulumi up` delivers, not this step**. This is expected at this point in the chain, not something to fix here —
>   re-apply just these six resources once Step 3 has run (or fold the retry into Step 4's validation).

> [!NOTE] The `external-dns` app runs two `external-dns` releases (`external-dns-unifi`, `external-dns-bind`) in the
> same namespace. `security/network-policy.allow-external-dns-to-kubernetes-api.yaml`'s `endpointSelector` must match
> both — on `app.kubernetes.io/name: external-dns` alone, not a per-instance `app.kubernetes.io/instance` label — and
> its egress rule must target the `kube-apiserver` reserved Cilium entity, not `toEndpoints` matched on the apiserver's
> pod labels or `toEntities: host`. `kube-apiserver` runs `hostNetwork: true` on a control-plane node, which is a
> different node than the workers external-dns runs on, so Cilium resolves that traffic as the `remote-node` identity,
> not `host` — a plain `toEntities: host` rule never matches it. Same pattern as
> `catalog/kubernetes/cloudnative-pg/kustomize/cnpg.cluster-policy.allow-to-kubernetes-api.yaml`.

## Step 3 — Turn Pulumi into recovery mode

> [!IMPORTANT] `recovery` must be `true` here, not its normal (unset/`false`) value. `stack/vault.ts` gates every
> Vault-side resource behind `if (!config.getBoolean("recovery"))` — without this, this `pulumi up` would also try to
> reconcile those resources against an OpenBao that doesn't exist yet on the new cluster, and fail before OpenBao is
> even restored.

> [!IMPORTANT] Run `chezmoi.sh`'s own `pulumi up` **before** rhodes.akn's, at least once. `rhodes.akn/stack/proxmox.ts`
> authenticates its Proxmox provider using the `rhodes-akn-bootstrap@pve` credential, which `chezmoi.sh`'s stack
> (`stack/proxmox/access/rhodes-akn-bootstrap.ts`) delivers as a direct Kubernetes `Secret`
> (`kube-system/rhodes-akn-bootstrap-pve`) into this cluster — not through a Pulumi `StackReference`, deliberately (see
> that file's own comments: cross-project `StackReference` secret reads need the _exporting_ stack's passphrase, which
> this repo does not share across projects). If that Secret doesn't exist yet, rhodes.akn's `pulumi up` fails outright
> trying to read it.

```sh
cd projects/chezmoi.sh/src/infrastructure/pulumi
pulumi up --refresh --parallel 15

kubectl --context <CLUSTER_CONTEXT> create namespace vault --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -
kubectl --context <CLUSTER_CONTEXT> create namespace pocket-id --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -

cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi config set recovery true
pulumi up --refresh --parallel 15
```

This creates `cnpg-backup-credentials` in both the `vault` and `pocket-id` namespaces just created above
(`stack/cloudnative-pg.ts`, a direct Kubernetes-provider write, not gated by `recovery` either way) — the S3 credentials
the CNPG restores in Steps 5 and 6 need so that the CNPG operator deployed in Step 2 has something to restore from. Do
this once, here; the per-app procedures below no longer repeat it.

> [!NOTE] This same `pulumi up` is also what mints the `kubernetes-cloud-provider@pve` Proxmox identity and delivers the
> `proxmox-cloud-provider` Secret the CCM/CSI pods (deployed in Step 2) need to actually start — it's the direct
> resolution for the taint-blocked pods called out in Step 2's second callout. Give the CCM pod a minute to pick up the
> Secret and untaint all 3 nodes before moving on to Step 4.

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
kubectl --context <CLUSTER_CONTEXT> get pods -n cloudnative-pg-system
# → both Running (the vault.chezmoi.sh ClusterSecretStore itself stays unhealthy until Step 5 — expected)
# → external-dns-unifi specifically may CrashLoopBackOff/CreateContainerConfigError here too: its
#   ExternalSecret (external-dns-unifi-secret, sourced from vault.chezmoi.sh) can't sync until Step 5
#   restores OpenBao — same root cause as the ClusterSecretStore, also expected and intended.
#   external-dns-bind is unaffected — its credential comes from the sops/ apply above, not Vault.
```

## Step 5 — Restore OpenBao

Follow [OpenBao Disaster Recovery](openbao.md) in full. It restores the `openbao-database` CNPG cluster from its Garage
S3 backup and regains admin access to the already-configured instance. Return here once its own Quick verifications
pass.

## Step 6 — Restore Pocket-Id

Follow [Pocket-Id Disaster Recovery](pocket-id.md) in full. It restores Pocket-Id's own CNPG database and app secret,
independent of OpenBao and of Vault. HTTPS/passkey login isn't verifiable yet at this point — the Gateway's certificate
isn't valid until Step 7 — `pocket-id.md`'s own Step 4 covers the port-forward fallback for that. The OIDC round-trip
into OpenBao is validated later, in Step 8.

## Between Steps 6 and 9 — validate over real HTTPS via `/etc/hosts` (optional)

Once OpenBao (Step 5) and Pocket-Id (Step 6) are both up, their apps' own `HTTPRoute`s and `Certificate`s already exist
(`pocket-id.md` Step 3 and the equivalent in `openbao.md`) and are valid, independent of whether the operator's own
machine has picked up the new DNS records yet. Add temporary entries on the operator's own machine to validate against
the real hostnames over a real, already-valid TLS certificate instead of relying only on the port-forward fallbacks
(`openbao.md` Step 5 / `pocket-id.md` Step 4):

```text
<rhodes external Gateway IP>  vault.chezmoi.sh
<rhodes external Gateway IP>  auth.chezmoi.sh
```

The IP comes from rhodes's `external` Cilium LoadBalancer pool, `10.0.0.64/29` (see
[docs/network/ipam.md](../../../../docs/network/ipam.md)).

> [!IMPORTANT] This matters specifically for Pocket-Id: passkey/WebAuthn login requires a secure context (HTTPS +
> correct hostname) and does not work over a bare port-forward (see `pocket-id.md`'s own `[!IMPORTANT]` callout). The
> hosts-file override lets passkey login (Step 6) and the Pocket-Id → OpenBao SSO round-trip (Step 8) be validated end
> to end without waiting on DNS resolver caching/propagation.

Remove these entries once normal DNS resolution to `rhodes.akn` is confirmed correct — do not leave them in place
indefinitely.

## Step 7 — Turn Pulumi's `recovery` flag off

OpenBao being reachable and unsealed (Step 5) is the signal to flip Pulumi back out of recovery mode. This `pulumi up`
talks to Vault directly (creating ESO's auth backend, KV mount, role, and Pocket-Id's SSO auth backend), so its Vault
provider needs to authenticate — export the same root token from Step 5:

```sh
export VAULT_ADDR=http://localhost:8200   # or https://vault.chezmoi.sh if the Gateway/cert are already up
export VAULT_TOKEN="<root token from your secret manager>"

cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi config set recovery false
pulumi up --refresh --parallel 15
```

This is what actually creates ESO's Vault auth backend/KV mount/role and Pocket-Id's SSO auth backend/policies. ArgoCD's
own OIDC `ExternalSecret` (Step 9) depends on this having succeeded.

## Step 8 — Validate everything is OK

Walk the [Quick verifications](#quick-verifications) list below for Steps 1-7. Now that Step 7 has run, also confirm the
one thing that couldn't be checked earlier: **Pocket-Id SSO into OpenBao** — log into `https://vault.chezmoi.sh/ui` via
Pocket-Id OIDC as an `admin`-group user (use the `/etc/hosts` override above if local DNS hasn't caught up yet). This
confirms Pocket-Id's OIDC round-trip into Vault end to end, now that both are up — day-to-day admin access no longer
needs the root token past this point.

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
- **ESO / CNPG operator up**: `kubectl get pods -n external-secrets-system` and `-n cloudnative-pg-system` show
  `Running` (`ClusterSecretStore vault.chezmoi.sh` itself stays unhealthy until Step 5 — expected) (Step 2, gated in
  Step 4)
- **Pulumi in recovery mode**: `pulumi config get recovery` reports `true`, `cnpg-backup-credentials` exists in both the
  `vault` and `pocket-id` namespaces (Step 3)
- **OpenBao**: see [openbao.md § Quick verifications](openbao.md#quick-verifications) (Step 5)
- **Pocket-Id**: see [pocket-id.md § Quick verifications](pocket-id.md#quick-verifications) (Step 6)
- **ESO fully synced**: `kubectl get externalsecret -A` shows `SecretSynced`, not `SecretSyncedError` (Step 7)
- **Cert-manager / ExternalDNS / Gateway**: a `Certificate` issues successfully and DNS records appear in Cloudflare
  (Step 2, functional immediately)
- **external-dns/sops applied**: `kubectl --context <CTX> get secret external-dns-bind-secret -n external-dns-system`
  exists (Step 2)
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
- _2026-07-27_: First real drill of Step 2 against a live `rhodes.akn` cluster. Switched every `kubectl apply` in the
  step to `--server-side` (client-side apply rejects the Gateway API `httproutes` CRD on annotation size). Added the
  missing namespace-creation sub-step (`proxmox-system`, `cert-manager-system`, `cloudnative-pg-system`,
  `external-secrets-system`, `external-dns-system`, `ingress-gateway-system` — none of these apps ship their own
  `Namespace` object). Added the two-error callout explaining the harmless discovery-cache re-run case and the
  CCM-credential/webhook dependency chain that blocks six specific resources until Step 3 has run. Also fixed a separate
  real gap found during the same drill: `rhodes.akn` had no source for the upstream Gateway API core CRDs
  (`cilium/kustomization.yaml` now pulls the pinned `v1.5.1` experimental-channel bundle) — tracked in the `cilium`
  app's own source, not this document.
- _2026-07-27_ (Step 3): added the `chezmoi.sh`-before-`rhodes.akn` `pulumi up` ordering requirement — a new hard
  dependency introduced by the same drill's fix moving the `rhodes-akn-bootstrap@pve` credential off a Pulumi
  `StackReference` onto a direct Kubernetes `Secret` (see `stack/proxmox/access/rhodes-akn-bootstrap.ts`). Also noted
  that this step's `pulumi up` is what actually resolves the CCM/CSI-taint-blocked pods flagged in Step 2.
- _2026-07-28_: Second full drill, Steps 1-4. Fixed Step 2's namespace fix using `kubectl annotate` instead of
  `kubectl label` — Pod Security Admission reads namespace labels, not annotations, so the `proxmox-system` PSA override
  silently no-op'd and blocked the entire `proxmox-csi-plugin-node` DaemonSet (0/3 pods). Added a callout for the
  `--force-conflicts` needed on `cilium`'s apply (SSA ownership conflict between Talos's bootstrap-applied manifest and
  this step's `dist/`-rendered one). Fixed `-n cnpg-system` to the actual `-n cloudnative-pg-system` in Step 4 and Quick
  verifications, and noted external-dns pods also block on Step 5 (their `ExternalSecret`s can't sync until OpenBao is
  restored).
- _2026-07-29_: Dropped OpenBao's Pulumi-managed break-glass admin token entirely — the root token and its Shamir
  recovery key shares are held in the operator's personal secret manager instead, making it unnecessary. Step 5 no
  longer has an Option A/B split or a Pocket-Id-readiness dependency; Step 7 now calls out exporting the same root token
  so its `pulumi up` can authenticate its Vault provider. See `openbao.md`'s History for the full rationale.
- _2026-07-29_: Added the missing external-dns/sops apply to Step 2 — dist:render never bakes ksops-sourced secrets into
  dist/, so this one needed the same explicit kustomize+ksops treatment openbao.md/pocket-id.md already use for their
  own sops/ dirs.
- _2026-07-30_: Fixed `allow-external-dns-to-kubernetes-api`'s `endpointSelector` only matching `external-dns-unifi`,
  leaving `external-dns-bind` with no egress path to the apiserver under the namespace's default-deny baseline — found
  live via `external-dns-bind` CrashLoopBackOff (`failed to determine if *v1alpha1.DNSEndpoint is namespaced`). Selector
  now matches both instances; egress rule switched from `toEndpoints`/`toEntities: host` to the `kube-apiserver`
  reserved entity, since the apiserver runs `hostNetwork` on a different node than external-dns, which Cilium resolves
  as `remote-node`, not `host`. Clarified Step 4's callout to attribute the Vault-gated CrashLoop to
  `external-dns-unifi` specifically, not both releases. Moved the `/etc/hosts` real-HTTPS validation step out of the
  amiya.akn→rhodes.akn migration doc into a new section here (Between Steps 6 and 9) — it isn't actually
  migration-specific, just optional in a genuine DR since production DNS already targets this same cluster.
- _2026-07-30_: Folded the `ingress-gateway/` component into `cilium/` — Cilium's Gateway API has no separate
  per-Gateway pod, so the `Gateway`/`HTTPRoute`/`Certificate` objects previously kept in their own
  `ingress-gateway-system` namespace were always going to have their actual Envoy dataplane running in `cilium`'s own
  `kube-system` namespace regardless; the separate namespace only isolated the control-plane objects, not the traffic
  path. Step 2's `ingress-gateway/` apply and namespace pre-creation are gone; `cilium/` is now applied twice (CNI
  first, then again at the end of Step 2 once cert-manager's CRD/webhook exist for the wildcard `Certificate`) — see the
  new `[!NOTE]` after the apply block. `ingress-gateway/`'s three `CiliumNetworkPolicy`s were dropped as redundant once
  their pods live in `kube-system`, already covered by `cilium/security/network-policy.allow-kube-system-full.yaml`.
