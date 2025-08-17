# Bootstrap Talos cluster on Hetzner Cloud

<details>
<summary><strong>TL;DR</strong></summary>

Deploy a complete Talos Kubernetes cluster on cost-optimized CAX11 ARM instances (€3.29/month) using Hetzner Cloud. From instance creation to running cluster in one workflow.

```bash {"name":"Create the cloud instance","interpreter":"bash","ignore":true}
set -e

# === Core Configuration Variables ===
export HCLOUD_TOKEN="your-token-here"

# Auto-discover latest Talos ARM64 ISO
TALOS_ISO=$(hcloud iso list -o noheader -o columns=name | grep -E "talos.*arm64" | head -1)

# Deploy CAX11 instance with ISO boot
hcloud server create --name "kazimierz.akn-cp01" --image debian-11 --type cax11 \
  --location fsn1 \
  --label "talos.io/cluster=kazimierz.akn" \
  --label "talos.io/role=controlplane" \
  --start-after-create=false
hcloud server attach-iso "kazimierz.akn-cp01" ${TALOS_ISO}
hcloud server poweron "kazimierz.akn-cp01"

# Create firewall (but don't apply yet - need ports 6443/50000 for bootstrap)
hcloud firewall create --name "kazimierz:web-only" \
  --label "talos.io/cluster=kazimierz.akn"
hcloud firewall add-rule --direction in --source-ips 0.0.0.0/0 --port 80 --protocol tcp "kazimierz:web-only"
hcloud firewall add-rule --direction in --source-ips ::/0 --port 80 --protocol tcp "kazimierz:web-only"
hcloud firewall add-rule --direction in --source-ips 0.0.0.0/0 --port 443 --protocol tcp "kazimierz:web-only"
hcloud firewall add-rule --direction in --source-ips ::/0 --port 443 --protocol tcp "kazimierz:web-only"

# Wait for Talos to boot, then bootstrap cluster
TALOS_IPV4=$(hcloud server ip kazimierz.akn-cp01)
mkdir generated

# Generate secrets and configuration
talosctl gen secrets --output-file generated/secrets.yaml
talosctl gen config kazimierz.akn https://kubernetes.kazimierz.akn.chezmoi.sh:6443 \
  --output generated \
  --output-types controlplane,talosconfig \
  --with-secrets generated/secrets.yaml \
  --config-patch @../src/infrastructure/talos/kazimierz-akn-01.config-patch.yaml
yq '.contexts."'kazimierz.akn'".endpoints = ["'kubernetes.kazimierz.akn.chezmoi.sh'"]' generated/talosconfig --inplace

# Apply configuration and bootstrap
export TALOSCONFIG="generated/talosconfig"
talosctl apply-config --insecure --nodes kubernetes.kazimierz.akn.chezmoi.sh --file generated/controlplane.yaml
talosctl bootstrap --nodes kubernetes.kazimierz.akn.chezmoi.sh
talosctl kubeconfig --nodes kubernetes.kazimierz.akn.chezmoi.sh --force --merge=false generated/kubeconfig
export KUBECONFIG="generated/kubeconfig"

# Install Tailscale before applying firewall
kubectl create namespace tailscale-system
# Create OAuth secret using OpenBao or environment variables
kubectl create secret generic operator-oauth -n tailscale-system \
  --from-literal=client_id="$(bao kv get -field=client_id shared/third-parties/tailscale/oauth/operator-bootstrap)" \
  --from-literal=client_secret="$(bao kv get -field=client_secret shared/third-parties/tailscale/oauth/operator-bootstrap)"
helm repo add tailscale https://pkgs.tailscale.com/helmcharts
helm install tailscale-operator tailscale/tailscale-operator \
  --namespace tailscale-system \
  --values @defaults/kubernetes/tailscale/helm/default.helmvalues.yaml \
  --set operatorConfig.hostname=kazimierz-akn

# Apply firewall after cluster and Tailscale are ready
hcloud firewall apply-to-resource "kazimierz:web-only" --type server --server "kazimierz.akn-cp01"
```

</details>

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)

### Part 1: Hetzner Cloud Instance

