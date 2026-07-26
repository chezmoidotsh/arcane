# Rhodes.akn cluster bring-up planning (#1119 / #1120 / #370)

## Objective

Plan (not yet implement beyond PR#1) the CNI/CSI/CCM bring-up for `rhodes.akn`, the Talos-on-Proxmox cluster being
provisioned via Sidero Omni to replace `amiya.akn` as the homelab's core-platform cluster. Two GitHub issues drive this
work:

- **#1119** — Provision rhodes.akn on Omni (Talos on Proxmox, dual-NIC, its own SDN subnet). Nodes Ready, Cilium
  healthy, no workloads yet.
- **#1120** — Deploy CNI/CSI/CCM on rhodes.akn and bootstrap Proxmox credentials into the cluster (blocked by #1118,
  which is CLOSED and already provides the Proxmox tokens via
  `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/access.ts` — `kubernetesCcmUser`/`kubernetesCcmToken` and
  `kubernetesCsiUser`/`kubernetesCsiToken`).

Both are sub-issues of parent **#370**, whose bring-up order is: Cluster (Omni) → CNI/CSI/CCM (Proxmox credentials) →
OpenBao (bootstrapped directly, restored from Garage) → ESO → CertManager/external-dns → Pocket-Id → **ArgoCD
bootstrapped last** (adopts what's already running) → remaining apps migrated incrementally. rhodes.akn will become the
new **hub** cluster hosting the central ArgoCD instance, replacing amiya.akn in that role (amiya gets decommissioned
after cutover).

## Context & reflections

### Key architectural decisions reached in this conversation (all confirmed by the user, not just proposed)

1. **The Proxmox CCM/CSI token + its Kubernetes Secret delivery is owned end-to-end by Pulumi, never by Vault/OpenBao.**
   Reasoning: Pulumi already needs privileged kubeconfig access to write the Secret directly into `kube-system`, so
   routing it through Vault/ESO afterward would add an indirection layer with no confidentiality benefit — same
   trust-boundary either way. This also sidesteps the chicken-and-egg problem (ESO/Vault don't exist yet when CCM/CSI
   need to start). This reverses what issue #1120's current text says ("re-homed to Vault in Phase 4 / ESO sub-issue") —
   that issue text should be corrected/clarified when the work lands, since the user's decision is that this secret is
   Pulumi-owned _permanently_, not just as an interim bootstrap step.

2. **Secret rotation**: use the `pulumi-time` npm package (NOT `@pulumi/time`, which doesn't exist under that name —
   `pulumi-time` is a community-maintained bridge of `hashicorp/terraform-provider-time`, published by hckhanh). Its
   `time.Rotating` resource (`rotationDays: 30`) changes its `rfc3339` output once the rotation window elapses. Because
   `proxmox.UserToken`'s `expirationDate` is mutable in place (won't force a new secret `value`), the actual rotation
   mechanism must be `replaceOnChanges: ["comment"]` on the `UserToken` resource, with `comment` interpolating
   `rotation.rfc3339` — that forces a real delete+create, which is what makes Proxmox issue a new token value. Important
   caveat: **no CI workflow in this repo runs `pulumi up` on a schedule** (checked: `.github/workflows/` has no
   pulumi-related file), so "rotates every 30 days" currently means "rotates at the next manual `pulumi up` after 30
   days have elapsed," not true wall-clock automation. The user's longer-term idea is a Pulumi Kubernetes Operator (PKO)
   running in-cluster to reconcile continuously — flagged as a real tension to resolve deliberately later: running PKO
   in-cluster with a live Proxmox-token-issuing credential edges back toward the
   `Proxmox → hosts K8s → K8s manages Proxmox` trust cycle that ADR-015's non-goal exists to block, even though the
   scope (CCM/CSI token only, not full `stack/proxmox` ACL management) is much narrower. Not blocking now — just
   something to address explicitly if/when PKO is actually adopted, not silently.

3. **This token+secret logic becomes a reusable Pulumi component** under `catalog/pulumi/components/` (same pattern as
   the existing `cluster-vault/` component), so every cluster reconstruction (not just rhodes) can call it. This is
   **PR#2** in the plan below.

