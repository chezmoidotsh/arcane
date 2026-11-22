import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
const config = new pulumi.Config();

export const sshAuthorizedKeys = config.require("ssh_authorized_keys");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");

// Opt-in: SSH (tcp/22) ingress is only created when explicitly enabled.
// Defaults to closed -- flip with `pulumi config set unsecure true`.
export const unsecure = config.getBoolean("unsecure") ?? false;

// The chezmoi.sh stack owns the parent OCI compartment and the Pocket-Id groups (admin/maison/famille).
// One StackReference per program: a second one with the same name would collide.
export const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});
