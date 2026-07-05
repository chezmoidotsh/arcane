import * as pulumi from "@pulumi/pulumi";
import { isLegacyApplyEnabled } from "@pulumi/pulumi/runtime";

const config = new pulumi.Config();

export const isBootstraping = config.getBoolean("bootstrap_mode") ?? false;
export const cloudflare = {
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
};
export const pocketId = {
	oidcClientSecret: config.requireSecret("pocket_id_oidc_client_secret"),
};
