import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import { SopsFile } from "@chezmoi.sh/pulumi-sops-file";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for the omni LXC
// -----------------------------------------------------------------------------
// Caddy on the omni LXC (omni.chezmoi.sh) needs this token to complete DNS-01
// challenges for its own TLS certificate. This stack runs upstream of any
// Kubernetes cluster, so the token isn't pushed to Vault here — Vault itself
// runs inside rhodes.akn and can't be a dependency of something that has to
// exist before it. It is written into nix/secrets/caddy.sops.json (a file owned by
// this stack, read at LXC build time) at every `pulumi up`; it is also kept as a
// stack output.
//
// Moved from the chezmoi-sh-infra project with `pulumi state move`: the logical
// name, the type and the parent chain (stack root) must stay as they are, or
// the moved resources get replaced (and the token rotated).
const caddyDns01Token = new Dns01TokenComponent("caddy-dns01-omni", {
  owner: "chezmoi.sh",
  application: "caddy-dns01/omni",
  accountId: config.requireSecret("cloudflare_account_id"),
  zoneId: config.requireSecret("cloudflare_zone_id"),
});

// The creation rules live in ../.sops.yaml (recipients: admin key + the LXC build key).
new SopsFile("caddy-dns01-omni-sops", {
  file: "../nix/secrets/caddy.sops.json",
  config: "../.sops.yaml",
  content: pulumi.output({ CLOUDFLARE_API_TOKEN: caddyDns01Token.tokenValue }),
});
