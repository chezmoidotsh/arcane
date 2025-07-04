# Allow Crossplane to create tokens
path "auth/token/create" { capabilities = ["update"] }

# Allow Crossplane to CRU mounts
# NOTE: Disable delete capability to prevent accidental deletion of secrets engines
path "sys/mounts/*" { capabilities = ["create", "read", "update"] }

# Allow Crossplane to CRUD policies
path "sys/policies/acl/*" { capabilities = ["create", "read", "update", "delete", "list"] }

# Allow Crossplane to manage auth methods (enable/disable/configure auth methods)
# NOTE: sudo is required to create auth methods
path "sys/auth/*" { capabilities = ["create", "read", "update", "delete", "list", "sudo"] }
path "auth/+/config" { capabilities = ["read", "update"] }
path "auth/+/role/*" { capabilities = ["create", "read", "update", "delete"] }

# Disable some paths to prevent any changes to the kubernetes auth method used by Crossplane
# (prevent privilege escalation if Crossplane is compromised)
path "auth/kubernetes/config" { capabilities = ["deny"] }
path "auth/kubernetes/role/*" { capabilities = ["deny"] }
path "sys/auth/kubernetes" { capabilities = ["deny"] }
path "sys/auth/kubernetes/*" { capabilities = ["deny"] }
path "sys/auth/token" { capabilities = ["deny"] }
path "sys/auth/token/*" { capabilities = ["deny"] }
path "sys/policies/acl/kubernetes-crossplane-provisioning-policy" { capabilities = ["deny"] }