* [Step 1: Environment Setup](#step-1-environment-setup)
* [Step 2: Deploy CAX11 Instance](#step-2-deploy-cax11-instance)
* [Step 3: Attach ISO, Create Firewall and Power On](#step-3-attach-iso-create-firewall-and-power-on)
* [Step 4: Verify Instance Deployment](#step-4-verify-instance-deployment)

### Part 2: Talos Cluster Bootstrap

* [Step 5: Generate Talos Configuration](#step-5-generate-talos-configuration)
* [Step 6: Apply Configuration](#step-6-apply-configuration)
* [Step 7: Bootstrap Cluster](#step-7-bootstrap-cluster)
* [Step 8: Retrieve Kubeconfig](#step-8-retrieve-kubeconfig)
* [Step 9: Verify Cluster](#step-9-verify-cluster)
* [Step 10: Install Tailscale](#step-10-install-tailscale)
* [Step 11: Apply Security Firewall](#step-11-apply-security-firewall)

## Introduction

This document describes the complete process of deploying a Talos Kubernetes cluster on Hetzner Cloud using CAX11 ARM servers. The guide covers both instance creation with ISO boot and Talos cluster bootstrapping in a single workflow. The CAX11 provides optimal cost-efficiency at €3.29/month with 2 vCPUs, 4GB RAM, and 40GB NVMe storage.

## Prerequisites

### Dependencies

Ensure you have the following CLI tools installed:

| Tool       | Version | Purpose                    | Installation                                                           |
| ---------- | ------- | -------------------------- | ---------------------------------------------------------------------- |
| `hcloud`   | latest  | Hetzner Cloud API client   | [Download](https://github.com/hetznercloud/cli)                        |
| `talosctl` | latest  | Talos Linux management     | [Download](https://www.talos.dev/v1.10/talos-guides/install/talosctl/) |
| `kubectl`  | latest  | Kubernetes client          | [Download](https://kubernetes.io/docs/tasks/tools/)                    |
| `helm`     | latest  | Kubernetes package manager | [Download](https://helm.sh/docs/intro/install/)                        |
| `yq`       | latest  | YAML processor             | [Download](https://github.com/mikefarah/yq)                            |
| `bao`      | latest  | OpenBao CLI (optional)     | [Download](https://github.com/openbao/openbao)                         |

> \[!TIP]
> If you're using the `mise` tool manager (recommended for this project), run `mise install` in the project root to automatically install all required dependencies.

### Hetzner Cloud API Token

1. **Create Hetzner Cloud Account**: Sign up at [console.hetzner.cloud](https://console.hetzner.cloud)
2. **Generate API Token**:
   * Go to **Security** → **API Tokens** in the Hetzner Cloud Console
   * Click **Generate API Token**
   * Name: `kazimierz-deployment` (or any descriptive name)
   * Permissions: **Read & Write**
   * Copy the token immediately (it won't be shown again)

## Step 1: Environment Setup

Before creating the instance, set up your environment variables for consistent deployment.

### Centralized Variables

```bash {"ignore":true}
# === Core Configuration Variables ===
export HCLOUD_TOKEN="your-token-here"

# === Tailscale OAuth Credentials ===
# Option 1: Using OpenBao (recommended)
TAILSCALE_CLIENT_ID="$(bao kv get -field=client_id shared/third-parties/tailscale/oauth/operator-bootstrap)"
TAILSCALE_CLIENT_SECRET="$(bao kv get -field=client_secret shared/third-parties/tailscale/oauth/operator-bootstrap)"

# Option 2: Direct environment variables (for manual setup)
# export TAILSCALE_CLIENT_ID="your-oauth-client-id"
# export TAILSCALE_CLIENT_SECRET="your-oauth-client-secret"
```

> \[!WARNING]
> Replace `your-token-here` with your actual Hetzner Cloud API token. The token must have **Read & Write** permissions.

## Step 2: Deploy CAX11 Instance

Create the Hetzner Cloud server instance with specific configuration for the kazimierz.akn cluster.

```bash {"ignore":true}
# Auto-discover latest Talos ARM64 ISO
TALOS_ISO=$(hcloud iso list -o noheader -o columns=name | grep -E "talos.*arm64" | head -1)

# Deploy CAX11 instance
hcloud server create --name "kazimierz.akn-cp01" --image debian-11 --type cax11 \
  --location fsn1 \
  --label "talos.io/cluster=kazimierz.akn" \
  --label "talos.io/role=controlplane" \
  --start-after-create=false
```

> \[!INFO] **Instance Configuration**
>
> * **Auto-discovery**: Finds the latest Talos ARM64 ISO automatically
> * **Server Type**: CAX11 ARM64 (2 vCPUs, 4GB RAM, 40GB NVMe) - €3.29/month
> * **Location**: Falkenstein datacenter (Germany) for optimal EU connectivity
> * **Labels**: Cluster identification and role assignment for resource management
> * **Boot Strategy**: Server stays powered off until Talos ISO is attached

## Step 3: Attach ISO, Create Firewall and Power On

Mount the Talos ISO to the server, create firewall rules, and start the instance.

```bash {"ignore":true}
hcloud server attach-iso "kazimierz.akn-cp01" ${TALOS_ISO}
hcloud server poweron "kazimierz.akn-cp01"

# Create firewall (but don't apply yet - need ports 6443/50000 for bootstrap)
hcloud firewall create --name "kazimierz:web-only" \
  --label "talos.io/cluster=kazimierz.akn"
hcloud firewall add-rule --direction in --source-ips 0.0.0.0/0 --port 80 --protocol tcp "kazimierz:web-only"
hcloud firewall add-rule --direction in --source-ips ::/0 --port 80 --protocol tcp "kazimierz:web-only"
hcloud firewall add-rule --direction in --source-ips 0.0.0.0/0 --port 443 --protocol tcp "kazimierz:web-only"
hcloud firewall add-rule --direction in --source-ips ::/0 --port 443 --protocol tcp "kazimierz:web-only"
```

> \[!INFO] **What this does**
>
> * `attach-iso`: Mounts the discovered Talos ISO to the server's virtual CD/DVD drive
> * `poweron`: Starts the server, which will boot from the attached ISO
> * `firewall create`: Creates a restrictive firewall allowing only HTTP (80) and HTTPS (443) traffic
> * **Firewall NOT applied yet**: Talos bootstrap needs ports 6443 (Kubernetes API) and 50000 (Talos API)
> * The server will boot directly into Talos Linux instead of the base Debian image
>
> **Boot process:**
>
> 1. Server powers on and detects the attached ISO
> 2. BIOS/UEFI boots from the ISO (higher priority than disk)
> 3. Talos Linux kernel loads and initializes the system
> 4. Talos API becomes available on port 50000 (after 2-3 minutes)

## Step 4: Verify Instance Deployment

```bash {"ignore":true}
# Check server status
hcloud server list --selector talos.io/cluster=kazimierz.akn

# Verify server specifications
hcloud server describe kazimierz.akn-cp01 -o table

# Check IP addresses
echo "IPv4: $(hcloud server ip kazimierz.akn-cp01)"
echo "IPv6: $(hcloud server ip --ipv6 kazimierz.akn-cp01)"
```

### Test Network Connectivity

```bash {"ignore":true}
# Get IP for testing
TALOS_IPV4=$(hcloud server ip kazimierz.akn-cp01)

# Test IPv4 connectivity
ping -c 3 ${TALOS_IPV4}
```

### Verify Talos Boot

```bash {"ignore":true}
# Wait for Talos to boot (may take 2-3 minutes)
# Check if Talos API is responding
TALOS_IPV4=$(hcloud server ip kazimierz.akn-cp01)
curl -k https://${TALOS_IPV4}:50000/api/v1alpha1/version || echo "Talos still booting..."
```

> \[!TIP]
> Create a record in your DNS provider for the Talos API endpoint:
>
> ```txt
> kubernetes.kazimierz.akn.chezmoi.sh -> ${TALOS_IPV4}
> ```

***

## Step 5: Generate Talos Configuration

Generate the machine configuration files required for the Talos cluster.

> \[!CAUTION]
> Ensure you save the generated secrets.yaml file securely, as it contains sensitive information and is required to generate a new compatible configuration.

```bash {"ignore":true}
mkdir generated

# Generate secret file if you haven't already
talosctl gen secrets --output-file generated/secrets.yaml

# Generate configuration files
talosctl gen config kazimierz.akn https://kubernetes.kazimierz.akn.chezmoi.sh:6443 \
  --output generated \
  --output-types controlplane,talosconfig \
  --with-secrets generated/secrets.yaml \
  --config-patch @../src/infrastructure/talos/kazimierz-akn-01.config-patch.yaml

# Add current node to endpoint list
yq '.contexts."'kazimierz.akn'".endpoints = ["'kubernetes.kazimierz.akn.chezmoi.sh'"]' generated/talosconfig --inplace
```

> \[!INFO] **What this does**
>
> * Creates the secrets file in `generated/` directory:
>   * `secrets.yaml` - Contains sensitive information for the cluster
> * Creates three configuration files in `generated/` directory:
>   * `controlplane.yaml` - Control plane node configuration
>   * `talosconfig` - Client configuration for talosctl
> * Configures the Kubernetes API endpoint using the instance IP
> * Applies custom configuration patches from `kazimierz-akn-01.config-patch.yaml`
>
> **Configuration Patch Details:**
>
> The `kazimierz-akn-01.config-patch.yaml` file contains cluster-specific customizations:
>
> * **Machine Configuration**: Sets hostname, certificate SANs, and Hetzner Cloud installer image
> * **Kubernetes Features**: Enables user namespaces support for enhanced security
> * **CNI Configuration**: Disables default CNI to allow Cilium installation
> * **DNS Resolver**: Enables host DNS caching with CoreDNS forwarding
> * **Extra Manifests**: Installs kubelet-serving-cert-approver and metrics-server
> * **Control Plane Scheduling**: Allows workloads on control plane nodes (single-node cluster)
>
> This approach ensures the cluster is optimized for the kazimierz.akn environment with proper security hardening.

**Generated files structure:**

```txt
generated/
├── controlplane.yaml    # Control plane configuration
├── worker.yaml          # Worker node template
└── talosconfig          # Client configuration
```

## Step 6: Apply Configuration

Apply the generated configuration to the Talos instance.

```bash {"ignore":true}
# Set the talosconfig
export TALOSCONFIG="generated/talosconfig"

# Apply control plane configuration
talosctl apply-config --insecure \
  --nodes kubernetes.kazimierz.akn.chezmoi.sh \
  --file generated/controlplane.yaml
```

> \[!INFO] **What this does**
>
> * `--insecure` flag bypasses certificate validation (needed for initial bootstrap)
> * Applies the control plane configuration to the instance
> * Triggers Talos to reconfigure the system according to the provided config
> * The instance will reboot and start configuring itself as a Kubernetes control plane

## Step 7: Bootstrap Cluster

Initialize the Kubernetes cluster on the control plane node.

```bash {"ignore":true}
# Wait for instance to be ready (may take 3-5 minutes after apply-config)
talosctl bootstrap --nodes kubernetes.kazimierz.akn.chezmoi.sh
```

This initializes the Kubernetes cluster by starting etcd and all control plane components (kube-apiserver, kube-controller-manager, kube-scheduler).

> \[!WARNING]
> The bootstrap command should only be run once per cluster. Running it multiple times can cause cluster state issues.

## Step 8: Retrieve Kubeconfig

Get the Kubernetes configuration file to interact with the cluster.

```bash {"ignore":true}
# Retrieve kubeconfig
talosctl kubeconfig --nodes kubernetes.kazimierz.akn.chezmoi.sh \
  --force \
  --merge=false \
  generated/kubeconfig

# Set KUBECONFIG environment variable
export KUBECONFIG="generated/kubeconfig"
```

> \[!INFO] **What this does**
>
> * Downloads the cluster's kubeconfig from the control plane
> * `--force` overwrites existing kubeconfig file
> * `--merge=false` creates a standalone kubeconfig (doesn't merge with existing)
> * Saves the configuration to `generated/kubeconfig`

**Kubeconfig contents:**

## Step 9: Verify Cluster

Verify that the Kubernetes cluster is running and accessible.

```bash {"ignore":true}
# Check cluster info
kubectl cluster-info

# Check node status
kubectl get nodes -o wide

# Check system pods
kubectl get pods -A

# Verify cluster health
kubectl get componentstatuses
```

**Expected output:**

```txt
# kubectl get nodes
NAME               STATUS   ROLES           AGE   VERSION
kazimierz-akn-cp01   Ready    control-plane   5m    v1.30.x

# kubectl get pods -A
NAMESPACE     NAME                                  READY   STATUS    RESTARTS
kube-system   coredns-xxx                           1/1     Running   0
kube-system   kube-apiserver-xxx                    1/1     Running   0
kube-system   kube-controller-manager-xxx           1/1     Running   0
kube-system   kube-proxy-xxx                        1/1     Running   0
kube-system   kube-scheduler-xxx                    1/1     Running   0
```

### Cluster Validation Checklist

* [ ] Node shows as `Ready` status
* [ ] All system pods are `Running`
* [ ] kubectl commands respond without errors
* [ ] CoreDNS is operational
* [ ] Kubernetes API is accessible

## Step 10: Install Tailscale

Install Tailscale on the cluster to enable secure mesh networking before applying the restrictive firewall.

### Deploy Tailscale Operator

```bash {"ignore":true}
# Create tailscale-system namespace
kubectl create namespace tailscale-system
kubectl label namespace tailscale-system \
  pod-security.kubernetes.io/audit=privileged \
  pod-security.kubernetes.io/enforce=privileged \
  pod-security.kubernetes.io/warn=privileged

# Create the OAuth secret temporarily (will be managed by External Secrets later)
# Option 1: Using OpenBao (recommended)
kubectl create secret generic operator-oauth -n tailscale-system \
  --from-literal=client_id="${TAILSCALE_CLIENT_ID}" \
  --from-literal=client_secret="${TAILSCALE_CLIENT_SECRET}"

# Option 2: Manual environment variables (if OpenBao not available)
# kubectl create secret generic operator-oauth -n tailscale-system \
#   --from-literal=client_id="your-oauth-client-id" \
#   --from-literal=client_secret="your-oauth-client-secret"

# Add Tailscale Helm repository
helm repo add tailscale https://pkgs.tailscale.com/helmcharts
helm repo update

# Install Tailscale operator with custom values
helm template tailscale-operator tailscale/tailscale-operator \
  --namespace tailscale-system \
  --values ../../../defaults/kubernetes/tailscale/helm/default.helmvalues.yaml \
  --values ../../../defaults/kubernetes/tailscale/helm/hardened.helmvalues.yaml \
  --values ../../../defaults/kubernetes/tailscale/helm/remote-cluster.helmvalues.yaml \
  --set operatorConfig.hostname=kazimierz-akn \
| kubectl create -f -
```

> \[!INFO] **Cluster Connectivity Setup**
>
> This installs the Tailscale operator to establish secure mesh networking for cluster access. Once deployed:
>
> * **Remote Management**: Enables secure `kubectl` and `talosctl` access from anywhere in your tailnet
> * **ArgoCD Integration**: This cluster will be managed by ArgoCD running on other clusters in your infrastructure
> * **Zero-Trust Access**: Provides encrypted connectivity even after applying restrictive firewall rules
>
> The cluster appears as `kazimierz-akn` in your Tailscale admin console.

### Verify Tailscale Installation

```bash {"ignore":true}
# Check Tailscale operator status
kubectl get pods -n tailscale-system

# Verify Tailscale node appears in your tailnet
kubectl logs -n tailscale-system deployment/operator -f

# Check if cluster appears in Tailscale admin console
echo "Check https://login.tailscale.com/admin/machines for kazimierz-akn node"
```

> \[!TIP]
> The cluster will appear as `kazimierz-akn` in your Tailscale admin console. You can now manage the cluster through the Tailscale network even after applying the restrictive firewall.

## Step 11: Apply Security Firewall

Now that the cluster is fully operational, apply the restrictive firewall to secure the instance.

```bash {"ignore":true}
# Apply the firewall created earlier to restrict access
hcloud firewall apply-to-resource "kazimierz:web-only" --type server --server "kazimierz.akn-cp01"

# Verify firewall is applied
hcloud firewall describe "kazimierz:web-only"
```

> \[!INFO] **What this does**
>
> * Applies the previously created firewall to the instance
>   * Talos API (50000) and Kubernetes API (6443) are no longer accessible from internet
>   * Only HTTP/HTTPS traffic can reach the instance

> \[!WARNING]
> After applying this firewall, you'll need VPN access to manage the cluster via `talosctl` or `kubectl` from external networks.

### Verification

```bash {"ignore":true}
# Test that web ports are still accessible
curl -I $(hcloud server ip kazimierz.akn-cp01):80
curl -I $(hcloud server ip kazimierz.akn-cp01):443

# Verify that management ports are blocked (should timeout)
curl --connect-timeout 5 $(hcloud server ip kazimierz.akn-cp01):6443 || echo "✅ Kubernetes API blocked"
curl --connect-timeout 5 $(hcloud server ip kazimierz.akn-cp01):50000 || echo "✅ Talos API blocked"
```
