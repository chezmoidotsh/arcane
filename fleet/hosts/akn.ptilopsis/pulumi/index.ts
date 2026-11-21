import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import { SopsFile } from "@chezmoi.sh/pulumi-sops-file";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for the observability stack
// -----------------------------------------------------------------------------
// Caddy on ptilopsis (data.o11y.chezmoi.sh) needs this token to complete DNS-01
// challenges for its own TLS certificate. It is written into
// nix/secrets/cloudflare.sops.json (a file owned by this stack, read by sops-nix)
// at every `pulumi up`; it is also kept as a stack output.

const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-observability", {
  owner: "chezmoi.sh",
  application: "caddy-dns01/observability",
  accountId: config.requireSecret("cloudflare_account_id"),
  zoneId: config.requireSecret("cloudflare_zone_id"),
});

// The creation rules live in nix/.sops.yaml (recipients: admin key + the Mac's host key).
new SopsFile("caddy-dns01-observability-sops", {
  file: "../nix/secrets/cloudflare.sops.json",
  config: "../nix/.sops.yaml",
  content: pulumi.output({ "cloudflare-api-token": caddyDns01Token.tokenValue }),
});
