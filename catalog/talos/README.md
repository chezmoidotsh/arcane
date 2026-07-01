# Talos Bootstrap Manifests

This directory contains all Kubernetes manifests that are automatically deployed during the **bootstrap** of a Talos Linux cluster. These components are essential for the proper functioning of the cluster and must be available from the initial startup.

## Why at bootstrap and not post-installation?

These manifests are deployed at bootstrap for several critical reasons:

* **System dependencies**: Some components (like Cilium) are required for networking to function
* **Immediate availability**: These services must be operational before any other deployment
* **Cluster stability**: The cluster cannot function properly without these base components
* **Prerequisites for ArgoCD**: ArgoCD itself needs these services to be in place to function

## Available manifests

### 🌐 Cilium

**Available versions:** `1.19.5-native`, `1.18.1`, `1.17.3`

Cilium is a CNI (Container Network Interface) that provides the network layer for the Kubernetes cluster. It replaces flannel/kube-proxy and offers a more efficient and secure networking solution with support for Network Policies, Service Mesh, and Kubernetes Gateway.

* `1.19.5-native` — active, native-routing variant for Proxmox/SDN clusters
* `1.18.1` — legacy, non-native; retained for pre-Omni bootstrap reference
* `1.17.3` — legacy, non-native; retained for pre-Omni bootstrap reference

The `-native` variants use native routing mode (`routingMode=native`, `kubeProxyReplacement=true`, `l2announcements=true`) for Proxmox/SDN clusters where pod CIDRs are routable between nodes without overlay encapsulation.

* **Documentation:** [Cilium Documentation](https://docs.cilium.io/)
* **Criticality:** Essential - Without CNI, the cluster cannot function

### 🔍 CoreDNS + Tailscale

**Available versions:** `1.12.1`

Custom CoreDNS configuration that allows redirecting DNS queries for `*.ts.net` domains to Tailscale's Magic DNS. This configuration is made for TalosOS with the service CIDR `10.96.0.0/16`.

* **Documentation:** [CoreDNS](https://coredns.io/) | [Tailscale Magic DNS](https://tailscale.com/kb/1081/magicdns)
* **Usage:** Useful for all clusters using Tailscale
* **Criticality:** Important - Improves user experience with Tailscale

### 📜 Kubelet Serving Cert Approver

**Available versions:** `0.9.1`, `0.11.0`

Component that automates the approval of TLS certificates for kubelets. Required for the Metrics Server to function properly and collect node metrics.

* **Documentation:** [Kubelet Serving Cert Approver](https://github.com/alex1989hu/kubelet-serving-cert-approver)
* **Usage:** Required on all clusters
* **Criticality:** Essential - Without kubelet certificates, no metrics or monitoring

### 📊 Metrics Server

**Available versions:** `0.7.2`, `0.8.1`

> \[!TODO]
> This component should not be deployed at bootstrap and should be managed by ArgoCD instead. It's currently here temporarily.

Component that collects resource metrics (CPU, memory) from nodes and pods in the cluster. Required for HPA (Horizontal Pod Autoscaler) functionality and `kubectl top` commands.

* **Documentation:** [Metrics Server](https://github.com/kubernetes-sigs/metrics-server)
* **Usage:** Temporary - Should be managed by ArgoCD in the future
* **Criticality:** Important - Required for autoscaling and monitoring
