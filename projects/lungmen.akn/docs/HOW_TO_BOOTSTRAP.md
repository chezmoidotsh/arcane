# Bootstrap Talos cluster on Proxmox VE

<details>
<summary><strong>TL;DR</strong></summary>

Deploy a complete Talos Kubernetes cluster on Proxmox VE using custom Talos images with essential extensions. From VM creation to running cluster in one workflow.

```bash {"name":"Bootstrap complete cluster","interpreter":"bash","ignore":true}
set -e

# === Core Configuration Variables ===
export TALOS_NODE_IP="10.0.2.10"  # Replace with your VM IP
export TALOS_VERSION="1.10.7"
export SCHEMATIC_ID="36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010"

# Create working directory
mkdir -p generated

# Generate secrets and configuration
talosctl gen secrets --output-file generated/secrets.yaml
talosctl gen config lungmen.akn https://kubernetes.lungmen.akn.chezmoi.sh:6443 \
  --output generated \
  --output-types controlplane,talosconfig \
  --with-secrets generated/secrets.yaml \
  --config-patch @../src/infrastructure/talos/lungmen-akn-01.patch-config.yaml \
  --config-patch @../src/infrastructure/talos/lungmen-akn-01.volumes.yaml

# Apply configuration and bootstrap
export TALOSCONFIG="generated/talosconfig"
talosctl apply-config --insecure --nodes $TALOS_NODE_IP --file generated/controlplane.yaml
talosctl bootstrap --nodes $TALOS_NODE_IP

# Retrieve kubeconfig
talosctl kubeconfig --nodes $TALOS_NODE_IP --force --merge=false generated/kubeconfig
export KUBECONFIG="generated/kubeconfig"

# Verify cluster is ready
kubectl get nodes
kubectl get pods -A

# Add cluster to ArgoCD (requires access to amiya.akn ArgoCD)
kubectl config current-context
argocd cluster add lungmen.akn --name lungmen.akn
```

</details>

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)

### Part 1: Proxmox VE Virtual Machine

