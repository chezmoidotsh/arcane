import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
const config = new pulumi.Config();

export const sshAuthorizedKeys = config.require("ssh_authorized_keys");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");

// Opt-in SSH (tcp/22), closed by default: administration goes through Tailscale (see stack/access/tailscale.ts).
// Flip with `pulumi config set unsecure true` for a break-glass session.
export const unsecure = config.getBoolean("unsecure") ?? false;

// The OCI provider authenticates with TF_VAR_* (fnox); the tenancy id is also needed to look up the parent
// compartment. Same convention as the chezmoi.sh stack: never a Pulumi config for OCI credentials.
const tenancyOcidFromEnv = process.env.TF_VAR_tenancy_ocid;
if (!tenancyOcidFromEnv) {
	throw new Error("TF_VAR_tenancy_ocid must be set (OCI credentials, see fleet/.fnox.toml)");
}
export const tenancyOcid = tenancyOcidFromEnv;
