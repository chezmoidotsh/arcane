---
experiment: EXP-2026-005
title: Proxmox CSI Plugin + Cloud Controller Manager
status: OK
created: 2026-06-17
updated: 2026-06-17
csi: v0.18.1 (chart 0.5.7)
ccm: v0.13.1 (chart 0.2.28)
issue: https://github.com/chezmoidotsh/arcane/issues/1028
---

## Abstract

Feasibility study for deploying [proxmox-csi-plugin](https://github.com/sergelogvinov/proxmox-csi-plugin) and
[proxmox-cloud-controller-manager](https://github.com/sergelogvinov/proxmox-cloud-controller-manager) on a Talos
Kubernetes cluster running on Proxmox VMs.

The CSI plugin provides dynamic provisioning of block volumes stored on the Proxmox hypervisor side. Volumes are
decoupled from VM lifecycle — they survive VM rebuilds and can be reattached to a different VM on the same Proxmox node.

The CCM is deployed solely to provide node topology labels and `providerID` that the CSI plugin relies on for volume
scheduling. Cilium handles all networking — the CCM only runs `cloud-node` and `cloud-node-lifecycle` controllers.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Requirements](#2-requirements)
3. [Technical Background](#3-technical-background)
4. [Proposed Solution](#4-proposed-solution)
5. [Implementation](#5-implementation)
6. [Test Environment](#6-test-environment)
7. [Validation](#7-validation-criteria)
8. [Results](#8-results)
9. [Conclusions](#9-conclusions)

---

## 1. Problem Statement

Local storage provisioners (e.g. `local-path-provisioner`) bind PVCs to a single node's filesystem. This creates three
problems:

- **Data loss on node change** — scaling down, migrating, or reinstalling a VM requires manually moving all persistent
  data.
- **Manual volume management** — resizing volumes requires connecting to the Proxmox UI, finding the disk, and resizing
  it from there. No Kubernetes-native workflow.
- **No dynamic node scaling** — adding a new node requires manual storage and topology configuration on the Proxmox
  side.

Storing volumes on the Proxmox hypervisor side with a CSI plugin solves all three: volumes are provisioned, resized, and
deleted from Kubernetes; they survive VM rebuilds and can be reattached to any VM on the same Proxmox node.

---

## 2. Requirements

- Create, modify, resize, and delete volumes dynamically from Kubernetes
- Volume snapshots — if possible without `root@pam`; otherwise Velero or an external backup mechanism will be used
  instead

---

## 3. Technical Background

### 3.1 CSI Plugin Architecture

| Component          | Role                                               | Runs on       |
| ------------------ | -------------------------------------------------- | ------------- |
| **CSI Controller** | Provisioner + Attacher + Resizer (Deployment)      | Control plane |
| **CSI Node**       | `kubelet` plugin — mounts/attaches volumes to pods | All nodes     |
| **CSI Driver CRD** | `CSIDriver` resource `csi.proxmox.sinextra.dev`    | Cluster       |

Volumes are block devices attached to the VM via Proxmox SCSI controller. The VM sees them as `/dev/disk/by-id/...`
devices that get mounted into pod containers.

### 3.2 Cloud Controller Manager

The CCM runs as a Deployment in `kube-system` with two controllers:

| Controller               | Function                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| **cloud-node**           | Detects nodes, sets topology labels, `providerID`, instance-type, addresses |
| **cloud-node-lifecycle** | Removes node resource when Proxmox VM is deleted                            |

`route` and `service` controllers are **not enabled** — Cilium handles networking.

Node output after CCM initialization:

```yaml
metadata:
  labels:
    topology.kubernetes.io/region: homelab
    topology.kubernetes.io/zone: pve
    node.kubernetes.io/instance-type: 2VCPU-4GB
    topology.proxmox.sinextra.dev/region: homelab
    topology.proxmox.sinextra.dev/zone: pve
spec:
  providerID: proxmox://homelab/100
status:
  addresses:
    - address: 10.0.0.50
      type: InternalIP
    - address: talos-node
      type: Hostname
```

**Important**: `kubelet` must run with `--cloud-provider=external`. On Talos, this is configured via machine config:

```yaml
machine:
  kubelet:
    extraArgs:
      cloud-provider: external
```

### 3.3 Topology Model

| Label                                  | Meaning                            | Source                     |
| -------------------------------------- | ---------------------------------- | -------------------------- |
| `topology.kubernetes.io/region`        | Proxmox cluster name               | CCM (from `config.region`) |
| `topology.kubernetes.io/zone`          | Proxmox node hostname              | CCM (from Proxmox API)     |
| `topology.proxmox.sinextra.dev/region` | Same as region (alternative label) | CCM                        |
| `topology.proxmox.sinextra.dev/zone`   | Same as zone (alternative label)   | CCM                        |

### 3.4 Supported Storage Backends

- Directory (`dir`)
- LVM (`lvm`)
- LVM-thin (`lvmthin`)
- ZFS (`zfspool`)
- NFS (`nfs`)
- Ceph (`rbd`)

---

## 4. Proposed Solution

### 4.1 Infrastructure

```text
Proxmox Host (pve)
└── VM (Talos K8s)
    ├── Control plane + worker (single node)
    ├── kube-system
    │   ├── proxmox-cloud-controller-manager (Deployment)
    │   ├── proxmox-csi-controller (Deployment)
    │   └── proxmox-csi-node (DaemonSet)
    └── Pod with PVC → block device attached via SCSI
```

### 4.2 Integration with Arcane

- StorageClass defined via Helm `storageClass` values — no separate manifest needed
- Secrets stored in OpenBao, synced via External Secrets Operator
- ArgoCD ApplicationSet pointing to this experiment's `manifests/`
- CCM deployed via ArgoCD or Talos `cluster.inlineManifests`

### 4.3 Deploy Order

1. Proxmox roles, users, and API tokens
2. Talos machine config update (`kubelet.extraArgs.cloud-provider=external`)
3. CCM (must start before CSI so nodes are labeled)
4. CSI plugin (reads topology labels from CCM-labeled nodes)

---

## 5. Implementation

### 5.1 Proxmox User and Role Setup

The CCM and CSI each authenticate with Proxmox using a dedicated API token. Both are realm users (`@pve`) with scoped
privileges. The `talos` pool already contains the VMs and associated storages — ACLs leverage this existing setup (see
[omni-infra-provider-proxmox](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/)
for the pool configuration).

Run on the Proxmox host:

```sh
# ── CCM role ──────────────────────────────────────────────────────
# Read-only access to VM config, guest-agent, and node status
pveum role add KubernetesCCM -privs "VM.Audit VM.GuestAgent.Audit Sys.Audit"

# ── CCM user ─────────────────────────────────────────────────────
pveum user add kubernetes-ccm@pve
# VM access scoped to the talos pool
pveum acl modify /pool/talos --users kubernetes-ccm@pve --roles KubernetesCCM
# Node access for Sys.Audit (topology + lifecycle)
pveum acl modify /nodes/pve --users kubernetes-ccm@pve --roles KubernetesCCM

# ── CCM token (record the full token ID + secret) ───────────────
pveum user token add kubernetes-ccm@pve ccm -privsep 0
# → token ID:   kubernetes-ccm@pve!ccm
# → token secret: <printed once>

# ── CSI role ──────────────────────────────────────────────────────
# VM.Audit          — read VM config to find the VM by name/UUID
# VM.Config.Disk    — attach/detach block devices to the VM
# Datastore.*      — allocate space and report capacity to the scheduler
# Sys.Audit         — list cluster resources (required for capacity reporting)
pveum role add KubernetesCSI -privs \
  "VM.Audit VM.Config.Disk Datastore.Allocate Datastore.AllocateSpace Datastore.Audit Sys.Audit"

# ── CSI user ─────────────────────────────────────────────────────
pveum user add kubernetes-csi@pve
# VM access scoped to the talos pool (storages are already in the pool)
pveum acl modify /pool/talos --users kubernetes-csi@pve --roles KubernetesCSI
# Cluster-level access for /cluster/resources (capacity reporting)
pveum acl modify / --users kubernetes-csi@pve --roles KubernetesCSI

# ── CSI token (record the full token ID + secret) ───────────────
pveum user token add kubernetes-csi@pve csi -privsep 0
# → token ID:   kubernetes-csi@pve!csi
# → token secret: <printed once>
```

> **All VMs using CSI volumes must be in the `talos` pool.** The ACL is scoped to `/pool/talos` — VMs outside the pool
> will fail provisioning with a Proxmox 403\. Conversely, never add non-Kubernetes VMs to the `talos` pool.

### Proxmox Permissions Reference

#### CCM

| Privilege             | ACL path      | Why                                              |
| --------------------- | ------------- | ------------------------------------------------ |
| `VM.Audit`            | `/pool/talos` | Read VM config for hostname, VMID, instance-type |
| `VM.GuestAgent.Audit` | `/pool/talos` | Read guest-agent reported IP addresses           |
| `Sys.Audit`           | `/nodes/pve`  | Read node status for topology and lifecycle      |

#### CSI

| Privilege                 | ACL path      | Why                                           |
| ------------------------- | ------------- | --------------------------------------------- |
| `VM.Audit`                | `/pool/talos` | Locate the VM by name or UUID                 |
| `VM.Config.Disk`          | `/pool/talos` | Attach and detach SCSI block devices          |
| `Datastore.Allocate`      | `/pool/talos` | Allocate disk images on the storage backend   |
| `Datastore.AllocateSpace` | `/pool/talos` | Reserve space for new volumes                 |
| `Datastore.Audit`         | `/pool/talos` | List storages and report free capacity        |
| `Sys.Audit`               | `/`           | List cluster resources for capacity reporting |

### 5.2 Deployment — CCM

```sh
helm upgrade -i -n kube-system \
  -f manifests/ccm-helmvalues.yaml \
  --set config.clusters[0].token_secret="<ccm-token-secret>" \
  proxmox-cloud-controller-manager \
  oci://ghcr.io/sergelogvinov/charts/proxmox-cloud-controller-manager
```

### 5.3 Deployment — CSI

```sh
helm upgrade -i -n kube-system \
  -f manifests/csi-helmvalues.yaml \
  --set config.clusters[0].token_secret="<csi-token-secret>" \
  proxmox-csi-plugin \
  oci://ghcr.io/sergelogvinov/charts/proxmox-csi-plugin
```

### 5.4 Manifests

| File                            | Purpose                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `manifests/ccm-helmvalues.yaml` | CCM Helm values (cluster config, controllers)                                 |
| `manifests/csi-helmvalues.yaml` | CSI Helm values (cluster config, StorageClass)                                |
| `manifests/test-pvc.yaml`       | StatefulSet (PostgreSQL) + PVC to validate provisioning, I/O, and pod restart |

### 5.5 Validation

```sh
./scripts/validate.sh
```

---

## 6. Test Environment

| Component       | Value                                             |
| --------------- | ------------------------------------------------- |
| Proxmox VE      | Single node, self-clustered                       |
| Kubernetes      | Talos Linux, single-node (control-plane + worker) |
| Storage backend | LVM-thin (`nvme-lvm`) on Proxmox                  |
| CNI             | Cilium                                            |

---

## 7. Validation Criteria

```sh
./scripts/validate.sh
```

| ID    | Criterion                          | Command                                                                                        |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| V-001 | CCM pods running in kube-system    | `kubectl -n kube-system get pods -l app=proxmox-cloud-controller-manager`                      |
| V-002 | Node has topology labels           | `kubectl get nodes --show-labels` \| grep topology                                             |
| V-003 | Node has providerID                | `kubectl get nodes -o jsonpath='{.items[*].spec.providerID}'`                                  |
| V-004 | CSIDriver registered               | `kubectl get csidriver csi.proxmox.sinextra.dev`                                               |
| V-005 | CSI controller + node pods running | `kubectl -n kube-system get pods` \| grep proxmox-csi                                          |
| V-006 | StorageClass available             | `kubectl get sc proxmox-lvmthin-ext4`                                                          |
| V-007 | StatefulSet PVC bound              | `kubectl get pvc data-test-csi-0` \| grep Bound                                                |
| V-008 | PostgreSQL ready in StatefulSet    | `kubectl get sts test-csi` \| grep 1/1                                                         |
| V-009 | Volume expansion works             | `kubectl patch pvc data-test-csi-0 -p '{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}'` |
| V-010 | Volume survives pod restart        | Delete pod, StatefulSet recreates with same PVC                                                |

---

## 8. Results

Feasibility confirmed — CSI plugin and CCM are fully operational on Talos + Proxmox.

**Working**: dynamic provisioning, volume resize, pod restart with persistent data, topology labels, providerID,
multiple StorageClasses.

**Not working**: volume snapshots require `root@pam` credentials (experimental feature). This is not acceptable for a
non-root setup — backup will be handled by an external tool (Velero or Proxmox native backups).

---

## 9. Conclusions

The Proxmox CSI plugin is a viable replacement for in-cluster storage provisioners like Longhorn on Proxmox-based
clusters. It eliminates the overhead of running a distributed storage system inside Kubernetes by leveraging Proxmox's
existing storage backends directly.

The CCM is only needed to provide topology labels for the CSI — it adds minimal complexity and operates as a passive
component.

**Next steps** (see #1028):

- Replace Longhorn with proxmox-csi-plugin on Proxmox-based clusters
- Define StorageClasses per workload (ext4 for general, xfs with directsync for performance-sensitive apps)
- Evaluate Velero with Proxmox CSI snapshotter as backup strategy

### 9.1 Known Considerations

- **Single-node topology**: `WaitForFirstConsumer` volume binding mode means pods can only schedule on the labeled node.
  For a single-node cluster this is a non-issue.
- **kubelet `--cloud-provider=external`**: Mandatory for CCM to function. On Talos, set via machine config. Without it,
  the CCM will skip node initialization. If the flag is added after a node is registered, the node resource must be
  deleted and re-created (providerID is immutable).
- **Block device limits**: VirtIO SCSI single supports up to 256 devices per controller (LUN 0–255). With the boot disk
  on LUN 0, that leaves \~254 PVCs per VM.
- **Talos compatibility**: The CSI node plugin requires host-level access to `/dev/` and `/var/lib/kubelet`. Talos's
  immutable rootfs means the node DaemonSet must run with appropriate mounts; the Helm chart's default paths work with
  Talos.
- **CCM does not manage routes/services**: `route` and `service` controllers are disabled. Cilium Gateway API and Cilium
  LBP handle all networking concerns.

### 9.2 References

- CSI upstream: <https://github.com/sergelogvinov/proxmox-csi-plugin>
- CSI Helm chart: `oci://ghcr.io/sergelogvinov/charts/proxmox-csi-plugin`
- CSI StorageClass options: <https://github.com/sergelogvinov/proxmox-csi-plugin/blob/main/docs/options.md>
- CCM upstream: <https://github.com/sergelogvinov/proxmox-cloud-controller-manager>
- CCM Helm chart: `oci://ghcr.io/sergelogvinov/charts/proxmox-cloud-controller-manager`
- CCM install docs: <https://github.com/sergelogvinov/proxmox-cloud-controller-manager/blob/main/docs/install.md>
