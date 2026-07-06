import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

export const cloudflare = {
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
};
