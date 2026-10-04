import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

import { rimbilliton } from "./compartments";
import { nsg, subnet } from "./network";

const config = new pulumi.Config();

// Same single AD as kazimierz.akn (eu-paris-1).
const availabilityDomain = "jbln:EU-PARIS-1-AD-1";

// Always Free A1 quota of this tenancy is 2 OCPU / 12 GB in total and
// kazimierz-pangolin already uses 1 OCPU / 6 GB -- this instance takes the
// other half. Boot volume: 50 GB (OCI minimum is 47), 100 GB already used by
// kazimierz => 150 / 200 GB Always Free block storage. World data lives on
// the boot volume (no separate data volume -- backups go to Backblaze B2).
//
// The image is a plain Ubuntu Minimal, only a *bootstrap* OS: NixOS is
// installed over it with nixos-anywhere (kexec), see ../../nixos/README.md and
// docs/BOOTSTRAP.md. Hence ignoreChanges on sourceDetails/metadata -- once
// NixOS is installed, a newer Ubuntu image must not trigger a replacement
// (which would wipe the world).
const ubuntuImage = oci.core.getImagesOutput({
	compartmentId: rimbilliton.id,
	operatingSystem: "Canonical Ubuntu",
	shape: "VM.Standard.A1.Flex",
});

export const instance = new oci.core.Instance(
	"rimbilliton-minecraft",
	{
		availabilityDomain,
		compartmentId: rimbilliton.id,
		shape: "VM.Standard.A1.Flex",
		shapeConfig: { ocpus: 1, memoryInGbs: 6 },
		sourceDetails: {
			sourceType: "image",
			sourceId: ubuntuImage.apply((image) => {
				const minimalAarch64 = /^Canonical-Ubuntu-\d+\.\d+-Minimal-aarch64-/;
				const candidates = image.images
					.filter((img) => minimalAarch64.test(img.displayName ?? ""))
					.sort((a, b) =>
						(b.displayName ?? "").localeCompare(a.displayName ?? ""),
					);
				if (candidates.length === 0) {
					throw new Error("No Ubuntu Minimal aarch64 platform image found");
				}
				return candidates[0].id;
			}),
			bootVolumeSizeInGbs: "50",
		},
		createVnicDetails: {
			subnetId: subnet.id,
			assignPublicIp: "true",
			assignIpv6ip: true,
			nsgIds: [nsg.id],
		},
		metadata: { ssh_authorized_keys: config.require("ssh_authorized_keys") },
		displayName: "rimbilliton-minecraft",
		freeformTags: {
			project: "rimbilliton.akn",
			role: "minecraft",
			managed_by: "pulumi",
		},
	},
	{ ignoreChanges: ["sourceDetails", "metadata"] },
);

export const publicIp = instance.publicIp;
