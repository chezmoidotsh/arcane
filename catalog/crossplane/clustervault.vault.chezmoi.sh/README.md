# Crossplane - Cluster Vault Integration

These Crossplane Composite Resource Definitions (XRD) allow you to automatically configure OpenBao (Vault) for Kubernetes cluster integration. They will create all necessary OpenBao resources including authentication backends, policies, roles, and mounts for seamless secret management integration with your Kubernetes clusters.

## Features

* **Automatic OpenBao Configuration**: Creates KV v2 mounts, Kubernetes auth backends, policies, and roles
* **Dual Resource Types**: Separate resources for external clusters (`ClusterVault`) and local clusters (`LocalClusterVault`)
* **Secure CA Certificate Integration**: Supports CA certificates stored in Kubernetes secrets
* **ESO Integration**: Pre-configured External Secrets Operator policies and roles following this repo convention
* **Additional Policies Support**: Extensible policy system for custom integrations
* **Provider Configuration**: Configurable OpenBao provider references

## Usage

> \[!WARNING]
> For external clusters, the CA certificate **must** be stored in a Kubernetes Secret labeled with:
>
> ```yaml
> vault.crossplane.chezmoi.sh/ca-cert-name: <cert-name>
> ```
>
> The value of this label (`<cert-name>`) must be referenced in your `ClusterVault` resource under `spec.caCert.secretRef.certName`.
>
> **Example Secret:**
>
> ```yaml
> apiVersion: v1
> kind: Secret
> metadata:
>   name: production-cluster-ca-cert
>   namespace: kube-system
>   labels:
>     vault.crossplane.chezmoi.sh/ca-cert-name: production-cluster-ca-cert
> stringData:
>   ca.crt: |
>     -----BEGIN CERTIFICATE-----
>     ...
>     -----END CERTIFICATE-----
> ```

To use these XRDs, you must have a Crossplane installation running with the following components:

