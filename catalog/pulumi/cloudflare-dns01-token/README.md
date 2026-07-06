# `@chezmoi.sh/pulumi-cloudflare-dns01-token`

A Cloudflare **Account (Owned) API token** (`cloudflare.AccountToken`) scoped to
**Zone Read + Zone DNS Edit** on a single zone — the permission shape every ACME
DNS-01 solver needs (cert-manager, Caddy's `cloudflare-dns` plugin, Home Assistant's
built-in ACME integration, ...).

## Why `AccountToken`, not `ApiToken`

This account issues **Account (Owned) API Tokens** (`/accounts/{account_id}/tokens`), a
distinct Cloudflare resource from classic **User API Tokens** (`/user/tokens`).
`cloudflare.ApiToken` targets the user-scoped endpoint and cannot see these tokens at
all; `cloudflare.AccountToken` (added in `@pulumi/cloudflare` v6) is the resource that
actually matches them.

## Usage

```typescript
import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";

new Dns01TokenComponent("caddy-dns01-observability", {
	owner: "chezmoi.sh",
	application: "caddy-dns01/observability",
	accountId: cloudflareAccountId,
	zoneId: chezmoiShZoneId,
});
```

`owner` and `application` populate the token's Cloudflare-side label:
`(<owner>) - <application>`.

## This component only creates the token

It has no opinion on where the token's value ends up — that's the calling stack's
decision, not this component's. Some consumers (e.g. cert-manager) expect the token in
Vault; others (e.g. chezmoi.sh's Caddy DNS-01 tokens) only ever consume it as a plain
Kubernetes `Secret` or a stack output. Where Vault is needed, write it directly with
`@pulumi/vault`'s `vault.kv.SecretV2` in the calling stack, parented to the component
instance itself so the secret and the token it stores share one lifecycle:

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";

const token = new Dns01TokenComponent("cert-manager", {
	owner: "amiya.akn",
	application: "cert-manager",
	accountId: cloudflareAccountId,
	zoneId: chezmoiShZoneId,
});

new vault.kv.SecretV2(
	"cert-manager-token",
	{
		mount: "shared",
		name: "third-parties/cloudflare/iam/amiya.akn/cert-manager-rw",
		dataJson: pulumi.jsonStringify({ api_token: token.tokenValue }),
		customMetadata: {
			data: {
				description: "Cloudflare API Token for cert-manager",
				owner: "amiya.akn",
				application: "cert-manager",
			},
		},
	},
	{ parent: token },
);
```

Prefer this over inventing a separate `pulumi.ComponentResource` "scope" resource just
to give the token and its secret a shared parent — `Dns01TokenComponent` already is one.

## Import

```sh
pulumi import 'cloudflare:index/accountToken:AccountToken' <pulumi-name> '<account_id>/<token_id>'
```

Note the two-part ID (`account_id/token_id`), not just the token ID alone.
