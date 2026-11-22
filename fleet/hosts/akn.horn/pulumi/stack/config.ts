import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
const config = new pulumi.Config();

export const sshAuthorizedKeys = config.require("ssh_authorized_keys");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");

// Opt-in: SSH (tcp/22) ingress is only created when explicitly enabled.
// Defaults to closed -- flip with `pulumi config set unsecure true`.
export const unsecure = config.getBoolean("unsecure") ?? false;

// The Pangolin resources (org, IdP, role) are configured through the Integration API of the Pangolin instance that
// this very stack provisions: on a first install there is nothing to talk to yet. Run the first `pulumi up` with
// `pulumi config set pangolin false`, install the host, then `pulumi config rm pangolin` and apply again.
// On by default, because turning it off on a stack that already holds these resources DELETES them from Pangolin.
export const withPangolin = config.getBoolean("pangolin") ?? true;

// The OCI provider authenticates with TF_VAR_* (fnox); the tenancy id is also needed to look up the parent
// compartment. Same convention as the chezmoi.sh stack: never a Pulumi config for OCI credentials.
const tenancyOcidFromEnv = process.env.TF_VAR_tenancy_ocid;
if (!tenancyOcidFromEnv) {
	throw new Error("TF_VAR_tenancy_ocid must be set (OCI credentials, see ../.fnox.toml)");
}
export const tenancyOcid = tenancyOcidFromEnv;
