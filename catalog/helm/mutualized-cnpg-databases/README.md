# mutualized-cnpg-databases

A Helm chart to manage mutualized CloudNativePG (CNPG) PostgreSQL clusters and their per-application databases.

## Overview

This chart manages:

* **CNPG Cluster**: Optional shared cluster.
* **Databases**: Logical databases within the cluster.
* **Credentials**:
  * Automatic password generation (via External Secrets Operator).
  * Syncing passwords to Vault (PushSecret).
  * ExternalSecrets for application consumption.
* **Network Security**: Cilium Network Policies.

## values.yaml Structure

The values intentionally mirror a Kubernetes Custom Resource:

```yaml
metadata:
  name: my-cluster

spec:
  secretStoreRef:
    name: vault-backend

  databases:
    - name: app1
      users:
        - name: user1
          vault:
            path: secrets/app1/db
      allowedApplicationSelector:
        - endpointSelector:
            - matchLabels:
                app: app1
```

## Core Configuration

### Metadata

* `metadata.name`: Stable prefix for all generated resources.

### Cluster

Verbatim pass-through to CNPG `Cluster` spec.

```yaml
spec:
  cluster:
    instances: 3
    storage:
      size: 10Gi
```

### Databases

* `name`: Database name.
* `users`: List of roles. Requires `name` and `vault.path`.
* `extensions`: List of objects (e.g., `- name: pgvector`).
* `allowedApplicationSelector`: List of Cilium `fromEndpoints` selectors.

### Network Policies

Enabled via `spec.behavior.networkPolicies.enabled`.

## Development

Validate manifests:

```bash
helm template my-release . -f my-values.yaml
```
