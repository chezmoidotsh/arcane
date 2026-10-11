# Experiment 2026-06-17: Proxmox CSI plugin + Cloud Controller Manager

Feasibility study of [proxmox-csi-plugin](https://github.com/sergelogvinov/proxmox-csi-plugin) and
[proxmox-cloud-controller-manager](https://github.com/sergelogvinov/proxmox-cloud-controller-manager) on a Talos cluster
running on Proxmox VMs (EXP-2026-005, issue #1028; CSI v0.18.1 / chart 0.5.7, CCM v0.13.1 / chart 0.2.28).

Write-up (FR): [Experimentation-2026-06-17-Proxmox-CSI-et-CCM.md](../Experimentation-2026-06-17-Proxmox-CSI-et-CCM.md)

## Contents

| Path                            | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `manifests/ccm-helmvalues.yaml` | CCM Helm values (cluster config, controllers)                 |
| `manifests/csi-helmvalues.yaml` | CSI Helm values (cluster config, StorageClass)                |
| `manifests/test-pvc.yaml`       | PostgreSQL StatefulSet + PVC (provisioning, I/O, pod restart) |
| `scripts/validate.sh`           | Runs the V-001..V-010 checks and prints PASS/FAIL per check   |

## Running it

Prerequisites: a Talos node with `kubelet.extraArgs.cloud-provider=external`, Proxmox `KubernetesCCM` / `KubernetesCSI`
roles and API tokens (see the write-up), `helm` and `kubectl` pointing at the test cluster.

1. Install the CCM first (nodes must be labeled before the CSI starts), passing the token with `--set`:
   `helm upgrade -i -n kube-system -f manifests/ccm-helmvalues.yaml --set config.clusters[0].token_secret=<secret> proxmox-cloud-controller-manager oci://ghcr.io/sergelogvinov/charts/proxmox-cloud-controller-manager`
2. Install the CSI the same way with `manifests/csi-helmvalues.yaml` and the `proxmox-csi-plugin` chart.
3. Apply `manifests/test-pvc.yaml`, then run `./scripts/validate.sh`.
