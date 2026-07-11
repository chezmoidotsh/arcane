import * as truenas from "@pulumi/truenas";

// --- Services ----------------------------------------------------------
// `state` (RUNNING/STOPPED) is computed/read-only on this resource -- only
// `enable` (start on boot) is a real input.
//
// No `nvmet` here: the real NAS reports it via `service.query`, but this
// provider's own validator doesn't recognize "nvmet" as a valid `service`
// value at all (rejects it outright) -- not manageable through this
// resource until the provider's allow-list is updated upstream.

export interface ServiceSpec {
	service: string;
	enabled: boolean;
}

export const services: ServiceSpec[] = [
	{ service: "cifs", enabled: true },
	{ service: "ftp", enabled: false },
	{ service: "iscsitarget", enabled: false },
	{ service: "nfs", enabled: true },
	{ service: "snmp", enabled: false },
	{ service: "ssh", enabled: true },
	{ service: "ups", enabled: false },
];

for (const s of services) {
	new truenas.Service(`service-${s.service}`, {
		service: s.service,
		enable: s.enabled,
	});
}
