import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

/**
 * Remote-only configuration, mirroring the Crossplane RemoteClusterVault XRD
 * (catalog/crossplane/clustervault.vault.chezmoi.sh/remote.x.v1alpha1.openbao.yaml).
 * The CA certificate and token reviewer JWT must be fetched by the caller
 * (e.g. from the labelled `vault.crossplane.chezmoi.sh/cluster-name` Secret)
 * since fetching Kubernetes objects requires a provider the caller already
 * configures for its own cluster.
 */
export interface RemoteClusterVaultConfig {
	host: pulumi.Input<string>;
	caCert: pulumi.Input<string>;
	tokenReviewerJwt: pulumi.Input<string>;
	/** Grants read access to shared/third-parties and shared/certificates paths. Defaults to true. */
	enableSharedAccess?: boolean;
}

export interface ClusterVaultArgs {
	/** Cluster name, used as the KV mount path and auth backend path (e.g. "amiya.akn"). */
	name: string;
	/** Additional Vault policy names bound to the ESO auth role, alongside the generated ESO policy. */
	additionalPolicies?: pulumi.Input<string>[];
	/** Present for RemoteClusterVault, absent for LocalClusterVault. */
	remote?: RemoteClusterVaultConfig;
}

/**
 * Replaces the Crossplane LocalClusterVault/RemoteClusterVault XRDs: a KV v2
 * mount, a Kubernetes auth backend, an ESO read policy, and an ESO auth role
 * for a single cluster.
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
		const parent: pulumi.ComponentResourceOptions = { parent: this };
		const clusterName = args.name;
		const isRemote = args.remote !== undefined;
		const enableSharedAccess = args.remote?.enableSharedAccess ?? true;

		const mount = new vault.Mount(
			`${name}-mount`,
			{
				path: clusterName,
				type: "kv",
				description: `kv v2 mount for ${isRemote ? "remote" : "local"} cluster ${clusterName}`,
				options: { version: "2" },
			},
			parent,
		);

		const authBackend = new vault.AuthBackend(
			`${name}-auth-backend`,
			{
				path: clusterName,
				type: "kubernetes",
				description: `kubernetes auth backend for cluster ${clusterName}`,
			},
			parent,
		);

		new vault.kubernetes.AuthBackendConfig(
			`${name}-auth-backend-config`,
			{
				backend: authBackend.path,
				kubernetesHost:
					args.remote?.host ?? "https://kubernetes.default.svc.cluster.local",
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
