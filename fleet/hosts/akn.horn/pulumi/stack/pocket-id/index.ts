import * as pulumi from "@pulumi/pulumi";

// The OIDC clients this cluster's apps authenticate against, one file per
// application below.
//
// Group membership (admin/maison/famille) is managed in the base stack, not
// here -- read across via StackReference rather than duplicating it. Also
// read by ../oci/compartments.ts (parent compartment id): one StackReference
// per program, a second one with the same name would collide.
export const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
	name: "organization/base/base.live",
});

export const maisonGroupId = chezmoiSh.getOutput(
	"maisonGroupId",
) as pulumi.Output<string>;
export const familleGroupId = chezmoiSh.getOutput(
	"familleGroupId",
) as pulumi.Output<string>;

export * from "./pangolin";
