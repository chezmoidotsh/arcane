import * as pangolin from "@pulumi/pangolin";
import * as pulumi from "@pulumi/pulumi";

import {
	pangolinOidcClient,
	pangolinOidcClientSecret,
} from "../pocket-id/pangolin";
import { chezmoiShOrg } from "./org";

// Lets chezmoi.sh org members log into the Pangolin dashboard via Pocket-Id
// SSO instead of local Pangolin accounts. Sign-in eligibility is already
// restricted Pocket-Id-side (../pocket-id/pangolin.ts's AllowedUserGroups)
// -- this side just has to trust whoever comes through.
export const chezmoiShIdp = new pangolin.Idp("chezmoi-sh-pocket-id", {
	name: "auth.chezmoi.sh (pocket-id)",
	authUrl: "https://auth.chezmoi.sh/authorize",
	tokenUrl: "https://auth.chezmoi.sh/api/oidc/token",
	clientId: pangolinOidcClient.id,
	clientSecret: pangolinOidcClientSecret.secret,
	identifierPath: "sub",
	scopes: "openid profile email",
	autoProvision: true,
});

// roleMapping is a JMESPath expression evaluated against the ID token on
// every login: "pangolin:role" is a custom claim carrying the target role
// name (e.g. Admin or Privileged, see ./role.ts), quoted because JMESPath
// unquoted identifiers can't contain ":". `||` falls back to the built-in
// "member" role whenever the claim is absent or empty, which is the case
// for every Pocket-Id user until that claim is explicitly set.
new pangolin.IdpOrg(
	"chezmoi-sh-pocket-id",
	{
		idpId: chezmoiShIdp.idpId,
		orgId: chezmoiShOrg.orgId,
		roleMapping: `"pangolin:role" || 'member'`,
		orgMapping: pulumi.interpolate`'${chezmoiShOrg.orgId}'`,
	},
	{ parent: chezmoiShIdp },
);
