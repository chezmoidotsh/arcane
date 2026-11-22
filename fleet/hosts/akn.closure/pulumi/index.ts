import * as pocketid from "@axnic/pulumi-pocket-id";
import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// Neither secret goes to Vault: Vault runs inside rhodes.akn and can't be a
// dependency of a host that must boot without any cluster. Both are exported
// as stack outputs and read by the `pulumi:*` tasks of ../.mise.toml.

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token: Home Assistant manages its own DNS records on chezmoi.sh
// -----------------------------------------------------------------------------
const dns01Token = new Dns01TokenComponent("hass-chezmoi-sh-home-assistant", {
  owner: "hass",
  application: "Home Assistant",
  accountId: config.requireSecret("cloudflare_account_id"),
  zoneId: config.requireSecret("cloudflare_zone_id"),
});

// -----------------------------------------------------------------------------
// Pocket-Id OIDC client: login goes through the hass-oidc-auth custom component,
// configured by hand in the HA UI with the client_id/client_secret below.
// -----------------------------------------------------------------------------
// Group membership (admin/maison/famille) is managed in chezmoi.sh.
const chezmoiSh = new pulumi.StackReference("chezmoi.sh", {
  name: "organization/chezmoi-sh-infra/chezmoi_sh.live",
});

const oidcClient = new pocketid.OidcClient("home-assistant", {
  clientId: "e044b00f-9596-4d92-b36a-bd1db8aa18b4",
  allowedUserGroupIds: [chezmoiSh.getOutput("maisonGroupId") as pulumi.Output<string>],
  name: "Home Assistant",
  description: "Domotique et supervision de la maison",
  logo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/home-assistant-dark.svg"),
  darkLogo: new pulumi.asset.RemoteAsset("https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/home-assistant-light.svg"),
  launchUrl: "https://hass.chezmoi.sh/",
  callbackUrls: ["https://hass.chezmoi.sh/auth/oidc/callback"],
  isPublic: false,
  pkceEnabled: true,
  logoutCallbackUrls: [],
  requiresPushedAuthorizationRequests: false,
  requiresReauthentication: false,
  skipConsent: false,
});
const oidcSecret = new pocketid.OidcClientSecret("home-assistant-secret", { clientId: oidcClient.id });

export const homeAssistantDns01Token = dns01Token.tokenValue;
export const homeAssistantOidcClientId = oidcClient.id;
export const homeAssistantOidcClientSecret = oidcSecret.secret;
