import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for Home Assistant
// -----------------------------------------------------------------------------
// Home Assistant manages its own DNS records on chezmoi.sh and needs this token
// to do so. hass is not a Kubernetes cluster and doesn't depend on any cluster
// to run, so the token isn't pushed to Vault here — Vault itself runs inside
// amiya.akn and can't be a dependency of infrastructure that exists independently
// of it. It's exported as a Pulumi stack output instead and injected into Home
// Assistant's own secrets storage with `mise run pulumi:cloudflare-token` (see
// the top-level .mise.toml).
const homeAssistantToken = new Dns01TokenComponent(
	"hass-chezmoi-sh-home-assistant",
	{
		owner: "hass",
		application: "Home Assistant",
		accountId: config.cloudflare.accountId,
		zoneId: config.cloudflare.zoneId,
	},
);
export const homeAssistantDns01Token = homeAssistantToken.tokenValue;