* [Step 1: Environment Setup](#step-1-environment-setup)
* [Step 2: Generate Talos Image](#step-2-generate-talos-image)
* [Step 3: Create and Configure VM](#step-3-create-and-configure-vm)
* [Step 4: Verify VM Deployment](#step-4-verify-vm-deployment)

### Part 2: Talos Cluster Bootstrap

* [Step 5: Generate Talos Configuration](#step-5-generate-talos-configuration)
* [Step 6: Apply Configuration](#step-6-apply-configuration)
* [Step 7: Bootstrap Cluster](#step-7-bootstrap-cluster)
* [Step 8: Retrieve Kubeconfig](#step-8-retrieve-kubeconfig)
* [Step 9: Verify Cluster](#step-9-verify-cluster)

### Part 3: Cluster Registration

* [Step 10: Save Talos Configuration](#step-10-save-talos-configuration)
* [Step 11: Add to ArgoCD](#step-11-add-to-argocd)
* [Step 12: Verify ArgoCD Integration](#step-12-verify-argocd-integration)

## Introduction

This document describes the complete process of deploying a Talos Kubernetes cluster on Proxmox VE infrastructure. The guide covers VM creation with custom Talos images, cluster bootstrapping, and integration with ArgoCD for GitOps-based application management. The lungmen.akn cluster is designed as a home services platform for media management, life organization, and automation.

## Prerequisites

### Dependencies

Ensure you have the following CLI tools installed:

| Tool       | Version | Purpose                | Installation                                                           |
| ---------- | ------- | ---------------------- | ---------------------------------------------------------------------- |
| `talosctl` | latest  | Talos Linux management | [Download](https://www.talos.dev/v1.10/talos-guides/install/talosctl/) |
| `kubectl`  | latest  | Kubernetes client      | [Download](https://kubernetes.io/docs/tasks/tools/)                    |
| `argocd`   | latest  | ArgoCD CLI             | [Download](https://argo-cd.readthedocs.io/en/stable/cli_installation/) |

> \[!TIP]
> If you're using the `mise` tool manager (recommended for this project), run `mise install` in the project root to automatically install all required dependencies.

### Infrastructure Access

Before proceeding, ensure you have:

* **Proxmox VE Access**: Administrative access to a Proxmox VE cluster
* **ArgoCD Access**: Access to the ArgoCD instance running on amiya.akn
* **Network Configuration**: Properly configured storage pools, VLANs, and bridges in Proxmox VE
* **DNS Records**: Ability to create DNS records for cluster endpoints

### Storage Requirements

* **Storage Pool**: Properly configured storage in Proxmox VE (nvme-lvm recommended)
* **Disk Space**: Minimum 96GB total (32GB root + 64GB data partition)
* **Network**: VLAN 2 access on vmbr1 bridge

## Step 1: Environment Setup

Before creating the VM, set up your environment variables for consistent deployment.

### Centralized Variables

```bash {"ignore":true}
# === Core Configuration Variables ===
export TALOS_NODE_IP="10.0.2.10"        # Replace with your planned VM IP
export TALOS_VERSION="1.10.6"
export SCHEMATIC_ID="36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010"

# === VM Configuration ===
export VM_ID="2411000"
export VM_NAME="tal01.lungmen.akn.chezmoi.sh"
export PVE_NODE="pve-01"                 # Replace with your Proxmox node name
export PVE_STORAGE="nvme-lvm"            # Replace with your storage pool
```

> \[!WARNING]
> Replace the IP address, node name, and storage pool with your actual Proxmox VE configuration values.

## Step 2: Generate Talos Image

Generate a custom Talos image with essential extensions for Proxmox VE deployment.

### Talos Factory Configuration

The custom image includes these extensions for optimal Proxmox integration:

* **siderolabs/iscsi-tools**: iSCSI storage support
* **siderolabs/qemu-guest-agent**: QEMU Guest Agent for VM management
* **siderolabs/util-linux-tools**: Additional system utilities

```bash {"ignore":true}
# Download the custom Talos ISO
TALOS_ISO_URL="https://factory.talos.dev/image/$SCHEMATIC_ID/v$TALOS_VERSION/nocloud-amd64-secureboot.iso"
echo "Download URL: $TALOS_ISO_URL"

# You can download manually or use:
# curl -L -o talos-linux.v$TALOS_VERSION-amd64.iso "$TALOS_ISO_URL"
```

> \[!INFO] **Image Configuration Details**
>
> * **Schematic ID**: `36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010`
> * **Version**: Talos Linux 1.10.4 with SecureBoot support
> * **Platform**: nocloud (optimal for VM deployment)
> * **Extensions**: Enhanced for virtualized environments
>
> **Available Images**:
>
> * **SecureBoot Disk Image**: [Raw disk image](https://factory.talos.dev/image/36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010/v1.10.4/nocloud-amd64-secureboot.raw.xz)
> * **SecureBoot ISO**: [Installation ISO](https://factory.talos.dev/image/36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010/v1.10.4/nocloud-amd64-secureboot.iso)
> * **Installer Image**: `factory.talos.dev/nocloud-installer-secureboot/36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010:v1.10.4`

### Upload to Proxmox VE

1. **Download the ISO**: Download the SecureBoot ISO from the URL above
2. **Upload to Proxmox**:
   * Access the Proxmox VE web interface
   * Navigate to your storage location (e.g., `local`)
   * Select **Content** → **Upload**
   * Choose the downloaded ISO
   * Rename to `talos-linux.v1.10.4-amd64.iso` for consistency

## Step 3: Create and Configure VM

Create a virtual machine optimized for Talos Linux deployment.

### VM Creation Command Line (Optional)

```bash {"ignore":true}
# Create VM using Proxmox CLI (if pvesh is available)
pvesh create /nodes/"$PVE_NODE"/qemu \
  --vmid "$VM_ID" \
  --name "$VM_NAME" \
  --memory 8192 \
  --cores 4 \
  --sockets 1 \
  --cpu x86-64-v2-AES \
  --machine q35 \
  --bios ovmf \
  --efidisk0 "$PVE_STORAGE":1,format=raw \
  --scsi0 "$PVE_STORAGE":32,format=raw,iothread=1 \
  --scsi1 "$PVE_STORAGE":64,format=raw,iothread=1,ssd=1 \
  --scsihw virtio-scsi-single \
  --net0 virtio,bridge=vmbr1,tag=2,firewall=1 \
  --cdrom local:iso/talos-linux.v1.10.4-amd64.iso \
  --boot order=cdrom \
  --agent enabled=1
```

### Manual VM Configuration

Create a VM with the following specifications through the Proxmox VE web interface:

#### General Settings

| Field         | Value                        |
| ------------- | ---------------------------- |
| Node          | pve-01 (or your node name)   |
| VM ID         | 2411000                      |
| Name          | tal01.lungmen.akn.chezmoi.sh |
| Resource Pool | (empty)                      |

> \[!NOTE] **VM ID Format**
>
> The VM ID follows this format: `24XXXXX` where:
>
> * `2......` indicates a VM instance (0 = LXC, 1 = VM, 9 = Templates)
> * `.4.....` indicates Talos OS (0 = unknown, 1 = Alpine, 2 = Ubuntu, 3 = Windows, 4 = Talos)
> * `..110..` represents Talos version 1.10
> * `.....0.` indicates cluster 0
> * `......0` indicates node 0

#### OS Configuration

| Field                      | Value                         |
| -------------------------- | ----------------------------- |
| Use CD/DVD disc image file | ✔️                            |
| Storage                    | local                         |
| ISO image                  | talos-linux.v1.10.4-amd64.iso |
| Guest OS Type              | Linux                         |
| Guest OS Version           | 6.x - 2.6 Kernel              |

#### System Configuration

| Field           | Value                |
| --------------- | -------------------- |
| Graphic card    | Default              |
| Machine         | q35                  |
| BIOS (Firmware) | OVMF (UEFI)          |
| Add EFI Disk    | ✔️                   |
| EFI Storage     | nvme-lvm             |
| Format          | Raw disk image (raw) |
| Pre-Enroll keys | ❌                    |
| SCSI Controller | VirtIO SCSI single   |
| Qemu Agent      | ✔️                   |
| Add TPM         | ❌                    |

#### Storage Configuration

**Root Disk (SCSI 0)**:

| Field           | Value                |
| --------------- | -------------------- |
| Bus/Device      | SCSI 0               |
| Storage         | nvme-lvm             |
| Disk size (GiB) | 32                   |
| Format          | Raw disk image (raw) |
| Cache           | Default (No cache)   |
| IO thread       | ✔️                   |
| SSD Emulation   | ❌                    |

**Data Disk (SCSI 1)**:

| Field           | Value                |
| --------------- | -------------------- |
| Bus/Device      | SCSI 1               |
| Storage         | nvme-lvm             |
| Disk size (GiB) | 64                   |
| Format          | Raw disk image (raw) |
| Cache           | Default (No cache)   |
| IO thread       | ✔️                   |
| SSD Emulation   | ✔️                   |

> \[!INFO] **Disk Purpose**
>
> * **Root Disk (32GB)**: Contains Talos system, ephemeral storage, and container images
> * **Data Disk (64GB)**: Used for persistent storage, including Longhorn volumes and application data

#### CPU Configuration

| Field   | Value         |
| ------- | ------------- |
| Sockets | 1             |
| Cores   | 4             |
| Type    | x86-64-v2-AES |

#### Network Configuration

| Field    | Value                    |
| -------- | ------------------------ |
| Bridge   | vmbr1                    |
| VLAN Tag | 2                        |
| Model    | VirtIO (paravirtualized) |
| MAC addr | auto                     |
| Firewall | ✔️                       |

#### VM Description and Labels

Add the following description for documentation:

```html
<div align='center'>
# 「龙门」- Lungmen

<br/>

Lungmen is a personal self-hosted platform for home services, designed to provide a complete ecosystem for media
management, life organization, and automation.

<br/>

See [README](https://github.com/chezmoi-sh/arcane/blob/main/projects/lungmen.akn/README.md) for more information.

</div>
```

Add these labels:

* `amd64`
* `talos-linux`

## Step 4: Verify VM Deployment

After creating the VM, verify proper deployment and Talos boot.

```bash {"ignore":true}
# Start the VM if not already started
# (Through Proxmox web interface or CLI)

# Wait for Talos to boot (2-3 minutes)
ping -c 3 "$TALOS_NODE_IP"

# Test Talos API availability
curl -k https://"$TALOS_NODE_IP":50000/api/v1alpha1/version || echo "Talos still booting..."

# Verify QEMU guest agent is responding
# (Check through Proxmox web interface - VM should show IP address)
```

> \[!TIP]
> Create DNS records for your cluster endpoints:
>
> ```txt
> kubernetes.lungmen.akn.chezmoi.sh -> "$TALOS_NODE_IP"
> *.lungmen.akn.chezmoi.sh -> "$TALOS_NODE_IP"  # For ingress
> ```

**Expected VM Status:**

* VM shows as running in Proxmox
* IP address visible in Proxmox (QEMU guest agent working)
* Talos API responding on port 50000
* Network connectivity confirmed

***

## Step 5: Generate Talos Configuration

Generate the machine configuration files required for the Talos cluster.

> \[!CAUTION]
> Ensure you save the generated secrets.yaml file securely, as it contains sensitive information and is required to generate compatible configurations for additional nodes.

```bash {"ignore":true}
# Create working directory
mkdir -p generated

# Generate secrets file (save this securely!)
talosctl gen secrets --output-file generated/secrets.yaml

# Generate configuration files with custom patches
talosctl gen config lungmen.akn https://kubernetes.lungmen.akn.chezmoi.sh:6443 \
  --output generated \
  --output-types controlplane,talosconfig \
  --with-secrets generated/secrets.yaml \
  --config-patch @../src/infrastructure/talos/lungmen-akn-01.patch-config.yaml \
  --config-patch @../src/infrastructure/talos/lungmen-akn-01.volumes.yaml

# Configure talosconfig for the current node
yq '.contexts."lungmen.akn".endpoints = ["'"$TALOS_NODE_IP"'"]' generated/talosconfig --inplace
yq '.contexts."lungmen.akn".nodes = ["'"$TALOS_NODE_IP"'"]' generated/talosconfig --inplace
```

> \[!INFO] **What this does**
>
> * **Secrets Generation**: Creates cluster-wide cryptographic materials
>   * `secrets.yaml` - Contains sensitive certificates and keys
> * **Configuration Files**: Generates node-specific configurations
>   * `controlplane.yaml` - Control plane node configuration
>   * `talosconfig` - Client configuration for talosctl
> * **Custom Patches Applied**:
>   * `lungmen-akn-01.patch-config.yaml` - Node-specific settings (hostname, networking, extensions)
>   * `lungmen-akn-01.volumes.yaml` - Disk partitioning and mount points
>
> **Configuration Patch Details:**
>
> The patch files contain lungmen.akn-specific customizations:
>
> * **Machine Configuration**: Sets hostname and certificate SANs
> * **Disk Configuration**: Configures root and data partitions
> * **Network Settings**: Configures static networking if required
> * **Kubernetes Features**: Enables security features and custom settings
> * **System Extensions**: Ensures iSCSI, QEMU agent, and utilities are loaded

**Generated files structure:**

```txt
generated/
├── secrets.yaml         # Cluster secrets (store securely!)
├── controlplane.yaml    # Control plane configuration
└── talosconfig          # Client configuration
```

## Step 6: Apply Configuration

Apply the generated configuration to the Talos node.

```bash {"ignore":true}
# Apply control plane configuration
talosctl apply-config --insecure \
  --talosconfig "generated/talosconfig" \
  --endpoints "$TALOS_NODE_IP" \
  --nodes "$TALOS_NODE_IP" \
  --file generated/controlplane.yaml
```

> \[!INFO] **What this does**
>
> * `--insecure` bypasses certificate validation (required for initial bootstrap)
> * Applies the control plane configuration to the VM
> * Triggers Talos to reconfigure according to the provided settings
> * The VM will reboot and configure itself as a Kubernetes control plane

> \[!WARNING]
> The node will reboot after applying configuration. Wait 2-3 minutes before proceeding to the bootstrap step.

## Step 7: Bootstrap Cluster

Initialize the Kubernetes cluster on the control plane node.

```bash {"ignore":true}
# Wait for node to finish rebooting and be ready (3-5 minutes)
echo "Waiting for Talos to be ready after configuration..."
sleep 180

# Bootstrap the Kubernetes cluster
talosctl bootstrap \
  --talosconfig "generated/talosconfig" \
  --endpoints "$TALOS_NODE_IP" \
  --nodes "$TALOS_NODE_IP"
```

> \[!INFO] **What this does**
>
> * Initializes the Kubernetes cluster by starting etcd
> * Starts all control plane components:
>   * kube-apiserver (Kubernetes API server)
>   * kube-controller-manager (Controller manager)
>   * kube-scheduler (Pod scheduler)
> * Creates initial cluster state and certificates

> \[!WARNING]
> The bootstrap command should only be run **once per cluster**. Running it multiple times can cause cluster state corruption.

## Step 8: Retrieve Kubeconfig

Get the Kubernetes configuration file to interact with the cluster.

```bash {"ignore":true}
# Retrieve kubeconfig from the cluster
talosctl kubeconfig \
  --talosconfig "generated/talosconfig" \
  --endpoints "$TALOS_NODE_IP" \
  --nodes "$TALOS_NODE_IP" \
  --force \
  --merge=false \
  generated/kubeconfig
```

> \[!INFO] **What this does**
>
> * Downloads the cluster's kubeconfig from the control plane
> * `--force` overwrites any existing kubeconfig file
> * `--merge=false` creates a standalone kubeconfig file
> * Saves configuration to `generated/kubeconfig`

## Step 9: Verify Cluster

Verify that the Kubernetes cluster is running and accessible.

```bash {"ignore":true}
# Check cluster connectivity
kubectl --kubeconfig "generated/kubeconfig" cluster-info

# Verify node status
kubectl --kubeconfig "generated/kubeconfig" get nodes -o wide

# Check system pods
kubectl --kubeconfig "generated/kubeconfig" get pods -A

# Verify cluster components
kubectl --kubeconfig "generated/kubeconfig" get componentstatuses
```

**Expected output:**

```txt
# kubectl get nodes
NAME                     STATUS   ROLES           AGE   VERSION
tal01.lungmen.akn.chezmoi.sh   Ready    control-plane   5m    v1.30.x

# kubectl get pods -A
NAMESPACE     NAME                                       READY   STATUS    RESTARTS
kube-system   coredns-xxx                                1/1     Running   0
kube-system   kube-apiserver-tal01.lungmen.akn.chezmoi.sh    1/1     Running   0
kube-system   kube-controller-manager-tal01.lungmen.akn.chezmoi.sh  1/1     Running   0
kube-system   kube-proxy-xxx                             1/1     Running   0
kube-system   kube-scheduler-tal01.lungmen.akn.chezmoi.sh   1/1     Running   0
```

### Cluster Validation Checklist

* [ ] Node shows `Ready` status with control-plane role
* [ ] All system pods are `Running` without restarts
* [ ] kubectl commands respond without errors
* [ ] CoreDNS is operational
* [ ] Kubernetes API is accessible
* [ ] Node has expected IP address and hostname

***

## Step 10: Save Talos Configuration

Before proceeding with ArgoCD integration, save the current Talos configuration to a file.

```bash {"ignore":true}
# Save the current Talos configuration
talosctl config merge generated/talosconfig

# Save the current configuration to vault
talosctl config save
```

> \[!INFO] **What this does**
>
> * Saves the current Talos configuration to OpenBao vault
> * Ensures configuration is backed up and can be restored later

## Step 11: Add to ArgoCD

Register the lungmen.akn cluster with ArgoCD (running on amiya.akn) for GitOps-based application management.

### Prerequisites for ArgoCD Integration

Ensure you have:

* Access to the ArgoCD instance on amiya.akn
* ArgoCD CLI authenticated
* Proper network connectivity between clusters

### Login to ArgoCD

```bash {"ignore":true}
# Set ArgoCD server endpoint
export ARGOCD_SERVER="argocd.akn.chezmoi.sh"

# Login to ArgoCD
argocd login $ARGOCD_SERVER --sso

# Alternative: Using port-forward if direct access is unavailable
# kubectl port-forward svc/argocd-server -n argocd 8080:443 &
# argocd login localhost:8080
```

### Register Cluster

```bash {"ignore":true}
# Ensure the lungmen.akn context is active
kubectl config current-context

# Add the cluster to ArgoCD with a descriptive name
argocd cluster add lungmen.akn --name lungmen.akn

# Alternative: If your context name differs
# argocd cluster add <your-context-name> --name lungmen.akn
```

> \[!INFO] **What this does**
>
> * Registers the lungmen.akn cluster in ArgoCD's cluster registry
> * Creates necessary service accounts and RBAC permissions
> * Enables ArgoCD to deploy applications to the cluster
> * The cluster will appear in ArgoCD's web interface under Settings > Clusters

## Step 12: Verify ArgoCD Integration

Confirm that ArgoCD can successfully communicate with the cluster and begin application deployment.

### Verify Cluster Registration

```bash {"ignore":true}
# List all clusters in ArgoCD
argocd cluster list

# Check specific cluster details
argocd cluster get https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Verify from ArgoCD UI
echo "Check https://$ARGOCD_SERVER/settings/clusters for lungmen.akn"
```

### Monitor Application Deployment

Once registered, ArgoCD will automatically begin deploying applications based on ApplicationSet configurations.

```bash {"ignore":true}
# Check applications being deployed to lungmen.akn
argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Monitor synchronization status
watch argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Check for any synchronization issues
argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443 --output wide
```

### Verify Application Health

```bash {"ignore":true}
# Check application health status
argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443 --selector health!=Healthy

# Get details of specific applications if needed
argocd app get <application-name>

# Monitor cluster resources
kubectl get pods -A
kubectl get services -A
kubectl get ingress -A
```

**Expected Results:**

* Cluster appears in ArgoCD cluster list with "Successful" connection status
* Applications begin deploying automatically via ApplicationSets
* All applications show "Synced" and "Healthy" status
* Cluster resources (pods, services) are being created

### Troubleshooting ArgoCD Integration

If ArgoCD cannot connect to the cluster:

```bash {"ignore":true}
# Test connectivity from ArgoCD namespace
kubectl run test-connection --image=curlimages/curl -it --rm --restart=Never \
  -- curl -k https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Check ArgoCD service account permissions
kubectl auth can-i "*" "*" --as=system:serviceaccount:argocd:argocd-application-controller

# Verify cluster secret in ArgoCD
kubectl get secrets -n argocd -l argocd.argoproj.io/secret-type=cluster
```

If authentication fails:

```bash {"ignore":true}
# Regenerate kubeconfig if needed
talosctl kubeconfig --nodes "$TALOS_NODE_IP" --force

# Remove and re-add the cluster to ArgoCD
argocd cluster rm https://kubernetes.lungmen.akn.chezmoi.sh:6443
argocd cluster add lungmen.akn --name lungmen.akn
```

## Completion

Your lungmen.akn Talos cluster is now fully operational and integrated with ArgoCD for GitOps-based application management. The cluster provides:

* **Secure Kubernetes Environment**: Running on Talos Linux with security hardening
* **GitOps Integration**: Managed by ArgoCD for automated application deployment
* **Persistent Storage**: Configured with separate root and data partitions
* **VM Integration**: Optimized for Proxmox VE with guest agent support

### Next Steps

1. **Monitor Application Deployment**: Watch ArgoCD deploy applications automatically
2. **Configure Ingress**: Set up ingress controllers for external access
3. **Set Up Monitoring**: Deploy observability stack for cluster health
4. **Backup Configuration**: Store the generated secrets.yaml securely
5. **Documentation**: Update any environment-specific documentation

### Key Generated Files

Ensure these files are backed up securely:

* `generated/secrets.yaml` - **Critical**: Required for cluster expansion
* `generated/kubeconfig` - For kubectl access
* `generated/talosconfig` - For talosctl management
* `generated/controlplane.yaml` - Node configuration reference

> \[!WARNING]
> The `secrets.yaml` file contains sensitive cryptographic material and must be stored securely. It's required to add additional nodes or recover the cluster configuration.