4. **CNI (Cilium) stays on the existing `extraManifests` mechanism** (a `cilium-installer` Job running
   `cilium-cli install --set ...`, defined in `catalog/talos/manifests/cilium/1.19.5-native.yaml`), applied at Talos
   bootstrap before any GitOps exists — this is architecturally required, not just convenient, because
   `extraManifests`/`cni.urls` only exist as a Talos/Omni bootstrap-time mechanism; Cilium can't come up any other way
   before CNI itself is up. Key clarification: `cluster.name`/ `cluster.id` (needed for future ClusterMesh) do **not**
   need to be set at this bootstrap stage — Cilium's own upstream ClusterMesh-enablement procedure is exactly "set
   cluster.name/cluster.id later, then rolling-restart the agents," which is precisely what happens naturally once the
   post-bootstrap ArgoCD-managed Helm release
   (`projects/<cluster>/src/infrastructure/kubernetes/cilium/cilium.helmvalues/`) lands with those values set and Helm's
   ConfigMap-checksum-triggered restart takes care of it. So the bootstrap installer manifest can stay **generic/shared
   across all clusters** (KISS) — this is **PR#3**.

5. **`coredns+tailscale`** (another existing file under `catalog/talos/manifests/`) is explicitly OUT of scope for PR#3
   — the user considers it a post-bootstrap install, not part of the generic CNI bootstrap set.
   `kubelet-serving-cert-approver` and `metric-server` ARE in scope (already used the same way on lungmen.akn).

6. **CSI/CCM (proxmox-csi-plugin + proxmox-cloud-controller-manager) are deployed via the repo's existing ADR-011
   "rendered manifests" (`dist/`) pattern**, NOT via extraManifests and NOT via a live Pulumi Kubernetes-provider Helm
   release. Concretely: author `helmvalues`/kustomization sources under
   `projects/rhodes.akn/src/infrastructure/kubernetes/*proxmox-cloud-controller-manager/` and `*proxmox-csi-plugin/`
   (the leading `*` marking it as eventually ArgoCD-managed, per the repo's own convention), run `dist:render`, and
   **apply the resulting `dist/` output manually** (`kubectl apply -f dist/...`) since no ArgoCD exists on rhodes yet.
   This is deliberate: once rhodes' own ArgoCD bootstraps last (per #370's ordering), it adopts the exact same path with
   zero migration/drift — the dist/ output is already the "expected" declarative state. This is **PR#5**, closing #1120.

