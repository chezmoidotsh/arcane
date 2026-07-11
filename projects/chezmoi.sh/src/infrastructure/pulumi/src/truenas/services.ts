import * as truenas from "@pulumi/truenas";

// --- Services ----------------------------------------------------------
// `state` (RUNNING/STOPPED) is computed/read-only on this resource -- only
// `enable` (start on boot) is a real input.
//
// No `nvmet` here: the real NAS reports it via `service.query`, but this
// provider's own validator doesn't recognize "nvmet" as a valid `service`
// value at all (rejects it outright) -- not manageable through this
// resource until the provider's allow-list is updated upstream.

new truenas.Service("service-cifs", { service: "cifs", enable: true });
new truenas.Service("service-ftp", { service: "ftp", enable: false });
new truenas.Service("service-iscsitarget", {
	service: "iscsitarget",
	enable: false,
});
new truenas.Service("service-nfs", { service: "nfs", enable: true });
new truenas.Service("service-snmp", { service: "snmp", enable: false });
new truenas.Service("service-ssh", { service: "ssh", enable: true });
new truenas.Service("service-ups", { service: "ups", enable: false });
