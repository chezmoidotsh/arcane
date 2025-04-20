# Cluster Bootstrap

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)
* [Cluster Initialization](#cluster-initialization)
* [Verification](#verification)
* [Appendices](#appendices)

## Introduction

This document describes the process of bootstrapping an empty cluster. It covers the necessary steps to initialize and configure a cluster ready to host applications.

## Prerequisites

* Operational Kubernetes cluster
* Cluster-admin access to the cluster
* GitHub App configured for ArgoCD (see [Appendix A](#appendix-a))

## Cluster Initialization

<!-- trunk-ignore-begin(markdownlint/MD033) -->

<details>
<summary>User input collection (Click to expand)</summary>

This part is used to collect the necessary information when running the bootstrap script
with the `runme` tool.

```sh {"category":"argocd/bootstrap","interpreter":"bash","name":"Collect User Input"}
export GITHUB_APP_ID=1234567890
export GITHUB_INSTALLATION_ID=1234567890
export GITHUB_PRIVATE_KEY_PATH=/path/to/github/app/private/key.pem
export AGE_KEY_PATH=/path/to/age/key.age

# Check if GITHUB_PRIVATE_KEY_PATH exists
if [ ! -f "$GITHUB_PRIVATE_KEY_PATH" ]; then
  echo "Error: GitHub private key file not found at $GITHUB_PRIVATE_KEY_PATH"
  exit 1
fi

# Check if AGE_KEY_PATH exists
if [ ! -f "$AGE_KEY_PATH" ]; then
  echo "Error: Age key file not found at $AGE_KEY_PATH"
  exit 1
fi
```

In order to verify the variables, we display them in the terminal for validation.

```sh {"category":"argocd/bootstrap","interactive":"true","interpreter":"bash","name":"Verify Variables"}
echo "Collected variables:"
echo "  GitHub App ID: $GITHUB_APP_ID"
echo "  GitHub Installation ID: $GITHUB_INSTALLATION_ID"
echo "  GitHub Private Key Path: $GITHUB_PRIVATE_KEY_PATH"
echo "  AGE Key Path: $AGE_KEY_PATH"
```

</details>
<!-- trunk-ignore-end(markdownlint/MD033) -->

### 1. Manual Secrets Creation

Before deploying ArgoCD, it's necessary to manually create certain secrets that will be used later:

#### GitHub Secrets for ArgoCD

```bash {"category":"argocd/bootstrap","interactive":"true","interpreter":"bash","name":"Create GitHub Secrets"}
kubectl create --namespace argocd secret generic argocd-repo-creds-github.chezmoi-sh \
  --from-literal=url=https://github.com/chezmoi-sh \
  --from-literal=githubAppID=$GITHUB_APP_ID \
  --from-literal=githubAppInstallationID=$GITHUB_INSTALLATION_ID \
  --from-file=githubAppPrivateKey=$GITHUB_PRIVATE_KEY_PATH
kubectl label --namespace argocd secret argocd-repo-creds-github.chezmoi-sh argocd.argoproj.io/secret-type=repo-creds
```

#### SOPS Secrets for Encryption

```bash {"category":"argocd/bootstrap","interactive":"true","interpreter":"bash","name":"Create SOPS Secrets"}
kubectl create --namespace argocd secret generic argocd-sops-age-key \
  --from-file=age-key=$AGE_KEY_PATH
```

### 2. ArgoCD Installation

To install ArgoCD, apply the bootstrap kustomization:

```bash {"category":"argocd/bootstrap","interactive":"true","interpreter":"bash","name":"Install ArgoCD"}
kubectl create namespace argocd
kubectl kustomize --enable-helm --load-restrictor LoadRestrictionsNone projects/nx/docs/scripts/bootstrap-argocd/ | kubectl apply --namespace argocd --server-side -f -
```

### 3. Accessing ArgoCD

Once ArgoCD is installed, you can access it using port-forwarding:

```bash {"category":"argocd/bootstrap","interpreter":"bash","name":"Access ArgoCD"}
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Access the ArgoCD UI at `https://localhost:8080`

### 4. Initial Login

The initial admin password is stored in a Kubernetes secret. Retrieve it with:

```bash {"category":"argocd/bootstrap","interpreter":"bash","name":"Get Initial Admin Password"}
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 5. Essential Applications Deployment

After logging in, deploy the following applications in order:

1. **kubevault** - For secret management
2. **external-secret** - For external secret integration

The remaining applications should be deployed automatically through ArgoCD's sync policies.

## Verification

To verify the installation:

```bash {"category":"argocd/bootstrap","interpreter":"bash","name":"Verify ArgoCD Installation"}
# Check ArgoCD pods
kubectl get pods -n argocd

# Verify applications are syncing
kubectl get applications -n argocd
```

## Appendices

### Appendix A

1. Go to [GitHub Settings > Developer settings > GitHub Apps](https://github.com/settings/apps)
2. Click on "New GitHub App"
3. Configure the app with the following settings:
   * **GitHub App name**: `argocd-chezmoi-sh`

   * **Homepage URL**: `https://argocd.chezmoi.sh`

   * **Webhook**: Disabled

   * **Repository permissions**:
     * Contents: Read & write
     * Metadata: Read-only
     * Pull requests: Read-only

   * **Where can this GitHub App be installed?**: Only on this account

#### 2. Credentials Generation

1. After creation, note:

   * **App ID**: The application identifier
   * **Client ID**: For OAuth authentication
   * **Client Secret**: For OAuth authentication

2. Generate a private key:

   * Click on "Generate a private key"
   * Save the generated `.pem` file

#### 3. App Installation

1. Go to the app settings
2. Click on "Install App"
3. Select the repositories ArgoCD should have access to
4. Note the **Installation ID** after installation

> \[!NOTE]
> For more information, consult the [official ArgoCD documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/private-repositories/#github-app-credential) and the [GitHub Apps documentation](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps#about-github-apps).
