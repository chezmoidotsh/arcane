import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
// The PBS and Backblaze B2 providers authenticate with PBS_API_TOKEN / B2_* (fnox, see ../.fnox.toml): never a
// Pulumi config, the provider configuration is stored in the state and a refresh reuses that stored copy.
const config = new pulumi.Config();

// Account and zone of the Cloudflare DNS-01 token (stack/access/acme.ts).
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");

// Slack incoming webhook (stack/notifications/slack.ts). It lives in a SOPS file that this stack, which runs
// upstream of any cluster, cannot read: copied by hand.
export const notificationsSlackWebhookUrl = config.requireSecret("notificationsSlackWebhookUrl");
