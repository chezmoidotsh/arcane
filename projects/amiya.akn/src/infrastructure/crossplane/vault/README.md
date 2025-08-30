# Vault Configuration

This folder contains the Crossplane configuration for OpenBao/Vault.

## File Structure

```text
vault/
├── kustomization.yaml              # Kustomize configuration
├── authelia.authbackend.yaml       # OIDC authentication backend
├── shared.mount.yaml               # KV mount for shared secrets
└── policies/
    ├── personal-admin-access.yaml  # Personal admin access policy
    ├── personal-user-access.yaml   # Personal user access policy
    └── sso-admin-policy.yaml       # SSO admin policy
```

## Components

### Authentication

* **`authelia.authbackend.yaml`**: Configures OIDC authentication with Authelia SSO, including two roles (default users and admins)
* Supports CLI and web UI authentication flows

### Storage

* **`personal.mount.yaml`**: Creates a KV v2 mount for personal secrets
* **`shared.mount.yaml`**: Creates a KV v2 mount for shared secrets

### Policies

* **`personal-admin-access.yaml`**: Same as user access plus ability to list all personal namespaces
* **`personal-user-access.yaml`**: Allows users access only to their personal namespace (isolated by email)
* **`sso-admin-policy.yaml`**: Full Vault administration privileges with restrictions on critical operations (seal, unseal, rekey)
