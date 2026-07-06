import { ClusterVaultComponent } from "@chezmoi.sh/pulumi-cluster-vault";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// Everything that configures Vault/OpenBao itself for this cluster: the cluster's own
// auth backend + mounts, the shared/personal KV mounts, and pocket-id's SSO auth
// backend + policies (pocket-id.ts only owns the app-level Cloudflare hardening).

// Vault/OpenBao itself runs on this cluster, so nothing below is reachable until
// the cluster is far enough into bootstrap to serve Vault's own ingress — hence
// this whole file is skipped in bootstrap mode (see config.ts). Unlike the
// Cloudflare/Tailscale token files, there is no "external resource" half here to
// create early: every resource in this file is a Vault-side resource.
if (!config.isBootstraping) {
	// ---------------------------------------------------------------------------
	// Cluster's own Vault access (KV mount + Kubernetes auth backend + ESO role)
	// ---------------------------------------------------------------------------
	// External Secrets Operator (ESO) running in this cluster needs its own
	// dedicated KV mount and a Kubernetes auth backend to authenticate against,
	// scoped to this cluster only. ESO authenticates via the generated
	// `amiya.akn-eso-role` to read the `amiya.akn/` KV mount.
	new ClusterVaultComponent("amiya.akn", { name: "amiya.akn" });

	// ---------------------------------------------------------------------------
	// Shared & personal secret mounts
	// ---------------------------------------------------------------------------
	// Two KV v2 namespaces with different ownership models: "shared" for
	// cross-project/cross-service secrets (third-party API credentials,
	// certificates) that authorized roles can read across clusters, "personal"
	// for per-user secrets isolated by OIDC identity (see the policies below).
	// Every project's ESO role reads from "shared"; the pocket-id-default and
	// pocket-id-admin roles below read/write their own "personal" namespace.
	new vault.Mount("shared", {
		path: "shared",
		type: "kv",
		description:
			"Shared secrets storage - KV v2 mount for application secrets and cross-service configuration accessible by authorized roles",
		options: { version: "2" },
	});

	new vault.Mount("personal", {
		path: "personal",
		type: "kv",
		description:
			"Personal secrets namespace - user-isolated KV v2 storage for individual secret management with email-based access control",
		options: { version: "2" },
	});

	// ---------------------------------------------------------------------------
	// Pocket-ID SSO auth backend (OIDC)
	// ---------------------------------------------------------------------------
	// Lets Vault UI/CLI users authenticate with their existing Pocket-ID identity
	// instead of provisioning separate Vault-local users or tokens. The
	// pocket-id-default/pocket-id-admin roles further down bind this backend to
	// the policies below based on OIDC group claims.
	const pocketIdAuthBackend = new vault.jwt.AuthBackend("pocket-id", {
		path: "pocket-id",
		type: "oidc",
		description: "pocket-id sso auth backend for UI/CLI user authentication",
		oidcDiscoveryUrl: "https://auth.chezmoi.sh",
		boundIssuer: "https://auth.chezmoi.sh",
		defaultRole: "default",
		oidcClientId: "762ac35a-f6ea-4831-ab61-a7e923e4b5cf",
		oidcClientSecret: config.pocketId.oidcClientSecret,
		tune: {
			defaultLeaseTtl: "30m",
			maxLeaseTtl: "2h",
			listingVisibility: "unauth",
			tokenType: "default-service",
		},
	});

	// ---------------------------------------------------------------------------
	// Personal namespace access policies
	// ---------------------------------------------------------------------------
	// Every OIDC-authenticated user must be confined to their own
	// personal/<email>/ subtree; the admin variant additionally needs to list
	// (not read) every other user's namespace for support/troubleshooting. Both
	// are bound to the pocket-id-admin and pocket-id-default roles below.
	//
	// The {{identity.entity.aliases.<accessor>.metadata.email}} templating below needs
	// the auth backend's own mount accessor (e.g. "auth_oidc_bac48a4e") — read from
	// pocketIdAuthBackend.accessor instead of hardcoding it, so it's always correct
	// even if this backend is ever recreated with a new accessor.
	const personalAdminAccess = new vault.Policy("personal-admin-access", {
		name: "personal-admin-access",
		policy: pulumi.interpolate`
# Personal Admin Access Policy
#
# This templated policy allows administrators to access their own personal namespace within the 'personal' mount,
# while also granting them the ability to list all personal namespaces.
# User isolation is achieved through templating based on the user's email metadata from OIDC authentication.

# Allow user to access their personal secrets (data and metadata)
path "personal/data/{{identity.entity.aliases.${pocketIdAuthBackend.accessor}.metadata.email}}/" { capabilities = ["list"] }
path "personal/data/{{identity.entity.aliases.${pocketIdAuthBackend.accessor}.metadata.email}}/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "personal/metadata/{{identity.entity.aliases.${pocketIdAuthBackend.accessor}.metadata.email}}/*" { capabilities = ["create", "read", "update", "delete", "list"] }

# Allow user to list personal root to discover all personal namespaces
path "personal/data/" { capabilities = ["list"] }
path "personal/data/*" { capabilities = ["list"] }
path "personal/metadata/*" { capabilities = ["read", "list"] }
`,
	});

	const personalUserAccess = new vault.Policy("personal-user-access", {
		name: "personal-user-access",
		policy: pulumi.interpolate`
# Personal User Access Policy
#
# This templated policy allows users to access only their personal namespace within the 'personal' mount.
# User isolation is achieved through templating based on the user's email metadata from OIDC authentication.

# Allow user to access their personal secrets (data and metadata)
path "personal/data/{{identity.entity.aliases.${pocketIdAuthBackend.accessor}.metadata.email}}/" { capabilities = ["list"] }
path "personal/data/{{identity.entity.aliases.${pocketIdAuthBackend.accessor}.metadata.email}}/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "personal/metadata/{{identity.entity.aliases.${pocketIdAuthBackend.accessor}.metadata.email}}/*" { capabilities = ["create", "read", "update", "delete", "list"] }

# Allow user to list personal root to discover their own folder
path "personal/data/" { capabilities = ["list"] }

# Explicit deny for other users' personal spaces
path "personal/data/*" { capabilities = ["deny"] }
path "personal/metadata/*" { capabilities = ["deny"] }
`,
	});

	// ---------------------------------------------------------------------------
	// Vault admin policy (for SSO-authenticated operators)
	// ---------------------------------------------------------------------------
	// Lets Pocket-ID users in the "admin" OIDC group manage Vault day to day
	// (secrets engines, auth methods, identities, audit logs, ACL policies)
	// without provisioning a separate Vault-local admin account, while explicitly
	// denying the handful of operations that could take Vault itself down. Bound
	// to the pocket-id-admin role below.
	const ssoAdminPolicy = new vault.Policy("sso-admin-policy", {
		name: "sso-admin-policy",
		policy: `
# This policy defines administrative permissions for Vault operators with full access to common operational tasks such
# as managing secrets engines, authentication methods, identities, audit logs, and ACL policies — while explicitly denying
# access to critical operations like sealing, replication control, rekeying, and root token handling.
#
# WARNING: This policy is intended for privileged users who should be able to manage most aspects of Vault without the
#          risk of affecting core availability or security boundaries.

# Allow sudo access to all paths (except the ones explicitly denied)
path "*" { capabilities = ["create", "read", "update", "delete", "list"] }

# EXPLICITLY LIST ONLY: Personal user secrets (for the authenticated user)
path "personal/data/*" { capabilities = ["list"] }
path "personal/metadata/*" { capabilities = ["list"] }

# EXPLICITLY READ ONLY: Plugin catalog (view available plugins)
path "sys/plugins/catalog/*" { capabilities = ["read", "list"] }

# EXPLICITLY READ ONLY: Identity management (entities, groups, aliases)
path "identity/*" { capabilities = ["read", "list"] }

# EXPLICITLY READ ONLY: License information (optional, read-only)
path "sys/license" { capabilities = ["read"] }

# EXPLICITLY DENIED: Seal and unseal operations (dangerous for HA mode)
path "sys/seal" { capabilities = ["deny"] }
path "sys/unseal" { capabilities = ["deny"] }

# EXPLICITLY DENIED: Replication controls (primary/secondary config)
path "sys/replication/*" { capabilities = ["deny"] }

# EXPLICITLY DENIED: Rekeying Vault (can invalidate access to the cluster)
path "sys/rekey/*" { capabilities = ["deny"] }
path "sys/rotate/*" { capabilities = ["deny"] }

# EXPLICITLY DENIED: Root token endpoint
path "auth/token/root" { capabilities = ["deny"] }
`,
	});

	// ---------------------------------------------------------------------------
	// Pocket-ID OIDC roles
	// ---------------------------------------------------------------------------
	// Binds the auth backend above to the policies above: "default" is every
	// authenticated user (personal namespace only), "admin" is scoped to the
	// OIDC "admin" group claim and additionally gets the Vault admin policy and
	// the ability to list every user's personal namespace. This is the last link
	// in the chain — Pocket-ID users hitting vault.chezmoi.sh's OIDC login end up
	// in one of these two roles.
	new vault.jwt.AuthBackendRole("pocket-id-default", {
		backend: pocketIdAuthBackend.path,
		roleName: "default",
		roleType: "oidc",
		allowedRedirectUris: [
			"http://localhost:8250/oidc/callback",
			"https://vault.chezmoi.sh/ui/vault/auth/pocket-id/oidc/callback",
		],
		oidcScopes: ["openid", "email", "groups"],
		groupsClaim: "groups",
		userClaim: "sub",
		claimMappings: { email: "email" },
		tokenPolicies: ["default", personalUserAccess.name],
	});

	new vault.jwt.AuthBackendRole("pocket-id-admin", {
		backend: pocketIdAuthBackend.path,
		roleName: "admin",
		roleType: "oidc",
		allowedRedirectUris: [
			"http://localhost:8250/oidc/callback",
			"https://vault.chezmoi.sh/ui/vault/auth/pocket-id/oidc/callback",
			"https://vault.tail831c5d.ts.net/ui/vault/auth/pocket-id/oidc/callback",
		],
		oidcScopes: ["openid", "email", "groups"],
		groupsClaim: "groups",
		userClaim: "sub",
		claimMappings: { email: "email" },
		boundClaimsType: "string",
		boundClaims: { groups: "admin" },
		tokenPolicies: ["default", ssoAdminPolicy.name, personalAdminAccess.name],
	});
}
