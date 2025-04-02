<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
  <h1 align="center">External Secrets Operator - ArgoCD ApplicationSet</h1>
  <img src="../../../docs/assets/icons/system/external-secret.svg" alt="External Secrets Operator Logo" width="120" height="120">
</div>

<h4 align="center">Sync external secrets into Kubernetes</h4>

<div align="center">

[![Kustomize](https://img.shields.io/badge/Kustomize-ready-green?logo=kubernetes\&logoColor=white\&logoWidth=20)](https://kustomize.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#-overview">Overview</a> · <a href="#%EF%B8%8F-prerequisites">Prerequisites</a> · <a href="#-usage">Usage</a> · <a href="#-configuration">Configuration</a> · <a href="#-security-considerations">Security</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## 🌐 Overview

This `ArgoCD ApplicationSet` component deploys the [External Secrets Operator](https://external-secrets.io/) (ESO) in your Kubernetes cluster. ESO is a Kubernetes operator that integrates external secret management systems like AWS Secrets Manager, HashiCorp Vault, Google Secret Manager, and many others with Kubernetes. It allows you to securely manage secrets outside your cluster and synchronize them as Kubernetes Secret objects.

## ⚙️ Prerequisites

Before using this component, ensure you have:

* A Kubernetes cluster with `ArgoCD` installed
* Appropriate access to at least one external secret management system
* Required credentials or service accounts for connecting to your secret provider(s)

## 🚀 Usage

> \[!CAUTION]
> For security reasons, this `ApplicationSet` is not configured to automatically sync, so you must manually trigger the sync process in ArgoCD or patch the `syncPolicy` to enable it.

This `ApplicationSet` only provides default configurations for the `external-secrets` operator with hardened security settings. You can customize the deployment by modifying the Helm values or Kustomize patches.

Here is an example of how to use it in your Kustomization:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - https://github.com/chezmoi-sh/atlas.git//catalog/argocd/external-secrets-operator?ref=main

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
      value: $configuration/external-secrets-operator.values.yaml
    - op: add
      path: /spec/template/spec/sources/2/helm/valueFiles/-
      value: $configuration/{{ .name }}/external-secrets-operator.values.yaml
  target:
    kind: ApplicationSet
    name: external-secrets-operator
```

> \[!NOTE]
> This example will use `external-secrets-operator.values.yaml` from your repository. It will also use `external-secrets-operator.values.yaml` from the folder using the cluster name as the folder name. For example, if your cluster is named `production`, it will look for `production/external-secrets-operator.values.yaml`.

After deploying the External Secrets Operator, you'll need to create a `SecretStore` or `ClusterSecretStore` to connect to your secret provider:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secretsmanager
spec:
  provider:
    aws:
      service: SecretsManager
      region: eu-west-1
      auth:
        secretRef:
          accessKeyIDSecretRef:
            name: aws-credentials
            key: access-key-id
            namespace: external-secrets
          secretAccessKeySecretRef:
            name: aws-credentials
            key: secret-access-key
            namespace: external-secrets
```

Then create an `ExternalSecret` resource to fetch a secret:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: example-secret
  namespace: my-namespace
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: example-k8s-secret
  data:
  - secretKey: username
    remoteRef:
      key: example-secret
      property: username
  - secretKey: password
    remoteRef:
      key: example-secret
      property: password
```

## 🔧 Configuration

Everything is configured via Helm values. You can find all information on the [Artifact Hub](https://artifacthub.io/packages/helm/external-secrets/external-secrets).

In addition to customizing the Helm values, you can also control where the operator is deployed by adding the label `eso.appset.chezmoi.sh/enable: false` to the cluster configuration secret in `ArgoCD`. This allows you to exclude specific clusters from deploying the `external-secrets` operator.

## 🔒 Security Considerations

This `ApplicationSet` is designed with security in mind, with the following considerations:

* **Security Context**: The operator runs with a non-root user and group, and the container is read-only by default, without any privileged capabilities.
* **CustomResourceDefinitions**: All CRDs are installed by default.
* **ArgoCD Sync Policies**: The `ApplicationSet` is configured to not automatically sync and to apply in a server-side manner, ensuring that changes are reviewed by your `Mutation` and `Validation` policies before being applied.

***

<div align="center">
  <sub>Part of the <a href="../../../README.md">Atlas</a> project</sub>
</div>
