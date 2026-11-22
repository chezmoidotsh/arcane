import * as tailscale from "@pulumi/tailscale";

// Admin access (SSH, deploys) goes through the tailnet; OCI SSH stays closed.
// Single-use pre-authorized key consumed by tailscaled on first boot
// (injected into the host's SOPS secrets, see docs/guides/Initialiser-Exusiai.md).
// `tag:svc-minecraft` must exist in the tailnet ACL `tagOwners`.
// The key expires 7 days after creation: once the host has joined the tailnet it is no longer used, but a
// `pulumi preview` after the expiry may plan to REPLACE it (new `tailscale_authkey`, sops file rewritten). That is
// harmless for a running host; add `ignoreChanges: ["expiry"]` if the noise bothers (see the deployment runbook).
const authKey = new tailscale.TailnetKey("exusiai-tailscale-key", {
  reusable: false,
  ephemeral: false,
  preauthorized: true,
  expiry: 3600 * 24 * 7,
  tags: ["tag:svc-minecraft"],
  // Former name of the host, kept on purpose: the Tailscale API cannot update a key, so a new
  // description replaces it (and its secret). Migration planned in #1601.
  description: "rimbilliton-akn first boot",
});
export const tailscaleAuthKey = authKey.key;
