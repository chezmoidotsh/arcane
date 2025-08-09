# Cluster Bootstrap with ArgoCD

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)
* [GitHub App Configuration](#github-app-configuration)
* [Cluster Initialization](#cluster-initialization)
* [Deployment Order](#deployment-order)
* [Verification](#verification)
* [Troubleshooting](#troubleshooting)
* [References](#references)

## Introduction

This document describes the process of bootstrapping an empty Kubernetes cluster using ArgoCD. It covers the necessary steps to initialize and configure a cluster ready to host applications, including the setup of essential infrastructure components and the deployment of ArgoCD for GitOps-based application management.

## Prerequisites

Before proceeding, ensure you have:

* An operational Kubernetes cluster
* Cluster-admin access to the cluster
* A configured GitHub App for ArgoCD (see [GitHub App Configuration](#github-app-configuration))
* The following environment variables set:

```bash
export GITHUB_APP_ID=1234567890
export GITHUB_INSTALLATION_ID=1234567890
export GITHUB_PRIVATE_KEY_PATH=/path/to/github/app/private/key.pem
export AGE_KEY_PATH=/path/to/age/key.age
```

## GitHub App Configuration

### 1. Create GitHub App

1. Navigate to [GitHub Settings > Developer settings > GitHub Apps](https://github.com/settings/apps)
2. Click "New GitHub App"
3. Configure with these settings:
   * **GitHub App name**: `argocd-chezmoi-sh`
   * **Homepage URL**: `https://argocd.chezmoi.sh`
   * **Webhook**: Disabled
   * **Repository permissions**:
     * Contents: Read & write
     * Metadata: Read-only
     * Pull requests: Read-only
   * **Where can this GitHub App be installed?**: Only on this account

### 2. Generate Credentials

After creation, note:

* **App ID**: The application identifier
* **Client ID**: For OAuth authentication
* **Client Secret**: For OAuth authentication

Generate a private key:

* Click "Generate a private key"
* Save the generated `.pem` file

### 3. Install App

1. Go to the app settings
2. Click "Install App"
3. Select the repositories ArgoCD should have access to
4. Note the **Installation ID** after installation

## Cluster Initialization

### 1. Create Required Secrets

#### GitHub Secrets for ArgoCD

```bash
kubectl create namespace argocd # if not already created
kubectl create --namespace argocd secret generic argocd-repo-creds-github.chezmoidotsh \
  --from-literal=url=https://github.com/chezmoidotsh \
  --from-literal=githubAppID=$GITHUB_APP_ID \
  --from-literal=githubAppInstallationID=$GITHUB_INSTALLATION_ID \
  --from-file=githubAppPrivateKey=$GITHUB_PRIVATE_KEY_PATH
kubectl label --namespace argocd secret argocd-repo-creds-github.chezmoidotsh argocd.argoproj.io/secret-type=repo-creds
```

#### SOPS Secrets for Encryption

```bash
kubectl create --namespace argocd secret generic argocd-sops-age-key \
  --from-file=age-key=$AGE_KEY_PATH
```

### 2. Install ArgoCD

Apply the bootstrap kustomization:

```bash
kubectl kustomize --enable-helm --load-restrictor LoadRestrictionsNone bootstrap/kustomize | kubectl create --namespace argocd -f -
```

### 3. Access ArgoCD

Access the ArgoCD UI using port-forwarding:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Access the UI at `http://localhost:8080`

### 4. Initial Login

Retrieve the initial admin password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

## Deployment Order

Deploy applications in this specific order:

1. `kubevault` and `shoot`
2. `external-secret`
3. `cert-manager` (requires Crossplane for Let's Encrypt secrets)
4. `cilium`, `envoy-gateway`, and `external-dns`
5. `tailscale`
6. `argocd` (in this order: ExternalSecret, all components except controller, then controller)
7. `longhorn` and `crossplane`

* NOTE: for `crossplane`, we need to deploy first the `crossplane-chezmoi.sh` application, and firstly all `Crossplane` providers, required to deploy all CRDs.

8. Other applications

> \[!WARNING]
> ArgoCD must be deployed after external-secret to prevent dead-lock. If this occurs, remove the controller's environment variables (ALL\_PROXY, HTTP\_PROXY, HTTPS\_PROXY) and restart it.

## Verification

Verify the installation:

```bash
# Check ArgoCD pods
kubectl get pods -n argocd

# Verify applications are syncing
kubectl get applications -n argocd
```

## Troubleshooting

### ArgoCD Installation Issues

If ArgoCD fails to install:

1. Ensure external-secret is deployed first
2. If dead-lock occurs:
   ```bash
   # Remove proxy environment variables
   kubectl set env statefulset/argocd-application-controller -n argocd ALL_PROXY- HTTP_PROXY- HTTPS_PROXY-
   # Restart the controller
   kubectl rollout restart statefulset/argocd-application-controller -n argocd
   ```

### Port-Forward Issues

When accessing ArgoCD:

* Use HTTP instead of HTTPS
* If port-forward is lost (e.g., during ArgoCD sync), re-establish it:
  ```bash
  kubectl port-forward svc/argocd-server -n argocd 8080:443
  ```

## References

* [ArgoCD Documentation](https://argo-cd.readthedocs.io/en/stable/)
* [GitHub Apps Documentation](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps#about-github-apps)
* [ArgoCD Private Repositories Guide](https://argo-cd.readthedocs.io/en/stable/user-guide/private-repositories/#github-app-credential)
