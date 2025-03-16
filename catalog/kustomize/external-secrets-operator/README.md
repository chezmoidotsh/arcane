<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
  <h1 align="center">External Secrets Operator - Kustomize Component</h1>
  <img src="../../../docs/assets/icons/system/external-secret.svg" alt="External Secrets Operator Logo" width="120" height="120">
</div>

<h4 align="center">Sync external secrets into Kubernetes</h4>

<div align="center">

[![Kustomize](https://img.shields.io/badge/Kustomize-ready-green?logo=kubernetes\&logoColor=white\&logoWidth=20)](https://kustomize.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#-overview">Overview</a> · <a href="#-features">Features</a> · <a href="#%EF%B8%8F-prerequisites">Prerequisites</a> · <a href="#-usage">Usage</a> · <a href="#-configuration">Configuration</a> · <a href="#-security-considerations">Security</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## 🌐 Overview

This `External Secrets Operator Kustomize` component deploys the [External Secrets Operator](https://external-secrets.io/) (ESO) in your Kubernetes cluster. ESO is a Kubernetes operator that integrates external secret management systems like AWS Secrets Manager, HashiCorp Vault, Google Secret Manager, and many others with Kubernetes. It allows you to securely manage secrets outside your cluster and synchronize them as Kubernetes Secret objects.

## ✨ Features

This component provides a preconfigured External Secrets Operator deployment with:

* **Automated operator deployment** via Helm chart integration
* **Support for ArgoCD** with a preconfigured `ApplicationSet` for managing ESO deployments across multiple clusters

## ⚙️ Prerequisites

Before using this component, ensure you have:

* A Kubernetes cluster with `Kustomize` support
* Appropriate access to at least one external secret management system
* Required credentials or service accounts for connecting to your secret provider(s)

## 🚀 Usage

To use this component in your Kustomization:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

components:
  - path/to/catalog/kustomize/external-secrets-operator

# Optional namespace specification
namespace: external-secrets
```

After deploying the operator, you'll need to create a `SecretStore` or `ClusterSecretStore` to connect to your external secret provider:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secret-store
  namespace: my-namespace
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        secretRef:
          accessKeyIDSecretRef:
            name: aws-credentials
            key: access-key-id
          secretAccessKeySecretRef:
            name: aws-credentials
            key: secret-access-key
```

Then create an `ExternalSecret` to fetch secrets from the provider:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: example-secret
  namespace: my-namespace
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secret-store
    kind: SecretStore
  target:
    name: example-k8s-secret
  data:
  - secretKey: username
    remoteRef:
      key: my-secret
      property: username
  - secretKey: password
    remoteRef:
      key: my-secret
      property: password
```

### 🐙 ArgoCD Integration

This component includes an `ApplicationSet` resource that simplifies deploying External Secrets Operator across multiple clusters in your ArgoCD environment.

#### Using the ApplicationSet

To deploy the operator on all clusters managed by ArgoCD:

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../../catalog/kustomize/external-secrets-operator/applicationset.argoproj.io

patches:
  # Configure the ArgoCD project for this application
  - patch: |-
      - op: replace
        path: /spec/template/spec/project
        value: external-secrets-project  # Replace with your ArgoCD project name
      
      # Set the source repository containing your Atlas catalog
      - op: replace
        path: /spec/template/spec/source/repoURL
        value: https://github.com/your-org/your-gitops-repo.git
      
      # Set the branch or tag to use
      - op: replace
        path: /spec/template/spec/source/targetRevision
        value: main
      
      # Configure sync policy for automated management
      - op: replace
        path: /spec/template/spec/syncPolicy
        value:
          automated:
            prune: true
            selfHeal: true
          syncOptions:
            - CreateNamespace=true
            - ServerSideApply=true
    target:
      kind: ApplicationSet
```

#### Controlling Deployment with Labels and Annotations

You can customize which clusters receive the External Secrets Operator by applying labels and annotations to your ArgoCD cluster secrets:

##### Exclude a cluster from deployment

Apply this label to prevent deploying ESO to specific clusters:

```yaml
metadata:
  labels:
    eso.appset.chezmoi.sh/enable: "false"
```

##### Use a custom Kustomization for specific clusters

Apply this annotation to override the default Kustomization path:

```yaml
metadata:
  annotations:
    eso.appset.chezmoi.sh/kustomize-with: "path/to/your/custom/eso/overlay"
```

##### Example: Cluster with custom configuration

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: production-cluster
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
    eso.appset.chezmoi.sh/enable: "true"
  annotations:
    eso.appset.chezmoi.sh/kustomize-with: "clusters/production/external-secrets"
# ...cluster data...
```

## 🔧 Configuration

This component can be customized through patches:

* **Changing the namespace**: Override the default namespace
* **Provider-specific configurations**: Add or modify provider settings
* **Resource limitations**: Adjust CPU and memory requests/limits

Example patch for resource configuration:

```yaml
patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: external-secrets
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/resources
        value:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

***

<div align="center">
  <sub>Part of the <a href="../../../README.md">Atlas</a> project</sub>
</div>
