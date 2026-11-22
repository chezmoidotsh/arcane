import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
const config = new pulumi.Config();

export const sshAuthorizedKeys = config.require("ssh_authorized_keys");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");

// Opt-in: SSH (tcp/22) ingress is only created when explicitly enabled.
// Defaults to closed -- flip with `pulumi config set unsecure true`.
export const unsecure = config.getBoolean("unsecure") ?? false;

// The OCI provider authenticates with TF_VAR_* (fnox); the tenancy id is also needed to look up the parent
// compartment. Same convention as the chezmoi.sh stack: never a Pulumi config for OCI credentials.
const tenancyOcidFromEnv = process.env.TF_VAR_tenancy_ocid;
if (!tenancyOcidFromEnv) {
	throw new Error("TF_VAR_tenancy_ocid must be set (OCI credentials, see ../.fnox.toml)");
}
export const tenancyOcid = tenancyOcidFromEnv;
