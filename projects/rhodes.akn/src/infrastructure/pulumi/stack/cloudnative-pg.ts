import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";
import * as k8s from "@pulumi/kubernetes";

// ---------------------------------------------------------------------------
// Garage S3 bucket + credentials for CNPG backup object stores (rhodes)
// ---------------------------------------------------------------------------
// rhodes can't depend on Vault for its own backup credentials (chicken-and-egg,
// same reason vault.ts's own PG creds never come from Vault either — see
// docs/disaster-recovery/README.md). Unlike a Vault-sourced secret, this one is
// written straight into the cluster below via the Kubernetes provider — no SOPS,
// no recovery-mode gating, both vault and pocket-id read the same
// cnpg-backup-credentials Secret from their own namespace.
const component = new GarageCloudNativePGObjectStore("garage-cnpg-backup", {
	projectName: "rhodes.akn",
});

// Uses the default Kubernetes provider, configured once per stack via
// `pulumi config set kubernetes:context admin@rhodes.akn` — not hardcoded here,
// so this program can't silently write to the wrong cluster's context by
// mistake if that config is ever unset.
//
// Namespaces aren't created by this stack (kubectl/ArgoCD does — see
// docs/disaster-recovery/{openbao,pocket-id}.md Step 1) — this Secret can only
// be applied once the target namespace already exists.
for (const namespace of ["vault", "pocket-id"]) {
	new k8s.core.v1.Secret(
		`cnpg-backup-credentials-${namespace}`,
		{
			metadata: { name: "cnpg-backup-credentials", namespace },
			type: "Opaque",
			stringData: {
				access_key_id: component.accessKeyId,
				access_secret_key: component.secretAccessKey,
				endpoint_url: "https://s3.chezmoi.sh",
				region: "fr-par-1",
			},
		},
		{ parent: component },
	);
}
