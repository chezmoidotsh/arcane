<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
  <h1 align="center">Cert-Manager - Kustomize Component</h1>
  <img src="../../../docs/assets/icons/system/cert-manager.svg" alt="Cert-Manager Logo" width="120" height="120">
</div>

<h4 align="center">Automated certificate management for Kubernetes</h4>

<div align="center">

[![Kustomize](https://img.shields.io/badge/Kustomize-ready-green?logo=kubernetes\&logoColor=white\&logoWidth=20)](https://kustomize.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#-overview">Overview</a> · <a href="#-features">Features</a> · <a href="#%EF%B8%8F-prerequisites">Prerequisites</a> · <a href="#-usage">Usage</a> · <a href="#-configuration">Configuration</a> · <a href="#-security-considerations">Security</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## 🌐 Overview

This `Cert-Manager Kustomize` component deploys [Cert-Manager](https://cert-manager.io/) in your Kubernetes cluster. Cert-Manager is a Kubernetes operator that automates the management and issuance of TLS certificates from various issuing sources like Let's Encrypt, HashiCorp Vault, Venafi, and others. It ensures certificates are valid and up-to-date, and attempts to renew certificates at a configured time before expiry.

## ✨ Features

This component provides a preconfigured Cert-Manager deployment with:

* **Automated operator deployment** via Helm chart integration
* **Support for ArgoCD** with a preconfigured `ApplicationSet` for managing Cert-Manager deployments across multiple clusters

## ⚙️ Prerequisites

Before using this component, ensure you have:

* A Kubernetes cluster with `Kustomize` support
* Network access to desired certificate issuers (e.g., Let's Encrypt, sectigo)
* DNS configuration if using DNS01 challenges

## 🚀 Usage

To use this component in your Kustomization:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

components:
  - path/to/catalog/kustomize/cert-manager

# Optional namespace specification
namespace: cert-manager
```

After deploying Cert-Manager, you'll need to create an `Issuer` or `ClusterIssuer` to connect to your certificate provider:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
    - http01:
        ingress:
          class: nginx
```

Then create a `Certificate` resource to request a certificate:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: example-com
  namespace: my-namespace
spec:
  secretName: example-com-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  commonName: example.com
  dnsNames:
  - example.com
  - www.example.com
```

### 🐙 ArgoCD Integration

This component includes an `ApplicationSet` resource that simplifies deploying Cert-Manager across multiple clusters in your ArgoCD environment.

#### Using the ApplicationSet

To deploy the operator on all clusters managed by ArgoCD:

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../../catalog/kustomize/cert-manager/applicationset.argoproj.io

patches:
  # Configure the ArgoCD project for this application
  - patch: |-
      - op: replace
        path: /spec/template/spec/project
        value: cert-manager-project  # Replace with your ArgoCD project name
      
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

You can customize which clusters receive the Cert-Manager by applying labels and annotations to your ArgoCD cluster secrets:

##### Exclude a cluster from deployment

Apply this label to prevent deploying Cert-Manager to specific clusters:

```yaml
metadata:
  labels:
    cert-manager.appset.chezmoi.sh/enable: "false"
```

##### Use a custom Kustomization for specific clusters

Apply this annotation to override the default Kustomization path:

```yaml
metadata:
  annotations:
    cert-manager.appset.chezmoi.sh/kustomize-with: "path/to/your/custom/cert-manager/overlay"
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
    cert-manager.appset.chezmoi.sh/enable: "true"
  annotations:
    cert-manager.appset.chezmoi.sh/kustomize-with: "clusters/production/cert-manager"
# ...cluster data...
```

## 🔧 Configuration

This component can be customized through patches:

* **Changing the namespace**: Override the default namespace
* **Issuer-specific configurations**: Add or modify issuer settings
* **Resource limitations**: Adjust CPU and memory requests/limits
* **Webhook configurations**: Modify or disable webhook behavior

Example patch for resource configuration:

```yaml
patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: cert-manager
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

## 🔒 Security Considerations

When deploying Cert-Manager:

* Use RBAC to restrict access to certificate resources
* Consider limiting which namespaces can use specific issuers
* Protect private keys by restricting access to certificate secrets
* Use separate issuers for different environments (dev, staging, prod)
* Regularly audit certificate resources and their usage

***

<div align="center">
  <sub>Part of the <a href="../../../README.md">Atlas</a> project</sub>
</div>
