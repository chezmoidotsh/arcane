import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
// The TrueNAS, Backblaze B2, Cloudflare and OpenBao providers authenticate with TRUENAS_API_KEY / B2_* /
// CLOUDFLARE_* (fnox, see ../../.fnox.toml) and the `mise run bao:login` session: never a Pulumi config, the
// provider configuration is stored in the state and a refresh reuses that stored copy.
const config = new pulumi.Config();

// Account and zone of the Cloudflare DNS-01 token behind TrueNAS's ACME authenticator (stack/system/certificates.ts).
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");

// Garage app settings (stack/apps.ts).
export const garageAdminToken = config.requireSecret("garage_admin_token");
export const garageRpcSecret = config.requireSecret("garage_rpc_secret");
export const garageWebUiPassword = config.requireSecret("garage_web_ui_password");
export const garageWebUiUsername = config.requireSecret("garage_web_ui_username");
