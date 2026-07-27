import * as garage from "@axnic/pulumi-garage";
import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

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

// ---------------------------------------------------------------------------
// Read access to amiya.akn's bucket (pre-migration prep)
// ---------------------------------------------------------------------------
// Ahead of the amiya.akn -> rhodes.akn migration, this cluster's own CNPG
// backup key is granted read-only access to amiya's bucket too, so vault's and
// pocket-id's Cluster manifests here (see the new "amiya-akn" ObjectStore in
// src/apps/{vault,pocket-id}/) can bootstrap-recover straight from amiya's live
// backups. Archiving new backups/WAL keeps going to this cluster's own bucket,
// unchanged, via the "selfhosted" ObjectStore/Secret above.
const amiyaAkn = new pulumi.StackReference("amiya.akn", {
	name: "organization/amiya-akn-infra/amiya_akn.live",
});

new garage.BucketKeyPermission("garage-cnpg-backup-amiya-akn-permission", {
	accessKeyId: component.accessKeyId,
	bucketId: amiyaAkn.getOutput("garageBackupBucketId"),
	permissions: { read: true },
});
