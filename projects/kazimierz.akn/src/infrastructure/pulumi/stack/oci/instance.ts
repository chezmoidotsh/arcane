import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

import { kazimierz } from "./compartments";
import { nsg, subnet } from "./network";

const config = new pulumi.Config();

// eu-paris-1 has exactly one AD (verified with `oci iam availability-domain
// list`) -- not a config knob, it will never be anything else.
const availabilityDomain = "jbln:EU-PARIS-1-AD-1";

// Pangolin/Gerbil/Traefik state lives on this volume, decoupled from the
// instance's own lifecycle -- recreating the instance re-attaches the same
// volume. retainOnDelete mirrors the abandoned Crossplane version's
// `deletionPolicy: Orphan`: never let a `pulumi destroy` or accidental
// removal take the OCI block volume with it.
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

// Latest Canonical Ubuntu Minimal ARM platform image, whatever version that
// currently is (no version pinned) -- resolved live instead of a pinned
// OCID, since OCI drops dated platform-image OCIDs from the list once a
// newer one ships. Minimal variant: smaller boot footprint, the
// `system_setup`/`pangolin` Ansible roles handle the rest.
//
// Sorted by DISPLAYNAME, not TIMECREATED: OCI republishes older LTS builds
// (e.g. 22.04) on maintenance schedules independent of the newest release,
// so TIMECREATED DESC can put a stale 22.04 rebuild ahead of 24.04 (verified
// live: a 22.04 rebuild had a later timestamp than the current 24.04 image).
// Display names sort correctly by version because they share the same
// "Canonical-Ubuntu-<ver>-Minimal-aarch64-<date>-<rev>" format at every
// position that matters.
const ubuntuImage = oci.core.getImagesOutput({
	compartmentId: kazimierz.id,
	operatingSystem: "Canonical Ubuntu",
	shape: "VM.Standard.A1.Flex",
	sortBy: "DISPLAYNAME",
	sortOrder: "DESC",
	filters: [
		{
			name: "display-name",
			regex: true,
			values: ["^Canonical-Ubuntu-\\d+\\.\\d+-Minimal-aarch64-"],
		},
	],
});

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
		sourceId: ubuntuImage.apply((image) => image.images[0].id),
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
// and re-created on every instance replacement; the Volume itself survives
// and the Ansible role handles first-boot init vs. re-attach of existing
// state on it.
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
