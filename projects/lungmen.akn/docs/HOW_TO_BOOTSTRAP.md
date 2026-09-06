# Bootstrap the lungmen.akn Talos cluster (via Sidero Omni)

<details>
<summary><strong>TL;DR</strong></summary>

lungmen.akn is provisioned end to end through [Sidero Omni](https://omni.siderolabs.com), not manual VM creation or
`talosctl`. It is the **worked example** cluster for the repo's generic Omni bring-up procedure — see
[`catalog/omni/README.md`](../../../catalog/omni/README.md).

```bash {"name":"Bootstrap lungmen.akn via Omni","interpreter":"bash","ignore":true}
set -e

# Requires OMNICONFIG populated via `omnictl config new`/`omnictl config add` (mise root task).
# Machine classes must already exist in Omni (repo-wide, not per-cluster):
mise run omni:machineclass:apply

cd projects/lungmen.akn

# Offline validation of the existing template (no Omni connectivity needed):
mise run omni:clustertemplate:validate

# Apply/reconcile the cluster (online, authenticated):
omnictl cluster template sync -f src/infrastructure/omni/lungmen.clustertemplate.yaml

# Watch convergence, then fetch the kubeconfig:
omnictl cluster status lungmen-akn
omnictl kubeconfig --cluster lungmen-akn ~/.kube/config-lungmen-akn
export KUBECONFIG=~/.kube/config-lungmen-akn
kubectl get nodes -o wide

# lungmen.akn is a GitOps *spoke* — it has no ArgoCD of its own. Register it
# against the hub running on rhodes.akn:
argocd cluster add lungmen-akn --name lungmen.akn
```

</details>

## What this document covers

This is the **lungmen.akn-specific** entry point for (re)provisioning the cluster: its cluster identity, template file,
and where it forks from the generic procedure. For the full step-by-step (SHA reachability checks, CSI/CCM validation
criteria, known issues, etc.), follow
[Procedure OMNI-20260721-00 — Talos cluster bring-up on Proxmox](../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)
using the parameters below.

> [!NOTE] This cluster was recreated from scratch after issue 1188 (superseding issue 1028): **proxmox-csi-plugin from
> day one, no Longhorn**. If you are restoring application data rather than bringing up a bare cluster, see
> [`src/infrastructure/kubernetes/velero/`](../src/infrastructure/kubernetes/velero/) for the Velero restore path —
> backups predating the recreation carry a `longhorn` storage-class name that must be remapped to
> `proxmox-lvmthin-ext4`/`proxmox-lvmthin-xfs` on restore.

## Cluster identity

| Parameter          | Value                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Cluster name       | `lungmen-akn`                                                                                                     |
| Template file      | [`src/infrastructure/omni/lungmen.clustertemplate.yaml`](../src/infrastructure/omni/lungmen.clustertemplate.yaml) |
| Pod CIDR (ADR-014) | `172.30.32.0/19` (cluster ID 2)                                                                                   |
| Service CIDR / DNS | `172.31.0.0/19` / `172.31.0.10` (shared across all clusters — do not change)                                      |
| Control plane      | `c1.minimal` × 1                                                                                                  |
| Workers            | `w1.large` × 3                                                                                                    |
| GitOps role        | **Spoke** — registers into the ArgoCD hub hosted on `rhodes.akn`, no local ArgoCD install                         |

`src/infrastructure/omni/lungmen.clustertemplate.yaml` is a standalone full copy of
[`catalog/omni/clustertemplates/base.yaml`](../../../catalog/omni/clustertemplates/base.yaml) (Omni templates cannot be
kustomized — see that file's own header comment for why), so lungmen-specific overrides are edited in place there rather
than layered on top.

## Prerequisites

- `omnictl`, `kubectl`, `argocd` — installed via `mise install` (root `.mise.toml` pins `omnictl`; run `mise install`
  from the repo root or this project directory).
- Omni authentication (`OMNICONFIG` populated via `omnictl config new`/`omnictl config add`).
- Machine classes already applied in Omni (`mise run omni:machineclass:apply` from the repo root) — they are shared COSI
  resources, not part of the cluster template, and are lost if Omni is reset.
- Access to the ArgoCD instance hosted on `rhodes.akn` (the GitOps hub) to run Step 11 (cluster registration) below.
- The Proxmox CCM/CSI credential delivery for this cluster is handled by this project's own Pulumi stack
  ([`src/infrastructure/pulumi/stack/proxmox.ts`](../src/infrastructure/pulumi/stack/proxmox.ts)), not a manual step —
  apply that stack after the cluster is `Ready` and before deploying `dist/infrastructure/kubernetes/proxmox/`.

## Steps

Follow [OMNI-20260721-00](../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md) in full, using the
identity table above. In short:

1. **Machine classes** (Step 1) — apply once, shared repo-wide.
2. **Cluster identity already allocated** (Step 2) — lungmen is cluster ID 2, `172.30.32.0/19`; no new allocation needed
   unless the template itself is being recreated.
3. **Template already exists** (Step 3) — edit `lungmen.clustertemplate.yaml` in place for any change instead of
   creating a new file.
4. **Verify SHA reachability** (Step 4) before syncing, if the template's bootstrap manifest SHA has changed.
5. **Validate offline**: `mise run omni:clustertemplate:validate` (wraps Step 5).
6. **Apply**: `omnictl cluster template sync -f src/infrastructure/omni/lungmen.clustertemplate.yaml` (Step 6).
7. **Monitor convergence** and **retrieve kubeconfig** (Steps 7–8).
8. **Deliver the Proxmox CCM/CSI credential** via this project's Pulumi stack (Step 9 — see Prerequisites above; this is
   the one step lungmen.akn has concrete tooling for, where the generic procedure still has a TODO for other clusters).
9. **Deploy CSI/CCM** from `dist/infrastructure/kubernetes/proxmox/` (Step 10).
10. **Register as a spoke** into the `rhodes.akn` ArgoCD hub (Step 11):

    ```bash
    argocd cluster add lungmen-akn --name lungmen.akn
    ```

    Once registered, ArgoCD's ApplicationSets pick up everything under `dist/apps/` and the rest of
    `dist/infrastructure/kubernetes/` automatically — see [`../README.md`](../README.md#usage-and-development).

11. Run the **CNI/CSI/CCM validation checklist** in the generic procedure before considering the cluster ready for
    application traffic.

## After bootstrap

- Manifests are managed as `src/` → `dist/` (rendered via `dist:render`) → ArgoCD. Never hand-edit `dist/`; see
  [`../README.md`](../README.md#usage-and-development).
- lungmen.akn depends on the core-platform cluster (`rhodes.akn`) for OpenBao (secrets, via External Secrets Operator)
  and Pocket-Id (OIDC/SSO) — both must be reachable before app-level ExternalSecrets and SSO-gated routes come up
  healthy.
