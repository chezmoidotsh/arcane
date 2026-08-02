import { oidcApp } from "@chezmoi.sh/pulumi-lib";

import { familleGroupId, maisonGroupId } from "./index";

// The Pocket-Id side of Pangolin's SSO login only (Pangolin dashboard IDP
// id 1, "https://pangolin.chezmoi.sh/auth/idp/1/oidc/callback"). Imported
// from Pocket-Id (auth.chezmoi.sh) rather than created here -- this client
// already exists and is already in use by the live Pangolin deployment.
//
// Pangolin's own side of this integration (the Idp resource in Pangolin
// itself, via the `pangolin` provider) isn't managed here: it needs
// `pangolin_enable_integration_api` turned on (currently false in the
// Ansible role defaults) and a Pangolin API key that doesn't exist yet --
// deferred until that's set up.
export const pangolinOidcClient = oidcApp("pangolin", {
	name: "Pangolin",
	description: "Tunnel / reverse-proxy d'accès public",
	application: "pangolin",
	launchURL: "https://pangolin.chezmoi.sh/",
	callbackURLs: ["https://pangolin.chezmoi.sh/auth/idp/1/oidc/callback"],
	groupIds: [maisonGroupId, familleGroupId],
}).client;
