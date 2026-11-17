import * as pulumi from "@pulumi/pulumi";

// Home Assistant's OIDC client registration in Pocket-Id. Group membership
// (admin/maison/famille) is managed in the base stack, not here -- read across
// via StackReference rather than duplicating it.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/base/base.live",
});

export const maisonGroupId = chezmoiSh.getOutput(
	"maisonGroupId",
) as pulumi.Output<string>;

export * from "./home-assistant";
