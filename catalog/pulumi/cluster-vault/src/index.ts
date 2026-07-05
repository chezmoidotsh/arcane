import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

/**
 * For a cluster reached over an untrusted network path (e.g. Ingress). The caller must
 * supply the CA certificate and a token reviewer JWT themselves, since fetching them
 * requires a Kubernetes provider already configured for that specific cluster.
 */
export interface RemoteClusterVaultConfig {
	host: pulumi.Input<string>;
	caCert: pulumi.Input<string>;
	tokenReviewerJwt: pulumi.Input<string>;
	/** Grants read access to shared/third-parties and shared/certificates paths. Defaults to true. */
	enableSharedAccess?: boolean;
}

/**
 * For a cluster reached over the tailnet. Unlike the untrusted-network case, the
 * Kubernetes API is directly reachable so no CA override or reviewer JWT secret is
 * needed — only the host differs from the in-cluster default.
 */
export interface TailscaledClusterVaultConfig {
	host: pulumi.Input<string>;
}

export interface ClusterVaultArgs {
	/** Cluster name, used as the KV mount path and auth backend path (e.g. "amiya.akn"). */
	name: string;
	/** Additional Vault policy names bound to the ESO auth role, alongside the generated ESO policy. */
	additionalPolicies?: pulumi.Input<string>[];
	/** Present for RemoteClusterVault, absent for Local/TailscaledClusterVault. */
	remote?: RemoteClusterVaultConfig;
	/** Present for TailscaledClusterVault, absent for Local/RemoteClusterVault. */
	tailscaled?: TailscaledClusterVaultConfig;
}

/**
 * Sets up Vault/OpenBao access for a single cluster: a KV v2 mount, a Kubernetes auth
 * backend, an ESO read policy, and an ESO auth role.
 */
export class ClusterVaultComponent extends pulumi.ComponentResource {
	public readonly mountPath: pulumi.Output<string>;
	public readonly authBackendPath: pulumi.Output<string>;

	constructor(
		name: string,
		args: ClusterVaultArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("chezmoi:vault:ClusterVault", name, {}, opts);
		if (args.remote && args.tailscaled) {
			throw new Error(
				"ClusterVaultComponent: 'remote' and 'tailscaled' are mutually exclusive",
			);
		}

		const parent: pulumi.ComponentResourceOptions = { parent: this };
		const clusterName = args.name;
		const variant = args.remote
			? "remote"
			: args.tailscaled
				? "Tailscaled"
				: "local";
		// Local and Tailscaled always grant shared access; Remote can opt out.
		const enableSharedAccess = args.remote
			? (args.remote.enableSharedAccess ?? true)
			: true;

		const mount = new vault.Mount(
			`${name}-mount`,
			{
				path: clusterName,
				type: "kv",
				description: `kv v2 mount for ${variant} cluster ${clusterName}`,
				options: { version: "2" },
			},
			parent,
		);

		const authBackend = new vault.AuthBackend(
			`${name}-auth-backend`,
			{
				path: clusterName,
				type: "kubernetes",
				description: `kubernetes auth backend for ${variant} cluster ${clusterName}`,
			},
			parent,
		);

		new vault.kubernetes.AuthBackendConfig(
			`${name}-auth-backend-config`,
			{
				backend: authBackend.path,
				kubernetesHost:
					args.remote?.host ??
					args.tailscaled?.host ??
					"https://kubernetes.default.svc.cluster.local",
				...(args.remote
					? {
							disableLocalCaJwt: true,
							kubernetesCaCert: args.remote.caCert,
							tokenReviewerJwt: args.remote.tokenReviewerJwt,
						}
					: {}),
			},
			parent,
		);

		const sharedAccessPolicy = enableSharedAccess
			? `
# Allow ESO to read all secrets in the shared/third-parties path scoped to this cluster
path "shared/+/third-parties/+/+/${clusterName}" { capabilities = ["read"] }
path "shared/+/third-parties/+/+/${clusterName}/*" { capabilities = ["read"] }

# Allow ESO to read all secrets in the shared/certificates path
path "shared/+/certificates/*" { capabilities = ["read"] }`
			: "";

		const esoPolicy = new vault.Policy(
			`${name}-eso-policy`,
			{
				name: `${clusterName}-eso-policy`,
				policy: `
# Allow ESO to read all secrets in the project path
path "${clusterName}/*" { capabilities = ["read"] }
${sharedAccessPolicy}
`,
			},
			parent,
		);

		new vault.kubernetes.AuthBackendRole(
			`${name}-eso-role`,
			{
				backend: authBackend.path,
				roleName: `${clusterName}-eso-role`,
				boundServiceAccountNames: ["external-secrets"],
				boundServiceAccountNamespaces: ["external-secrets-system"],
				tokenPolicies: pulumi.all([
					esoPolicy.name,
					...(args.additionalPolicies ?? []),
				]),
				tokenTtl: 900,
				tokenMaxTtl: 1800,
			},
			parent,
		);

		this.mountPath = mount.path;
		this.authBackendPath = authBackend.path;
		this.registerOutputs({
			mountPath: this.mountPath,
			authBackendPath: this.authBackendPath,
		});
	}
}