7. **Hub & spoke GitOps topology** — confirmed by re-reading the actual repo state: `amiya.akn` hosts the one central
   ArgoCD instance today (`projects/amiya.akn/src/argocd/`, includes a self-registered `argocd-cluster-amiya.akn`
   cluster Secret). Spoke clusters (e.g. `lungmen.akn`, which has NO `argocd` directory of its own) register into that
   central instance via `argocd cluster add lungmen.akn --name lungmen.akn` (documented today in
   `projects/lungmen.akn/docs/HOW_TO_BOOTSTRAP.md`, Step 11). **rhodes.akn will become the new hub** (per #370 Phase 7 —
   its own ArgoCD bootstraps last, adopting everything already running). This means for rhodes.akn's own bring-up
   procedure specifically, the answer is _always_ "self-host / `kubectl apply -f dist/...`" — never "argocd cluster add"
   — because rhodes doesn't yet have anywhere else to register against (amiya is being decommissioned). The
   `argocd cluster add` branch is real and already used (lungmen today), and will matter again for a _future_
   spoke-cluster scenario (explicitly called out in #370 Phase 10, lungmen's eventual PVE-CSI migration) — but not for
   rhodes now. The user wants this fork made an explicit, named callout in the procedure doc: "if this cluster is the
   hub → kubectl apply; if it's a spoke → register into the existing hub."

8. **Credentials discipline carries over**: the kubeconfig used to run the Pulumi component against rhodes must be the
   _human operator's own_ kubeconfig (their personal account), supplied via `KUBECONFIG=... pulumi up` env var — never
   through `pulumi config set` (even `--secret`, since that still writes an encrypted blob into a git-tracked
   `Pulumi.*.yaml` file). Only the non-secret bits (e.g. a context name string) belong in Pulumi config. This mirrors
   the existing convention in `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/README.md`'s "Bootstrapping"
   section (`PROXMOX_VE_PASSWORD` via macOS Keychain, never committed).

9. **No ADR needed for the hub & spoke topology** — the user explicitly corrected a suggestion to formalize it as a new
   ADR: ADRs are for _decisions_ (already covered by existing ADRs), what's wanted here is _contextual explanation_ —
   i.e., a procedure document that explains _why_ the bring-up steps are ordered the way they are (because the repo
   operates in a hub & spoke topology, because ArgoCD bootstraps last, etc.), not a decision record with alternatives
   considered.

### The 5-PR execution plan (agreed)

- **PR#1** (today, in progress as of this session): rewrite
  `docs/procedures/omni/OMNI-20260629-00.omni-cluster-creation.md` **in place** (same file, same procedure ID — chosen
  deliberately to avoid breaking the relative link from `docs/procedures/omni/OMNI-20260629-03.sha-repin.md`, and
  because the doc's own "History" table already exists precisely to log this kind of rewrite) into a full "new cluster
  bring-up" procedure. It absorbs everything the old Omni-only doc covered (cluster identity/CIDR allocation, template
  creation, SHA-reachability check, machine classes, template apply, convergence, kubeconfig retrieval) and extends it
  with: context sections (what Omni/Talos/ArgoCD are, and the hub & spoke topology explaining _why_ the step order is
  what it is), the Proxmox token+secret bootstrap step (consuming PR#2's component), the CSI/CCM dist/ deployment step
  (PR#5's output), the explicit hub-vs-spoke GitOps registration branch, and a validation checklist (CNI/CSI/CCM test
  commands) reusing `docs/experiments/20260617-proxmox-csi-ccm/scripts/validate.sh` + `manifests/test-pvc.yaml` rather
  than inventing new ad hoc checks. Software/version numbers get framed as a "tested with" snapshot table (not a hard
  pin), matching the existing doc's "Software versions (current)" section style. Also update the Omni entry in
  `docs/procedures/README.md` to match the new scope. A separate `tech-doc-writer` agent is handling the actual doc
  rewrite in parallel with this session-dump task; that work is tracked independently.

- **PR#2**: the reusable Pulumi component (Proxmox CCM/CSI token generation + Kubernetes Secret delivery
  - `pulumi-time`-based rotation), under `catalog/pulumi/components/`. Ships as code only — it cannot be live-tested end
    to end until a real cluster+kubeconfig exists (PR#4), so its first real exercise happens during PR#5. Any wiring
    gaps discovered there get fixed as part of PR#4/PR#5, not blocking PR#2's merge.

- **PR#3**: new/updated manifest(s) under `catalog/talos/manifests/cilium/` for the latest Cilium version,
  generic/shared across clusters (no per-cluster templating needed, since cluster.name/id are deferred to post-bootstrap
  ArgoCD sync). Also assess whether `kubelet-serving-cert-approver` and `metric-server` need version bumps. Explicitly
  excludes `coredns+tailscale` (out of scope, considered post-bootstrap). Must land merged on `main` (not just opened)
  before PR#4 references its commit SHA, to avoid the exact squash-merge 404 trap that `OMNI-20260629-03.sha-repin.md`
  already documents.

- **PR#4**: the actual Omni cluster template for rhodes.akn
  (`projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml`), closing #1119. Must include the Talos
  machine-config patch `kubelet.extraArgs.cloud-provider: external` from the start — if omitted, the CCM silently no-ops
  (no error), and fixing it after node registration requires deleting and recreating the node (`providerID` is
  immutable). This is the single most important "don't forget this" flag from the whole conversation. Also scaffolds
  `projects/rhodes.akn/` (careful: a stray untracked/gitignored vendored Helm chart directory already exists at that
  path on disk per #370's notes — not real project content, don't confuse it with prior work). The cluster-ID/pod-CIDR
  discrepancy flagged in #1119 (`OMNI-20260629-00` vs ADR-014) appears to already be resolved in the current procedure
  doc's table (rhodes = cluster ID 1, `172.30.0.0/19`) — worth a final confirmation, not a re-litigation.

- **PR#5**: the actual bring-up execution for CCM/CSI, closing #1120 — instantiate PR#2's Pulumi component against the
  live rhodes cluster, author the CSI/CCM `dist/`-rendered app sources, apply them, and validate (test PVC
  provision/attach/resize/restart, topology labels, providerID) using the existing experiment's validation script.

## Change history

- [2026-07-20] Planning conversation held (this session) covering the full CNI/CSI/CCM bring-up approach for rhodes.akn,
  resulting in the 9 architectural decisions and the 5-PR execution plan documented above. PR#1 (procedure doc rewrite)
  started in parallel via a `tech-doc-writer` agent; this session document created to capture the planning context for
  continuation tomorrow.
- [2026-07-26] **Correction to decision #1/#3, post-bring-up**: ownership of the Proxmox CCM/CSI identity moved from
  `chezmoi.sh`'s Pulumi stack to `rhodes.akn`'s own — `stack/proxmox.ts` now self-provisions a single
  `kubernetes-cloud-provider@pve` identity directly against `pve-01`, via the new
  `catalog/pulumi/components/proxmox-cluster-identity` component (PR#2's component, but scoped to Proxmox
  role/user/token/ACL creation only — Secret delivery and `pulumi-time` rotation, both still planned by decision #2,
  stay call-site logic in `stack/proxmox.ts`, not folded into the component). Reasoning: minting a cluster's own
  workload credentials is that cluster's concern, not shared-infra's — `chezmoi.sh` owns `pve-01` as a whole, but not
  every identity that ever touches it. This requires `rhodes.akn`'s stack to authenticate its own `proxmox.Provider`; it
  does so via a new delegated `rhodes-akn-bootstrap@pve` credential (`Administrator` role scoped to `/access` only —
  cannot touch VMs/storage/SDN) that `chezmoi.sh`'s `stack/proxmox/access.ts` mints for exactly this handoff, consumed
  through the existing StackReference (same treatment as the old `kubernetesCcmToken`/`kubernetesCsiToken` outputs —
  Pulumi state was already the accepted transport for this class of token, so this isn't a new exception to the
  "credentials never in git" rule, which is about `root@pam` and other externally-sourced secrets, not Pulumi-minted
  ones). Also, per explicit user request, CCM and CSI now share **one** identity/token/Secret (`proxmox-cloud-provider`)
  instead of two separate least-privilege ones — a deliberate simplification that merges the former
  `KubernetesCCM`/`KubernetesCSI` privilege sets into one `KubernetesCloudProvider` role. Trade-off: a compromise of
  this token now carries both concerns' privileges instead of being contained to one; accepted for this single-node,
  single-cluster deployment. `pulumi-time`-based rotation (decision #2) was not part of this change and remains
  unimplemented in both the old and new design — still a real gap, not newly introduced.

## Attention points

- `kubelet.extraArgs.cloud-provider: external` must be in PR#4's machine config from day one (see PR#4 above) — the
  single highest-risk omission identified.
- PR#3 must be merged to `main` before PR#4 pins its manifest SHA (squash-merge SHA-404 trap — see `OMNI-20260629-03`).
- PR#2's component can't be fully validated until PR#5 — don't treat "PR#2 merged" as "component proven," fix forward in
  PR#4/PR#5 if wiring issues surface.
- The Pulumi-Kubernetes-Operator idea (for true automatic rotation) needs its own trust-boundary discussion against
  ADR-015 before it's built — not decided, just flagged.
- Issue #1120's current body text ("re-homed to Vault in Phase 4") should eventually be corrected to reflect the
  "Pulumi-owned, never Vault" decision — not urgent, but worth doing when PR#5/#1120 actually closes, so the issue
  history doesn't contradict what was actually built.
- Confirm whether renaming the OMNI-20260629-00 doc's title/slug (vs. just its content) is wanted — the current plan
  keeps the filename and ID as-is and just rewrites the H2 title/content, to avoid touching the cross-reference in
  `OMNI-20260629-03.sha-repin.md`.
- **Documentation gap surfaced while reviewing PR#1**: every new cluster project is now expected to define its own
  `omni:clustertemplate:validate`-style mise wrapper task (Step 5 of the procedure was treating this as a
  lungmen.akn-only exception; that's being corrected to assume it's the norm for all clusters). There is currently no
  guide/template for scaffolding a brand-new cluster project (`projects/<cluster>/`) with its expected pre-made assets
  (`.mise.toml` wrapper tasks, standard directory layout) — today someone bringing up a new cluster has to hand-craft
  that structure by copying `lungmen.akn`'s layout. Not something to build now; flagged here so it doesn't get lost as a
  future documentation need (a scaffolding guide/template would let `docs/procedures/omni/OMNI-20260629-00...` stop
  treating per-project tooling as ad hoc).

## Next steps

- [ ] PR#1: land the rewritten procedure doc (in progress this session)
- [ ] PR#2: build the reusable Pulumi component (Proxmox token + K8s Secret + rotation)
- [ ] PR#3: Cilium manifest refresh (+ assess kubelet-serving-cert-approver/metric-server), merged to main before PR#4
- [ ] PR#4: rhodes.akn Omni cluster template, closes #1119
- [ ] PR#5: CCM/CSI bring-up + validation, closes #1120
