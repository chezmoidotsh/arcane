# API Reference

## vault.chezmoi.sh/v1alpha1

Package v1alpha1 contains API Schema definitions for ClusterVault v1alpha1.

***

## LocalClusterVault

LocalClusterVault is a Composite Resource for configuring OpenBao integration with the local Kubernetes cluster where OpenBao is deployed.

| Field    | Description                                        | Scheme                                              | Required |
| -------- | -------------------------------------------------- | --------------------------------------------------- | -------- |
| metadata | Standard object metadata                           | metav1.ObjectMeta                                   | false    |
| spec     | LocalClusterVaultSpec defines the desired state    | [LocalClusterVaultSpec](#localclustervaultspec)     | false    |
| status   | LocalClusterVaultStatus defines the observed state | [LocalClusterVaultStatus](#localclustervaultstatus) | false    |

### LocalClusterVaultSpec

LocalClusterVaultSpec defines the desired state of LocalClusterVault.

| Field              | Description                                                        | Scheme                                              | Required |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------- | -------- |
| name               | The name of the local Kubernetes cluster to integrate with OpenBao | string                                              | true     |
| additionalPolicies | List of additional policies to create and add to ESO tokenPolicies | \[]string                                           | false    |
| providerConfigRef  | Reference to the ProviderConfig to use for OpenBao resources       | [ProviderConfigReference](#providerconfigreference) | false    |

### LocalClusterVaultStatus

LocalClusterVaultStatus defines the observed state of LocalClusterVault.

| Field      | Description                             | Scheme                     | Required |
| ---------- | --------------------------------------- | -------------------------- | -------- |
| mountPoint | The OpenBao mount path for this cluster | string                     | false    |
| roles      | List of roles created for this cluster  | \[]string                  | false    |
| conditions | Standard Kubernetes conditions          | \[][Condition](#condition) | false    |

***

## RemoteClusterVault

RemoteClusterVault is a Composite Resource for configuring OpenBao integration with remote Kubernetes clusters accessible via direct network connectivity.

| Field    | Description                                         | Scheme                                                | Required |
| -------- | --------------------------------------------------- | ----------------------------------------------------- | -------- |
| metadata | Standard object metadata                            | metav1.ObjectMeta                                     | false    |
| spec     | RemoteClusterVaultSpec defines the desired state    | [RemoteClusterVaultSpec](#remoteclustervaultspec)     | false    |
| status   | RemoteClusterVaultStatus defines the observed state | [RemoteClusterVaultStatus](#remoteclustervaultstatus) | false    |

### RemoteClusterVaultSpec

RemoteClusterVaultSpec defines the desired state of RemoteClusterVault.

| Field              | Description                                                        | Scheme                                              | Required |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------- | -------- |
| name               | The name of the Kubernetes cluster to integrate with OpenBao       | string                                              | true     |
| host               | The address of the Kubernetes cluster (API server endpoint)        | string                                              | true     |
| additionalPolicies | List of additional policies to create and add to ESO tokenPolicies | \[]string                                           | false    |
| providerConfigRef  | Reference to the ProviderConfig to use for OpenBao resources       | [ProviderConfigReference](#providerconfigreference) | false    |

### RemoteClusterVaultStatus

RemoteClusterVaultStatus defines the observed state of RemoteClusterVault.

| Field      | Description                             | Scheme                     | Required |
| ---------- | --------------------------------------- | -------------------------- | -------- |
| mountPoint | The OpenBao mount path for this cluster | string                     | false    |
| roles      | List of roles created for this cluster  | \[]string                  | false    |
| conditions | Standard Kubernetes conditions          | \[][Condition](#condition) | false    |

***

## TailscaledClusterVault

TailscaledClusterVault is a Composite Resource for configuring OpenBao integration with remote Kubernetes clusters accessible via Tailscale network.

| Field    | Description                                             | Scheme                                                        | Required |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| metadata | Standard object metadata                                | metav1.ObjectMeta                                             | false    |
| spec     | TailscaledClusterVaultSpec defines the desired state    | [TailscaledClusterVaultSpec](#tailscaledclustervaultspec)     | false    |
| status   | TailscaledClusterVaultStatus defines the observed state | [TailscaledClusterVaultStatus](#tailscaledclustervaultstatus) | false    |

### TailscaledClusterVaultSpec

TailscaledClusterVaultSpec defines the desired state of TailscaledClusterVault.

| Field              | Description                                                           | Scheme                                              | Required |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| name               | The name of the Tailscaled Kubernetes cluster                         | string                                              | true     |
| host               | The Tailscale address of the Kubernetes cluster (API server endpoint) | string                                              | true     |
| additionalPolicies | List of additional policies to assign to the ESO role                 | \[]string                                           | false    |
| providerConfigRef  | Reference to the ProviderConfig for OpenBao resources                 | [ProviderConfigReference](#providerconfigreference) | false    |

### TailscaledClusterVaultStatus

TailscaledClusterVaultStatus defines the observed state of TailscaledClusterVault.

| Field      | Description                             | Scheme                     | Required |
| ---------- | --------------------------------------- | -------------------------- | -------- |
| mountPoint | The OpenBao mount path for this cluster | string                     | false    |
| roles      | List of roles created for this cluster  | \[]string                  | false    |
| conditions | Standard Kubernetes conditions          | \[][Condition](#condition) | false    |

***

## ProviderConfigReference

ProviderConfigReference specifies how to select a ProviderConfig resource.

| Field | Description                | Scheme | Required |
| ----- | -------------------------- | ------ | -------- |
| name  | Name of the ProviderConfig | string | false    |

**Default**: `"default"`

***

## Condition

Condition represents a single condition of a resource.

| Field              | Description                                                         | Scheme             | Required |
| ------------------ | ------------------------------------------------------------------- | ------------------ | -------- |
| type               | Type of condition                                                   | string             | true     |
| status             | Status of the condition, one of True, False, Unknown                | string             | true     |
| reason             | The reason for the condition's last transition                      | string             | false    |
| message            | A human readable message indicating details about the transition    | string             | false    |
| lastTransitionTime | The last time the condition transitioned from one status to another | string (date-time) | false    |
