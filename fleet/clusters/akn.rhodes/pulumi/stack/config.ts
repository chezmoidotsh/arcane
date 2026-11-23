import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
const config = new pulumi.Config();

export const kubernetesContext = new pulumi.Config("kubernetes").require("context");

// Recovery mode: Vault/OpenBao runs on this cluster, so nothing Vault-side is reachable until the
// cluster is far enough into bring-up (or recovery) to serve it (see system/vault.ts).
export const recovery = config.getBoolean("recovery");

export const cloudflare = {
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
};

// Group membership (admin/maison/famille) is managed in chezmoi.sh, not here: read across through a StackReference
// rather than duplicated. Used by the Pocket-Id clients.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/base/base.live",
});

export const adminGroupId = chezmoiSh.getOutput("adminGroupId") as pulumi.Output<string>;
