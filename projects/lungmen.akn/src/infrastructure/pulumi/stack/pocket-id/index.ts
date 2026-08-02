import * as pulumi from "@pulumi/pulumi";

// The OIDC clients this cluster's apps authenticate against, one file per
// application below.
//
// Group membership (admin/maison/famille) is managed in chezmoi.sh, not
// here -- read across via StackReference rather than duplicating it.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});

export const maisonGroupId = chezmoiSh.getOutput(
	"maisonGroupId",
) as pulumi.Output<string>;
export const familleGroupId = chezmoiSh.getOutput(
	"familleGroupId",
) as pulumi.Output<string>;

export * from "./actual-budget";
export * from "./forgejo";
export * from "./immich";
export * from "./jellyfin";
export * from "./linkding";
export * from "./paperless-ngx";
