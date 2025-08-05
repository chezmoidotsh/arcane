<!-- markdownlint-disable MD033 -->

# Kubernetes Cluster Bootstrap

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)
* [Adding Cluster to ArgoCD](#adding-cluster-to-argocd)
* [Verification](#verification)
* [Troubleshooting](#troubleshooting)
* [References](#references)

## Introduction

This document describes the process of adding a Kubernetes cluster to ArgoCD for GitOps-based management. Once the Talos cluster is bootstrapped and operational, the next step is to register it with ArgoCD (running on amiya.akn) to enable automated application deployment and management.

## Prerequisites

Before proceeding, ensure you have:

* A bootstrapped Talos cluster (see [BOOTSTRAP\_TALOS.md](./BOOTSTRAP_TALOS.md))
* Access to the ArgoCD instance running on amiya.akn
* Cluster-admin access to both the source (amiya.akn) and target (lungmen.akn) clusters
* `kubectl` configured with contexts for both clusters
* `argocd` CLI tool installed

> \[!WARNING]
> Ensure you have exported the following variables:
>
> ```sh
> export TALOS_NODE_IP=<node-ip-address>
> export ARGOCD_SERVER=argocd.akn.chezmoi.sh
> ```

## Adding Cluster to ArgoCD

### 1. Login to ArgoCD

First, authenticate with the ArgoCD server:

```bash
# Login using the ArgoCD CLI
argocd login $ARGOCD_SERVER

# Alternatively, if using port-forward
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
argocd login localhost:8080
```

### 2. Add the Cluster

Add the lungmen.akn cluster to ArgoCD using the official ArgoCD documentation method:

```bash
# Ensure you're using the correct kubeconfig context for lungmen.akn
kubectl config current-context

# Add the cluster to ArgoCD
argocd cluster add lungmen.akn --name lungmen.akn

# Alternatively, if your context has a different name
argocd cluster add <your-lungmen-context-name> --name lungmen.akn
```

### 3. Verify Cluster Addition

List the clusters registered in ArgoCD:

```bash
# Using ArgoCD CLI
argocd cluster list

# Using kubectl (check the cluster secrets)
kubectl get secrets -n argocd -l argocd.argoproj.io/secret-type=cluster
```

## Verification

### 1. Check Cluster Status

Verify the cluster is healthy and reachable:

```bash
# Check cluster status in ArgoCD
argocd cluster get https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Verify from ArgoCD UI
# Navigate to Settings > Clusters in the ArgoCD web interface
```

### 2. Verify Automatic Application Deployment

Once the cluster is added to ArgoCD, applications will automatically be deployed based on the ApplicationSet configurations. Monitor the deployment progress:

```bash
# Check all applications for the lungmen.akn cluster
argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Monitor application synchronization status
argocd app sync --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443

# Check for any out-of-sync applications
argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443 --selector sync=OutOfSync
```

### 3. Verify Application Health

Check that all deployed applications are healthy:

```bash
# Get application health status
argocd app list --cluster https://kubernetes.lungmen.akn.chezmoi.sh:6443 --output wide

# Check specific application details if needed
argocd app get <application-name>

# Verify from ArgoCD UI
# Navigate to Applications and filter by cluster to see all lungmen.akn applications
```

## Troubleshooting

### Connection Issues

If ArgoCD cannot connect to the cluster:

1. **Check network connectivity:**
   ```bash
   # From the ArgoCD namespace, test connectivity to the cluster
   kubectl run test-pod --image=curlimages/curl -it --rm -- \
     curl -k https://kubernetes.lungmen.akn.chezmoi.sh:6443
   ```

2. **Verify certificates:**
   ```bash
   # Check if the cluster certificate is valid
   openssl s_client -connect kubernetes.lungmen.akn.chezmoi.sh:6443 -servername kubernetes.lungmen.akn.chezmoi.sh
   ```

3. **Check service account permissions:**
   ```bash
   # Verify the ArgoCD service account has proper permissions
   kubectl auth can-i "*" "*" --as=system:serviceaccount:argocd:argocd-application-controller
   ```

### Authentication Issues

If authentication fails:

1. **Regenerate kubeconfig:**
   ```bash
   # From the Talos node
   talosctl kubeconfig \
     --endpoints $TALOS_NODE_IP \
     --nodes $TALOS_NODE_IP \
     --force
   ```

2. **Update cluster credentials:**
   ```bash
   # Remove and re-add the cluster
   argocd cluster rm https://kubernetes.lungmen.akn.chezmoi.sh:6443
   argocd cluster add lungmen.akn --name lungmen.akn
   ```

## References

* [ArgoCD Cluster Management](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#clusters)
* [ArgoCD CLI Documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_cluster/)
* [Adding Clusters - Official Guide](https://argo-cd.readthedocs.io/en/stable/getting_started/#5-register-a-cluster-to-deploy-apps-to-optional)

***

<div align="left">
  <a href="./BOOTSTRAP_TALOS.md">Previous: BOOTSTRAP_TALOS.md</a>
</div>
