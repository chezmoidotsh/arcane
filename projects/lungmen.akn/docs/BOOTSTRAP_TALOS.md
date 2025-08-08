# Talos Cluster Bootstrap

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)
* [Cluster Initialization](#cluster-initialization)
* [Verification](#verification)
* [Troubleshooting](#troubleshooting)

## Introduction

This document describes the process of bootstrapping a Talos Linux cluster. It covers the necessary steps to initialize and configure a Talos cluster ready to host Kubernetes workloads.

## Prerequisites

* Physical or virtual machine with Talos Linux installed
* Access to the machine's IP address
* Talos secrets file (stored in personal secret manager)
* Talos configuration patch file

## Cluster Initialization

> \[!WARNING]
> Before proceeding, ensure you have exported the following variables:
>
> ```sh
> export TALOS_NODE_IP=<node-ip-address>
> ```

### 1. Secrets Generation (Optional)

If you need to generate new secrets for the cluster:

```bash
talosctl gen secrets --output-file secrets.yaml
```

### 2. Cluster Configuration

Generate the initial cluster configuration:

```bash
talosctl gen config lungmen.akn https://kubernetes.lungmen.akn.chezmoi.sh:6443 \
  --with-secrets secrets.yaml \
  --config-patch @bootstrap/talos/lungmen-akn-01.patch-config.yaml \
  --config-patch @bootstrap/talos/lungmen-akn-01.volumes.yaml \
  --config-patch @../../../defaults/talos/manifests/.decrypted~tailscale.extensionserviceconfig.enc.yaml
```

This will generate the following files:

* `controlplane.yaml` - Control plane node configuration
* `worker.yaml` - Worker node configuration
* `talosconfig` - Talos client configuration

### 3. Apply Configuration

Apply the generated configuration to the node:

```bash
talosctl apply-config --insecure \
  --file controlplane.yaml \
  --endpoints $TALOS_NODE_IP \
  --nodes $TALOS_NODE_IP
```

### 4. Bootstrap the Cluster

Initialize the cluster:

```bash
talosctl bootstrap \
  --talosconfig talosconfig \
  --endpoints $TALOS_NODE_IP \
  --nodes $TALOS_NODE_IP
```

### 5. Retrieve Kubeconfig

Get the Kubernetes configuration:

```bash
talosctl kubeconfig \
  --endpoints $TALOS_NODE_IP \
  --nodes $TALOS_NODE_IP
```

## Verification

To verify the installation:

```bash
# Check Talos node status
talosctl --talosconfig talosconfig get members \
  --endpoints $TALOS_NODE_IP \
  --nodes $TALOS_NODE_IP

# Verify Kubernetes cluster status
kubectl get nodes
```

## Troubleshooting

### Cluster Reset

If you need to reset the cluster to a clean state:

```bash
talosctl reset \
  --nodes $TALOS_NODE_IP \
  --endpoints $TALOS_NODE_IP \
  --graceful=false \
  --wipe-mode all \
  --reboot
```

> \[!NOTE]
> This will completely wipe the node and requires reinstallation of Talos Linux.

***

<div align="left">
  <a href="./BOOTSTRAP_PVE.md">Previous: BOOTSTRAP_PVE.md</a>
</div>
<div align="right">
  <a href="./BOOTSTRAP_KUBERNETES.md">Next: BOOTSTRAP_KUBERNETES.md</a>
</div>
