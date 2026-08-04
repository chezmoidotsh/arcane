import { ProxmoxClusterIdentityComponent } from "@chezmoi.sh/pulumi-proxmox-cluster-identity";
import * as k8s from "@pulumi/kubernetes";
import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// Proxmox CCM/CSI identity + Secret delivery (Pulumi-owned end-to-end, never
// Vault/ESO): Pulumi already needs privileged kubeconfig access to deliver
// the Secret below, so routing it through Vault/ESO would add indirection
// with no confidentiality benefit.
// -----------------------------------------------------------------------------
// This stack mints the kubernetes-cloud-provider@pve identity itself,
// directly against pve-01, using a delegated, narrowly-scoped credential
// (lungmen-akn-bootstrap@pve, Administrator at /access only) that chezmoi.sh's
// stack/proxmox/access/lungmen-akn-bootstrap.ts mints for exactly this
// purpose. See catalog/pulumi/components/proxmox-cluster-identity's README
// for the full pattern.
//
// CCM and CSI deliberately share a single identity/token/Secret rather than
// one least-privilege role each. Risk: a compromise of this one token
// carries both concerns' privileges (node/VM audit AND volume/VM lifecycle)
// instead of being contained to one — acceptable for this single-node,
// single-cluster deployment.
//
// The delegated credential arrives as a Kubernetes Secret chezmoi.sh's own
// stack writes directly into the new lungmen-akn cluster (kube-system), not
// through a Pulumi StackReference — reading a *secret* StackReference output
// requires holding the exporting stack's own passphrase, and this repo
// deliberately keeps every project's Pulumi state passphrase separate (see
// docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md).
//
// Explicit named provider, not the ambient default: this project's other
// stack files (cert-manager.ts, vault.ts, cloudnative-pg.ts, ...) all go
// through Vault/ESO and never touch Kubernetes directly, so there is no
// ambient default provider to depend on here.
const lungmenAkn = new k8s.Provider("lungmen-akn", {
	context: "omni-lungmen-akn",
});

const bootstrapSecret = k8s.core.v1.Secret.get(
	"lungmen-akn-bootstrap-pve",
	"kube-system/lungmen-akn-bootstrap-pve",
	{ provider: lungmenAkn },
);
// Already the complete, ready-to-use `USER@REALM!TOKENID=SECRET` string.
// Re-concatenating userId!tokenName onto it produces a doubly-prefixed,
// invalid token — pass it through as-is, don't rebuild it.
const bootstrapApiToken = bootstrapSecret.data["api-token"].apply((v) =>
	Buffer.from(v, "base64").toString("utf-8"),
);

const pveProvider = new proxmox.Provider("pve-01", {
	endpoint: "https://pve-01.pve.chezmoi.sh:8006/api2/json",
	insecure: true,
	apiToken: bootstrapApiToken,
});

const cloudProviderIdentity = new ProxmoxClusterIdentityComponent(
	"kubernetes-cloud-provider",
	{
		// userId/roleId are global on pve-01, not scoped per Kubernetes cluster:
		// each cluster's cloud-provider identity needs its own distinct name.
		userId: "kubernetes-cloud-provider-lungmen@pve",
		comment:
			"Kubernetes CCM+CSI (lungmen.akn) - node/VM audit and volume lifecycle",
		role: {
			roleId: "KubernetesCloudProviderLungmen",
			// Covers both CCM (node/VM audit) and CSI (volume + VM lifecycle, for
			// dynamic provisioning) — see this file's header comment for the
			// merged-identity trade-off.
			privileges: [
				"Sys.Audit",
				"VM.Audit",
				"VM.GuestAgent.Audit",
				"Datastore.Allocate",
				"Datastore.AllocateSpace",
				"Datastore.Audit",
				"VM.Allocate",
				"VM.Clone",
				"VM.Config.CPU",
				"VM.Config.Disk",
				"VM.Config.HWType",
				"VM.Config.Memory",
				"VM.Config.Options",
				"VM.Migrate",
				"VM.PowerMgmt",
			],
		},
		// Node-scoped: topology + lifecycle status (CCM). Pool-scoped: every
		// Talos VM's disk/config lifecycle (CSI) — the shared `talos` pool every
		// cluster's VMs belong to (see chezmoi.sh's stack/proxmox/pools.ts).
		aclPaths: ["/nodes/pve-01", "/pool/talos"],
		tokenName: "cloud-provider",
		tokenComment: "proxmox-cloud-controller-manager + proxmox-csi-plugin token",
		provider: pveProvider,
	},
);

// proxmox-cloud-controller-manager and proxmox-csi-plugin both run in this
// namespace (projects/lungmen.akn/src/infrastructure/kubernetes/proxmox/).
// Created here rather than left to ArgoCD's CreateNamespace=true (not yet
// adopted by ArgoCD) so the config Secret below has somewhere to land.
// retainOnDelete: a `pulumi destroy` must not take the namespace (and every
// live CCM/CSI pod in it) down with it.
const proxmoxSystemNamespace = new k8s.core.v1.Namespace(
	"proxmox-system",
	{
		metadata: {
			name: "proxmox-system",
			labels: {
				// proxmox-csi-plugin's node DaemonSet needs privileged/hostPath
				// access (mounting Proxmox-attached block devices into kubelet's
				// pod dir) — the "restricted" Pod Security default rejects that.
				"pod-security.kubernetes.io/enforce": "privileged",
				"pod-security.kubernetes.io/enforce-version": "v1.33",
			},
		},
	},
	{ provider: lungmenAkn, retainOnDelete: true },
);

// The Secret shape below matches what each chart's own templates/secrets.yaml
// would otherwise generate (verified against
// https://artifacthub.io/packages/helm/proxmox-ccm/proxmox-cloud-controller-manager?modal=template&template=secrets.yaml
// and the vendored proxmox-csi-plugin chart's equivalent template): a single
// config.yaml key holding the full clusters/features config as YAML — which
// is also valid JSON, so pulumi.jsonStringify is enough, no YAML library
// needed.
new k8s.core.v1.Secret(
	"proxmox-cloud-provider-config",
	{
		metadata: { name: "proxmox-cloud-provider", namespace: "proxmox-system" },
		type: "Opaque",
		stringData: {
			"config.yaml": pulumi.jsonStringify({
				clusters: [
					{
						url: "https://pve-01.pve.chezmoi.sh:8006/api2/json",
						token_id: cloudProviderIdentity.tokenId,
						token_secret: cloudProviderIdentity.tokenSecret,
						region: "homelab",
					},
				],
				features: { provider: "default" },
			}),
		},
	},
	{ provider: lungmenAkn, dependsOn: [proxmoxSystemNamespace] },
);
