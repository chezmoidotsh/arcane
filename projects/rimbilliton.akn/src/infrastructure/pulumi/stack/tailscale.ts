import * as tailscale from "@pulumi/tailscale";

// Admin access (SSH, deploys) goes through the tailnet; OCI SSH stays closed.
// Single-use pre-authorized key consumed by tailscaled on first boot
// (injected into the host's SOPS secrets, see docs/BOOTSTRAP.md).
// `tag:minecraft` must exist in the tailnet ACL `tagOwners`.
const authKey = new tailscale.TailnetKey("rimbilliton-tailscale-key", {
	reusable: false,
	ephemeral: false,
	preauthorized: true,
	expiry: 3600 * 24 * 7,
	tags: ["tag:minecraft"],
	description: "rimbilliton-akn first boot",
});
export const tailscaleAuthKey = authKey.key;
