import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for cert-manager
// -----------------------------------------------------------------------------
// cert-manager needs a scoped Cloudflare API token to complete DNS-01 challenges
// when issuing/renewing certificates for rhodes.akn.chezmoi.sh. Vault/OpenBao
// itself runs on this cluster, so — unlike other clusters — cert-manager can't
// source this from Vault via ESO: it would never become reachable before Vault
// is (same self-hosting bootstrap reasoning as `cloudnative-pg.ts`'s
// `cnpg-backup-credentials`). The token is written directly as a Kubernetes
// Secret instead, unconditionally (not gated by `recovery`), so cert-manager is
// functional as soon as it's deployed.
const certManagerToken = new Dns01TokenComponent("cert-manager", {
	owner: "rhodes.akn",
	application: "cert-manager",
	accountId: config.requireSecret("cloudflare_account_id"),
	zoneId: config.requireSecret("cloudflare_zone_id"),
});
export const certManagerDns01Token = certManagerToken.tokenValue;

new k8s.core.v1.Secret(
	"letsencrypt-issuer-credentials",
	{
		metadata: {
			name: "letsencrypt-issuer-credentials",
			namespace: "cert-manager-system",
		},
		type: "Opaque",
		stringData: {
			"api-token": certManagerToken.tokenValue,
		},
	},
	{ parent: certManagerToken },
);
