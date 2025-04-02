<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
  <h1 align="center">Cert-Manager - ArgoCD ApplicationSet</h1>
  <img src="../../../docs/assets/icons/system/cert-manager.svg" alt="Cert-Manager Logo" width="120" height="120">
</div>

<h4 align="center">Automated certificate management for Kubernetes</h4>

<div align="center">

[![Kustomize](https://img.shields.io/badge/Kustomize-ready-green?logo=kubernetes\&logoColor=white\&logoWidth=20)](https://kustomize.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#-overview">Overview</a> · <a href="#%EF%B8%8F-prerequisites">Prerequisites</a> · <a href="#-usage">Usage</a> · <a href="#-configuration">Configuration</a> · <a href="#-security-considerations">Security</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## 🌐 Overview

This `ArgoCD ApplicationSet` component deploys [Cert-Manager](https://cert-manager.io/) on all of your Kubernetes cluster defined in `ArgoCD`. Cert-Manager is a Kubernetes operator that automates the management and issuance of TLS certificates from various issuing sources like Let's Encrypt, HashiCorp Vault, Venafi, and others. It ensures certificates are valid and up-to-date, and attempts to renew certificates at a configured time before expiry.

## ⚙️ Prerequisites

Before using this component, ensure you have:

* A Kubernetes cluster with `ArgoCD` installed
* Network access to desired certificate issuers (e.g., Let's Encrypt, sectigo)
* DNS configuration if using DNS01 challenges

## 🚀 Usage

> \[!CAUTION]
> For security reasons, this `ApplicationSet` is not configured to automatically sync, so you must manually trigger the sync process in `ArgoCD` or patch the `syncPolicy` to enable it.

This `ApplicationSet` only provides default configurations for the `cert-manager` operator with hardened security settings. You can customize the deployment by modifying the Helm values or Kustomize patches.

Here is an example of how to use it in your Kustomization:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - https://github.com/chezmoi-sh/atlas.git//catalog/argocd/cert-manager?ref=main

patches:
  - patch: |-
    # Add the repository where the application is configured
    - op: add
      path: /spec/template/spec/sources/1
      value:
        repoURL: YOUR REPOSITORY
        targetRevision: main
        ref: configuration

    # Use values from your repository
    - op: add
      path: /spec/template/spec/sources/2/helm/valueFiles/-
      value: $configuration/cert-manager.values.yaml
    - op: add
      path: /spec/template/spec/sources/2/helm/valueFiles/-
      value: $configuration/{{ .name }}/cert-manager.values.yaml
  target:
    kind: ApplicationSet
    name: cert-manager
```

> \[!NOTE]
> This example will use `cert-manager.values.yaml` from your repository. It will also use `cert-manager.values.yaml` from the folder using the cluster name as the folder name. For example, if your cluster is named `production`, it will look for `production/cert-manager.values.yaml`.

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

## 🔧 Configuration

Everything is configured via Helm values. You can find all information on the [Artifact Hub](https://artifacthub.io/packages/helm/cert-manager/cert-manager).

In addition to customizing the Helm values, you can also control where the operator is deployed by adding the label `cert-manager.appset.chezmoi.sh/enable: false` to the cluster configuration secret in `ArgoCD`. This allows you to exclude specific clusters from deploying the `cert-manager` operator.

## 🔒 Security Considerations

This `ApplicationSet` is designed with security in mind, with the following considerations:

* **Security Context**: The operator runs with a non-root user and group, and the container is read-only by default, without any privileged capabilities.
* **CustomResourceDefinitions**: All CRDs are installed by default, but remain if you uninstall the operator.
* **ArgoCD Sync Policies**: The `ApplicationSet` is configured to not automatically sync and to apply in a server-side manner, ensuring that changes are reviewed by your `Mutation` and `Validation` policies before being applied.

***

<div align="center">
  <sub>Part of the <a href="../../../README.md">Atlas</a> project</sub>
</div>
