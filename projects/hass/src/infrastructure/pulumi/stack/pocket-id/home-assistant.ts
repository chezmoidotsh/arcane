import * as pocketid from "@axnic/pulumi-pocket-id";

import { maisonGroupId } from "./index";

// Home Assistant has no native OIDC support -- login goes through the
// christiaangoossens/hass-oidc-auth custom component, configured by hand in
// the HA UI (Settings -> Devices & Services -> OpenID Connect/SSO
// Authentication) with the discovery URL
// https://auth.chezmoi.sh/.well-known/openid-configuration plus the
// client_id/client_secret exported below. hass isn't a Kubernetes cluster
// and doesn't depend on Vault (which itself lives inside rhodes.akn), so --
// same reasoning as the Cloudflare DNS-01 token in ../home-assistant.ts --
// the secret is exposed as a Pulumi stack output instead of a
// vault.kv.SecretV2, retrieved with `mise run pulumi:oidc-client` and pasted
// into the integration setup by hand.
export const homeAssistantOidcClient = new pocketid.OidcClient(
	"home-assistant",
	{
		allowedUserGroupIds: [maisonGroupId],
		name: "Home Assistant",
		description: "Domotique et supervision de la maison",
		logoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/home-assistant-dark.svg",
		darkLogoUrl:
			"https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/home-assistant-light.svg",
		launchUrl: "https://hass.chezmoi.sh/",
		callbackUrls: ["https://hass.chezmoi.sh/auth/oidc/callback"],
		isPublic: false,
		pkceEnabled: true,
		logoutCallbackUrls: [],
		requiresPushedAuthorizationRequests: false,
		requiresReauthentication: false,
		skipConsent: false,
	},
);

const homeAssistantSecret = new pocketid.OidcClientSecret("home-assistant-secret", {
	clientId: homeAssistantOidcClient.id,
});

export const homeAssistantOidcClientId = homeAssistantOidcClient.id;
export const homeAssistantOidcClientSecret = homeAssistantSecret.secret;
