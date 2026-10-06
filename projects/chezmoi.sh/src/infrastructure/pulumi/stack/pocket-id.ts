import * as pocketid from "@axnic/pulumi-pocket-id";

// Groups shared across every cluster: Vault, ArgoCD and every app below bind
// their access policies to these group names via OIDC group claims. Which
// groups each OIDC client allows is set on the client itself
// (`allowedUserGroupIds`) at each app's own call site.
export const adminGroup = new pocketid.UserGroup("admin", {
	name: "admin",
	friendlyName: "Administrateur",
});

export const maisonGroup = new pocketid.UserGroup("maison", {
	name: "maison",
	friendlyName: "Maison",
});

export const familleGroup = new pocketid.UserGroup("famille", {
	name: "famille",
	friendlyName: "Famille",
});

// Named string outputs for cross-stack consumption (StackReference outputs
// only see plain exported values cleanly -- exporting the whole resource
// object works too, but callers would need to know its full shape just to
// pull `.id` back out).
export const adminGroupId = adminGroup.id;
export const maisonGroupId = maisonGroup.id;
export const familleGroupId = familleGroup.id;
