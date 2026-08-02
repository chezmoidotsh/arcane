import { pocketIdProvider } from "@chezmoi.sh/pulumi-lib";
import * as pocketid from "@pulumi/pocket-id";

const provider = pocketIdProvider();

// Groups shared across every cluster: Vault, ArgoCD and every app below bind
// their access policies to these group names via OIDC group claims. Which
// groups each OIDC client allows is managed by Pulumi too, via
// AllowedUserGroups (catalog/pulumi/lib/src/pocket-id.ts) at each app's own
// call site -- the generated SDK exposes that relationship as read-only, so
// AllowedUserGroups calls Pocket-Id's real (but SDK-unwrapped) endpoint
// directly instead.
export const adminGroup = new pocketid.usergroups.UserGroups(
	"admin",
	{ name: "admin", friendlyName: "Administrateur" },
	{ provider },
);

export const maisonGroup = new pocketid.usergroups.UserGroups(
	"maison",
	{ name: "maison", friendlyName: "Maison" },
	{ provider },
);

export const familleGroup = new pocketid.usergroups.UserGroups(
	"famille",
	{ name: "famille", friendlyName: "Famille" },
	{ provider },
);

// Named string outputs for cross-stack consumption (StackReference outputs
// only see plain exported values cleanly -- exporting the whole resource
// object works too, but callers would need to know its full shape just to
// pull `.id` back out).
export const adminGroupId = adminGroup.id;
export const maisonGroupId = maisonGroup.id;
export const familleGroupId = familleGroup.id;
