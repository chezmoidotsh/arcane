import { ProxmoxClusterIdentityComponent } from "@chezmoi.sh/pulumi-proxmox-cluster-identity";
import * as k8s from "@pulumi/kubernetes";
import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// Proxmox CCM/CSI identity + Secret delivery (Pulumi-owned end-to-end, never
// Vault/ESO — same reasoning as cloudnative-pg.ts's direct Kubernetes
// provider writes: this stack already needs privileged kubeconfig access to
// deliver the Secret below, so routing it through Vault/ESO would add
// indirection with no confidentiality benefit).
// -----------------------------------------------------------------------------
// This stack mints the kubernetes-cloud-provider@pve identity itself,
// directly against pve-01, rather than consuming a token minted by
// chezmoi.sh's stack — that stack owns pve-01 as a whole, but a Kubernetes
// cluster's own CCM/CSI credentials are this cluster's concern, not a
// shared-infra one. Doing so requires this stack to
// configure its own Proxmox provider, authenticated with a delegated,
// narrowly-scoped credential (rhodes-akn-bootstrap@pve, Administrator at
// /access only — cannot touch VMs, storage or SDN) that chezmoi.sh's
// stack/proxmox/access/rhodes-akn-bootstrap.ts mints for exactly this
// purpose. See catalog/pulumi/components/proxmox-cluster-identity's README
// for the full pattern.
//
// CCM and CSI share a single identity/token/Secret here — a deliberate
// simplification over the split-per-concern design chezmoi.sh's stack used
// to have (KubernetesCCM/KubernetesCSI as two separate least-privilege
// roles). The trade-off: a compromise of this one token now carries both
// concerns' privileges (node/VM audit AND volume/VM lifecycle) instead of
// being contained to one. Accepted for this single-node, single-cluster
// deployment; revisit the split if that trust boundary ever needs to matter
// again.
//
// The delegated credential arrives as a Kubernetes Secret chezmoi.sh's own
// stack writes directly into this cluster (kube-system), not through a
// Pulumi StackReference — reading a *secret* StackReference output requires
// holding the exporting stack's own passphrase, and this repo deliberately
// keeps every project's Pulumi state passphrase separate (see
// docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md
// and chezmoi.sh's stack/proxmox/access/rhodes-akn-bootstrap.ts for the full
// reasoning). Uses the default Kubernetes provider — same ambient
// `kubernetes:context` as everything else in this file.
const bootstrapSecret = k8s.core.v1.Secret.get(
	"rhodes-akn-bootstrap-pve",
	"kube-system/rhodes-akn-bootstrap-pve",
);
// Already the complete, ready-to-use `USER@REALM!TOKENID=SECRET` string — see
// chezmoi.sh's stack/proxmox/access/rhodes-akn-bootstrap.ts for why this must
// not be rebuilt from separate id/secret parts.
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
		userId: "kubernetes-cloud-provider@pve",
		comment:
			"Kubernetes CCM+CSI (rhodes.akn) - node/VM audit and volume lifecycle",
		role: {
			roleId: "KubernetesCloudProvider",
			// Union of the former KubernetesCCM (node/VM audit) and
			// KubernetesCSI (volume + VM lifecycle, for dynamic provisioning)
			// privilege sets — see this file's header comment for the
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
		// Talos VM's disk/config lifecycle (CSI) — see ../pools.ts in
		// chezmoi.sh's stack for the `talos` pool this is scoped to.
		aclPaths: ["/nodes/pve-01", "/pool/talos"],
		tokenName: "cloud-provider",
		tokenComment: "proxmox-cloud-controller-manager + proxmox-csi-plugin token",
		provider: pveProvider,
	},
);

// The Secret shape below matches what each chart's own templates/secrets.yaml
// would otherwise generate (verified against
// https://artifacthub.io/packages/helm/proxmox-ccm/proxmox-cloud-controller-manager?modal=template&template=secrets.yaml
// and the vendored proxmox-csi-plugin chart's equivalent template): a single
// config.yaml key holding the full clusters/features config as YAML — which
// is also valid JSON, so pulumi.jsonStringify is enough, no YAML library
// needed.
//
// Uses the default Kubernetes provider, configured once per stack via
// `pulumi config set kubernetes:context admin@rhodes.akn` (see
// cloudnative-pg.ts and Pulumi.rhodes_akn.live.yaml's comment) — not
// hardcoded here, so this program can't silently write to the wrong
// cluster's context by mistake if that config is ever unset.
//
// Namespaces aren't created by this stack (ArgoCD's CreateNamespace=true sync
// option does — see system.applicationset.yaml) — this Secret can only be
// applied once proxmox-system already exists.
//
// Both proxmox-cloud-controller-manager.helmvalues/default.yaml and
// proxmox-csi-plugin.helmvalues/default.yaml point existingConfigSecret at
// this one Secret name.
new k8s.core.v1.Secret("proxmox-cloud-provider-config", {
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
});
