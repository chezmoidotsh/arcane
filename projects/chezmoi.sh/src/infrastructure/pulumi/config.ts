import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

export const cloudflare = {
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
};

export const garage = {
	adminToken: config.requireSecret("garage_admin_token"),
	rpcSecret: config.requireSecret("garage_rpc_secret"),
	webUiPassword: config.requireSecret("garage_web_ui_password"),
	webUiUsername: config.requireSecret("garage_web_ui_username"),
};
