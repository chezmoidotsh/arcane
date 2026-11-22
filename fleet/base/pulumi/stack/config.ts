import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
// The OCI, Cloudflare, Pocket-Id and Tailscale providers authenticate with TF_VAR_*, CLOUDFLARE_*,
// POCKET_ID_API_KEY and TAILSCALE_API_KEY (fnox, see ../../.fnox.toml): never a Pulumi config, the provider
// configuration is stored in the state and a refresh reuses that stored copy.
const config = new pulumi.Config();

// Account and zone of the Cloudflare DNS-01 token of the observability LXC (stack/observability/credentials.ts).
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");

// Tenancy the parent compartment lives in (stack/cloud/oci.ts).
export const tenancyOcid = process.env.TF_VAR_tenancy_ocid;
