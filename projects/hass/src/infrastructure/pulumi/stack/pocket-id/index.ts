import * as pulumi from "@pulumi/pulumi";

// Home Assistant's OIDC client registration in Pocket-Id. Group membership
// (admin/maison/famille) is managed in chezmoi.sh, not here -- read across
// via StackReference rather than duplicating it.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});

export const maisonGroupId = chezmoiSh.getOutput(
	"maisonGroupId",
) as pulumi.Output<string>;

export * from "./home-assistant";
