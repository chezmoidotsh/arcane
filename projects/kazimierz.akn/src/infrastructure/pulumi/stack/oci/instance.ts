import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

import { kazimierz } from "./compartments";
import { nsg, subnet } from "./network";

const config = new pulumi.Config();

// eu-paris-1 has exactly one AD (verified with `oci iam availability-domain
// list`) -- not a config knob, it will never be anything else.
const availabilityDomain = "jbln:EU-PARIS-1-AD-1";

// The OS disk is disposable: instance updates come from a fresh immutable
// NixOS image (#1077), never in-place mutation. All mutable Pangolin/Gerbil/
// Traefik state lives on this volume instead, decoupled from the instance's
// own lifecycle -- recreating the instance re-attaches the same volume.
// retainOnDelete mirrors the abandoned Crossplane version's `deletionPolicy:
// Orphan`: never let a `pulumi destroy` or accidental removal take the OCI
// block volume with it.
export const volume = new oci.core.Volume(
	"kazimierz-akn-pangolin-data",
	{
		availabilityDomain,
		compartmentId: kazimierz.id,
		displayName: "kazimierz-pangolin-data",
		sizeInGbs: "50",
		freeformTags: {
			project: "kazimierz.akn",
			role: "data",
			managed_by: "pulumi",
		},
	},
	{ retainOnDelete: true },
);

// VM.Standard.A1.Flex, sized to this tenancy's actual Always Free ARM quota:
// 2 OCPU / 12 GB in eu-paris-1 (verified with `oci limits value list
// --compartment-id <tenancy> --service-name compute`, standard-a1-core-count
// / standard-a1-memory-count) -- NOT the commonly-quoted 4 OCPU / 24 GB
// ceiling, which doesn't apply to this tenancy/region. A shapeConfig above
// this limit fails at `pulumi up` with a service-limit error.
export const instance = new oci.core.Instance("kazimierz-pangolin", {
	availabilityDomain,
	compartmentId: kazimierz.id,
	shape: "VM.Standard.A1.Flex",
	shapeConfig: { ocpus: 2, memoryInGbs: 12 },
	sourceDetails: {
		sourceType: "image",
		// Produced by #1077 (immutable NixOS image, not yet built). Set with
		// `pulumi config set oci_image_id <ocid>` once the first custom image
		// is imported into OCI.
		sourceId: config.require("oci_image_id"),
		bootVolumeSizeInGbs: "50",
	},
	createVnicDetails: {
		subnetId: subnet.id,
		// Typed as a string, not a boolean, in this resource's bridged args --
		// confirmed against the installed @pulumi/oci types (verified with tsc).
		assignPublicIp: "true",
		nsgIds: [nsg.id],
	},
	metadata: { ssh_authorized_keys: config.require("ssh_authorized_keys") },
	displayName: "kazimierz-pangolin",
	freeformTags: {
		project: "kazimierz.akn",
		role: "gateway",
		managed_by: "pulumi",
	},
});

// Paravirtualized attachment -- required for ARM Ampere instances. Detached
// and re-created on every instance replacement (see storage.nix's
// first-boot vs. re-attach handling in #1077); the Volume itself survives.
export const volumeAttachment = new oci.core.VolumeAttachment(
	"kazimierz-akn-pangolin-data-attachment",
	{
		attachmentType: "paravirtualized",
		instanceId: instance.id,
		volumeId: volume.id,
		isPvEncryptionInTransitEnabled: true,
		isShareable: false,
	},
);
