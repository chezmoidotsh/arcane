import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// -----------------------------------------------------------------------------
// Proxmox CCM/CSI Secret delivery (Pulumi-owned end-to-end, never Vault/ESO)
// -----------------------------------------------------------------------------
// The kubernetes-ccm@pve / kubernetes-csi@pve API tokens are minted in
// projects/chezmoi.sh's Pulumi program (stack/proxmox/access.ts), not here —
// this stack only owns the cluster side. Consumed via a StackReference and
// written straight into this cluster as the Secrets
// proxmox-cloud-controller-manager and proxmox-csi-plugin already expect
// (existingConfigSecret in src/infrastructure/kubernetes/proxmox/*.helmvalues
// /default.yaml). Same reasoning as cloudnative-pg.ts's direct Kubernetes
// provider writes: Pulumi already needs privileged kubeconfig access to
// deliver this, so routing it through Vault/ESO would add indirection with
// no confidentiality benefit (issue #370's bring-up plan,
// .agents/sessions/20260720-rhodes-cluster-bringup-planning.md decision #1).
//
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
// option does — see system.applicationset.yaml) — these Secrets can only be
// applied once proxmox-system already exists.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});

function proxmoxConfigSecret(
	resourceName: string,
	secretName: string,
	tokenId: pulumi.Output<string>,
	tokenSecret: pulumi.Output<string>,
) {
	return new k8s.core.v1.Secret(resourceName, {
		metadata: { name: secretName, namespace: "proxmox-system" },
		type: "Opaque",
		stringData: {
			"config.yaml": pulumi.jsonStringify({
				clusters: [
					{
						url: "https://pve-01.pve.chezmoi.sh:8006/api2/json",
						token_id: tokenId,
						token_secret: tokenSecret,
						region: "homelab",
					},
				],
				features: { provider: "default" },
			}),
		},
	});
}

proxmoxConfigSecret(
	"proxmox-cloud-controller-manager-config",
	"proxmox-cloud-controller-manager",
	chezmoiSh.getOutput("kubernetesCcmTokenId").apply((v) => v as string),
	chezmoiSh.getOutput("kubernetesCcmTokenSecret").apply((v) => v as string),
);

proxmoxConfigSecret(
	"proxmox-csi-plugin-config",
	"proxmox-csi-plugin",
	chezmoiSh.getOutput("kubernetesCsiTokenId").apply((v) => v as string),
	chezmoiSh.getOutput("kubernetesCsiTokenSecret").apply((v) => v as string),
);
