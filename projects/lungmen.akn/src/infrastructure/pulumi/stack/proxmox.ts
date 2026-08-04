import { ProxmoxClusterIdentityComponent } from "@chezmoi.sh/pulumi-proxmox-cluster-identity";
import * as k8s from "@pulumi/kubernetes";
import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// Proxmox CCM/CSI identity + Secret delivery (Pulumi-owned end-to-end, never
// Vault/ESO). Mirrors rhodes.akn's stack/proxmox.ts — see that file's header
// comment for the full reasoning (chezmoidotsh/arcane#1188 recreates
// lungmen.akn the same way #370 recreated amiya.akn as rhodes.akn).
// -----------------------------------------------------------------------------
// This stack mints the kubernetes-cloud-provider@pve identity itself,
// directly against pve-01, using a delegated, narrowly-scoped credential
// (lungmen-akn-bootstrap@pve, Administrator at /access only) that chezmoi.sh's
// stack/proxmox/access/lungmen-akn-bootstrap.ts mints for exactly this
// purpose. See catalog/pulumi/components/proxmox-cluster-identity's README
// for the full pattern.
//
// CCM and CSI share a single identity/token/Secret (same trade-off accepted
// on rhodes.akn — see rhodes.akn's stack/proxmox.ts for the reasoning).
//
// The delegated credential arrives as a Kubernetes Secret chezmoi.sh's own
// stack writes directly into the new lungmen-akn cluster (kube-system), not
// through a Pulumi StackReference (per-project passphrase isolation, see
// docs/procedures/infrastructure/INF-20260705-00.pulumi-state-and-import.md).
//
// Explicit named provider, not the ambient default: unlike rhodes.akn (a
// single-context project), this project's existing stack files
// (cert-manager.ts, vault.ts, cloudnative-pg.ts, ...) all go through
// Vault/ESO and never touch Kubernetes directly, and during the old-cluster/
// new-cluster transition an ambient default could too easily end up pointed
// at the wrong one. Pinning explicitly to the new cluster's Omni context
// avoids that class of mistake entirely.
const lungmenAkn = new k8s.Provider("lungmen-akn", {
	context: "omni-lungmen-akn",
});

const bootstrapSecret = k8s.core.v1.Secret.get(
	"lungmen-akn-bootstrap-pve",
	"kube-system/lungmen-akn-bootstrap-pve",
	{ provider: lungmenAkn },
);
// Already the complete, ready-to-use `USER@REALM!TOKENID=SECRET` string — see
// chezmoi.sh's stack/proxmox/access/lungmen-akn-bootstrap.ts for why this
// must not be rebuilt from separate id/secret parts.
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
		// userId/roleId are global on pve-01, not scoped per Kubernetes cluster —
		// rhodes.akn's stack/proxmox.ts already owns the unqualified
		// "kubernetes-cloud-provider@pve" / "KubernetesCloudProvider" names
		// (confirmed live: creating this identity without the "-lungmen" suffix
		// failed with "resource already exists"). Every cluster's identity needs
		// its own distinct name.
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
		// Talos VM's disk/config lifecycle (CSI) — same shared `talos` pool
		// rhodes.akn uses (see chezmoi.sh's stack/proxmox/pools.ts).
		aclPaths: ["/nodes/pve-01", "/pool/talos"],
		tokenName: "cloud-provider",
		tokenComment: "proxmox-cloud-controller-manager + proxmox-csi-plugin token",
		provider: pveProvider,
	},
);

// The Secret shape below matches what each chart's own templates/secrets.yaml
// would otherwise generate — see rhodes.akn's stack/proxmox.ts for the
// verification references. A single config.yaml key holding the full
// clusters/features config as YAML (also valid JSON).
//
// Namespaces aren't created by this stack (ArgoCD's CreateNamespace=true sync
// option does, once ArgoCD adopts this cluster) — this Secret can only be
// applied once proxmox-system already exists (created via `kubectl apply` on
// the dist/-rendered namespace manifest during bootstrap, before ArgoCD
// exists on lungmen-akn).
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
	{ provider: lungmenAkn },
);
