# Crossplane - Cluster Vault Integration

These Crossplane Composite Resource Definitions (XRD) provide automated OpenBao (Vault) configuration for Kubernetes cluster integration. They create all necessary OpenBao resources including authentication backends, policies, roles, and mounts for seamless secret management integration with your Kubernetes clusters. These XRDs implement secure least-privilege access patterns and follow established project conventions for consistent secret management across clusters.

> \[!WARNING]
> These XRDs follow the logic defined in the project's ADRs, particularly for centralized secret management and naming conventions. Consult the corresponding ADRs before use.

## Resource Types Overview

| Type                       | Use Case                      | Configuration | Authentication       | Network Requirements        |
| -------------------------- | ----------------------------- | ------------- | -------------------- | --------------------------- |
| **LocalClusterVault**      | Cluster hosting OpenBao       | Minimal       | Automatic            | Local cluster network       |
| **RemoteClusterVault**     | External clusters (direct)    | Complete      | Manual (CA + JWT)    | Direct network connectivity |
| **TailscaledClusterVault** | External clusters (Tailscale) | Simplified    | Standard + Tailscale | Tailscale mesh network      |

## LocalClusterVault - Local Cluster Integration

**Usage**: Cluster hosting OpenBao itself, uses internal cluster connectivity.

**When to use**:

* The cluster where OpenBao is deployed
* Zero configuration, automatic authentication
* Direct access via internal cluster network

**Usage example**:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: LocalClusterVault
metadata:
  name: amiya-cluster
spec:
  name: amiya.akn
  providerConfigRef:
    name: vault-default
  additionalPolicies:
    - crossplane-policy
    - monitoring-policy
```

## RemoteClusterVault - Direct Remote Access

**Usage**: External clusters accessible via direct network connectivity.

**When to use**:

* Clusters accessible via direct network (VPN, dedicated networks, public endpoints)
* Full control over authentication and network configuration
* Environments requiring complete certificate verification

> \[!WARNING]
> **Secret required**: A Kubernetes secret must be created with the following labels and fields:
>
> * Required label: `vault.crossplane.chezmoi.sh/cluster-name: <cluster-name>`
> * Required fields: `ca.crt` (CA certificate) and `token` (JWT token)
>
> **Value generation**:
>
> 1. Create necessary RBAC (ServiceAccount, ClusterRoleBinding with `system:auth-delegator`)
> 2. Create a Secret of type `kubernetes.io/service-account-token`
> 3. Retrieve the cluster CA certificate and ServiceAccount token

**Required RBAC example**:

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: openbao:auth-delegator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
  - kind: ServiceAccount
    name: openbao-auth-delegator
    namespace: external-secrets-system
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: openbao-auth-delegator
  namespace: external-secrets-system
---
apiVersion: v1
kind: Secret
metadata:
  annotations:
    kubernetes.io/service-account.name: openbao-auth-delegator
  name: openbao-auth-delegator-token
  namespace: external-secrets-system
type: kubernetes.io/service-account-token
```

**Complete usage example**:

```yaml
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: lungmen-akn-eso-credentials
spec:
  dataFrom:
    - extract:
        key: amiya.akn/external-secrets/remote-jwt/lungmen.akn
  secretStoreRef:
    kind: ClusterSecretStore
    name: vault.chezmoi.sh
  target:
    name: lungmen-akn-eso-credentials
    template:
      type: Opaque
      metadata:
        labels:
          vault.crossplane.chezmoi.sh/cluster-name: lungmen.akn
---
apiVersion: vault.chezmoi.sh/v1alpha1
kind: RemoteClusterVault
metadata:
  name: lungmen.akn
spec:
  name: lungmen.akn
  host: https://kubernetes.lungmen.akn.chezmoi.sh:6443
  enableSharedAccess: false  # Optional
```

## TailscaledClusterVault - Tailscale Network Access

**Usage**: External clusters accessible via Tailscale network.

**When to use**:

* Clusters connected via Tailscale network
* Simplified configuration with network management by Tailscale
* Distributed environments requiring secure mesh connectivity

> \[!IMPORTANT]
> **Network prerequisites**:
>
> * A Tailscale proxy (Tailscale Funnel, TS ingress, or other) must be deployed for OpenBao to access the cluster
> * Tailscale handles **both network connectivity and Kubernetes authentication**
> * No additional RBAC setup required beyond standard Tailscale configuration

**Usage example**:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: TailscaledClusterVault
metadata:
  name: kazimierz-cluster
spec:
  name: kazimierz.akn
  host: https://kubernetes.kazimierz.akn.ts.net:6443
  providerConfigRef:
    name: vault-production
  additionalPolicies:
    - monitoring-policy
    - backup-policy
```

## Prerequisites

To use these XRDs, you must have a Crossplane installation running with the following components:

* [OpenBao/Vault provider](https://marketplace.upbound.io/providers/upbound/provider-vault/latest)
* [Go templating function](https://marketplace.upbound.io/functions/crossplane-contrib/function-go-templating/latest)
* [Extra resources function](https://marketplace.upbound.io/functions/crossplane-contrib/function-extra-resources/latest) (RemoteClusterVault only)
* [Auto ready function](https://marketplace.upbound.io/functions/crossplane-contrib/function-auto-ready/latest)

## Installation

To install all three XRDs, run the following command:

```shell
kubectl apply --kustomize .
```

## Created Resources

All cluster vault types create the following OpenBao resources:

### Core Resources

* **KV v2 Mount**: `{cluster-name}/` - Secure storage for cluster secrets
* **Kubernetes Auth Backend**: `{cluster-name}` - Authentication method for the cluster
* **Auth Backend Config**: Configured appropriately for each cluster type

### Policies

* **ESO Policy**: `{cluster-name}-eso-policy` - Allows External Secrets Operator to read secrets
  * Cluster-scoped access: `/{cluster-name}/*`
  * Shared third-parties: `/shared/third-parties/+/+/{cluster-name}/*`
  * Shared certificates: `/shared/certificates/*`

### Roles

* **ESO Role**: `{cluster-name}-eso-role` - Role for External Secrets Operator service account

For detailed API information, see [API Reference](./API_REFERENCE.md).

## References

* [Project ADRs](../../../docs/decisions/) - Architecture Decision Records
* [Upbound Marketplace - Vault Provider](https://marketplace.upbound.io/providers/upbound/provider-vault)
* [Upbound Marketplace - Go Templating Function](https://marketplace.upbound.io/functions/crossplane-contrib/function-go-templating)
* [Upbound Marketplace - Extra Resources Function](https://marketplace.upbound.io/functions/crossplane-contrib/function-extra-resources)
* [Upbound Marketplace - Auto Ready Function](https://marketplace.upbound.io/functions/crossplane-contrib/function-auto-ready)

## License

These XRDs are released under the Apache 2.0 license. For more information, see the [LICENSE](../../../LICENSE) file.