* [OpenBao/Vault provider](https://marketplace.upbound.io/providers/upbound/provider-vault/latest)
* [Go templating function](https://marketplace.upbound.io/functions/crossplane-contrib/function-go-templating/latest)
* [Extra resources function](https://marketplace.upbound.io/functions/crossplane-contrib/function-extra-resources/latest)
* [Auto ready function](https://marketplace.upbound.io/functions/crossplane-contrib/function-auto-ready/latest)

### Install the XRDs

To install the XRDs, run the following command:

```shell
kubectl apply --kustomize .
```

### Examples

#### External Cluster Integration

Create an integration for an external Kubernetes cluster:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: ClusterVault
metadata:
  name: production-cluster
spec:
  name: production
  host: https://kubernetes.production:6443
  caCert:
    secretRef:
      certName: production-cluster-ca-cert
  providerConfigRef:
    name: vault-prod
```

#### Local Cluster Integration

Configure OpenBao for the cluster where it's running:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: LocalClusterVault
metadata:
  name: local-cluster
spec:
  name: local
  providerConfigRef:
    name: vault-default
```

#### Advanced External Cluster Configuration

Configure an external cluster with additional policies:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: ClusterVault
metadata:
  name: staging-cluster
spec:
  name: staging
  host: https://kubernetes.staging:6443
  caCert:
    secretRef:
      certName: staging-cluster-ca-cert
      key: ca.crt
  providerConfigRef:
    name: vault-staging
  additionalPolicies:
    - monitoring-policy
    - logging-policy
    - backup-policy
```

#### Complete Production Setup

A comprehensive example for production use:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: ClusterVault
metadata:
  name: prod-cluster
  labels:
    environment: production
    cluster: prod
spec:
  name: prod
  host: https://kubernetes.production:6443
  caCert:
    secretRef:
      certName: prod-cluster-ca-cert
      key: ca.crt
  providerConfigRef:
    name: vault-production
  additionalPolicies:
    - prometheus-policy
    - grafana-policy
    - loki-policy
    - alertmanager-policy
```

#### Local Cluster with Additional Policies

Configure the local cluster with additional policies:

```yaml
apiVersion: vault.chezmoi.sh/v1alpha1
kind: LocalClusterVault
metadata:
  name: local-cluster-advanced
spec:
  name: local
  providerConfigRef:
    name: vault-default
  additionalPolicies:
    - crossplane-policy
    - monitoring-policy
```

## Created Resources

When you create a `ClusterVault` or `LocalClusterVault` resource, the following OpenBao resources are automatically created:

### Core Resources

* **KV v2 Mount**: `{cluster-name}/` - Secure storage for cluster secrets
* **Kubernetes Auth Backend**: `{cluster-name}` - Authentication method for the cluster
* **Auth Backend Config**: Configured with cluster endpoint and CA certificate (for external clusters) or local endpoint (for local clusters)

### Policies

* **ESO Policy**: `{cluster-name}-eso-policy` - Allows External Secrets Operator to read secrets

### Roles

* **ESO Role**: `{cluster-name}-eso-role` - Role for External Secrets Operator service account

## Schema

### ClusterVault (External Clusters)

This XRD defines a custom Cluster Vault integration resource (`XClusterVault` and `ClusterVault`) for external Kubernetes clusters:

| Field                            | Description                                                                 | Required | Default   |
| -------------------------------- | --------------------------------------------------------------------------- | -------- | --------- |
| `spec.name`                      | The name of the Kubernetes cluster                                          | Yes      | -         |
| `spec.host`                      | The address of the Kubernetes cluster (API server endpoint)                 | Yes      | -         |
| `spec.caCert`                    | CA certificate configuration                                                | Yes      | -         |
| `spec.caCert.secretRef`          | Reference to secret containing CA certificate                               | Yes      | -         |
| `spec.caCert.secretRef.certName` | Value of the label `vault.crossplane.chezmoi.sh/ca-cert-name` on the secret | Yes      | -         |
| `spec.caCert.secretRef.key`      | Key in the secret containing the CA certificate                             | No       | `ca.crt`  |
| `spec.providerConfigRef`         | Reference to the ProviderConfig for OpenBao resources                       | No       | -         |
| `spec.providerConfigRef.name`    | Name of the ProviderConfig                                                  | No       | `default` |
| `spec.additionalPolicies`        | List of additional policies to create and add to ESO tokenPolicies          | No       | `[]`      |

### LocalClusterVault (Local Cluster)

This XRD defines a custom Local Cluster Vault integration resource (`XLocalClusterVault` and `LocalClusterVault`) for the local cluster:

| Field                         | Description                                                        | Required | Default   |
| ----------------------------- | ------------------------------------------------------------------ | -------- | --------- |
| `spec.name`                   | The name of the local Kubernetes cluster                           | Yes      | -         |
| `spec.providerConfigRef`      | Reference to the ProviderConfig for OpenBao resources              | No       | -         |
| `spec.providerConfigRef.name` | Name of the ProviderConfig                                         | No       | `default` |
| `spec.additionalPolicies`     | List of additional policies to create and add to ESO tokenPolicies | No       | `[]`      |

## Security Considerations

* **Least Privilege**: Each role is configured with minimal required permissions
* **Namespace Isolation**: ESO role is restricted to `external-secrets-system` namespace
* **Token TTL**: Authentication tokens have limited lifetime (1 hour)
* **CA Verification**: Supports custom CA certificate validation for secure cluster communication (external clusters only)
* **Automatic Local Configuration**: Local clusters use built-in Kubernetes service account JWT validation

## Troubleshooting

### Common Issues

1. **Authentication Failures**: Ensure the Kubernetes API endpoint is accessible from OpenBao (external clusters)
2. **CA Certificate Issues**: Verify the CA certificate secret exists, is labeled correctly, and contains valid data (external clusters)
3. **Permission Denied**: Check that the OpenBao provider has sufficient permissions
4. **Resource Not Ready**: Use `kubectl describe` to check resource conditions

### Verification

Check the status of your integration:

```bash
# Check the ClusterVault resource (external)
kubectl get clustervault prod-cluster -o yaml

# Check the LocalClusterVault resource (local)
kubectl get localclustervault local-cluster -o yaml

# Check created OpenBao resources
kubectl get vault,policy,authbackend -l crossplane.io/composite=prod-cluster

# Test authentication (from within the cluster)
vault write auth/prod/login role=prod-eso-role jwt=$SERVICE_ACCOUNT_TOKEN
```

## Architecture

These XRDs follow the ADR (Architecture Decision Records) established for OpenBao integration:

* **ADR-001**: Centralized secret management using OpenBao
* **ADR-002**: Topology with separate mounts per cluster + shared mount
* **ADR-003**: Application-first naming conventions for cluster mounts

## License

These XRDs are released under the Apache 2.0 license. For more information, see the [LICENSE](../../../LICENSE) file.
