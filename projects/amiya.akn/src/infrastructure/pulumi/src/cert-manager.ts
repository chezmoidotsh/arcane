import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// -----------------------------------------------------------------------------
// Cloudflare DNS-01 token for cert-manager
// -----------------------------------------------------------------------------
// cert-manager needs a scoped Cloudflare API token to complete DNS-01 challenges
// when issuing/renewing certificates for amiya.akn.chezmoi.sh. cert-manager's
// Cloudflare ClusterIssuer (DNS-01 solver) reads the token from the Vault secret
// below through an ExternalSecret.
const certManagerToken = new Dns01TokenComponent("cert-manager", {
  owner: "amiya.akn",
  application: "cert-manager",
  accountId: config.cloudflare.accountId,
  zoneId: config.cloudflare.zoneId,
});
export const certManagerDns01Token = certManagerToken.tokenValue;

// Vault/OpenBao itself runs on this cluster, so it isn't reachable yet during
// bootstrap — cert-manager is one of the things that must come up before Vault
// can be exposed. Only the token above (a Cloudflare-side resource, independent
// of Vault) can be created at that point; pushing it into Vault waits until
// bootstrap mode is over.
if (!config.isBootstraping) {
  new vault.kv.SecretV2(
    "cert-manager-token",
    {
      mount: "shared",
      name: "third-parties/cloudflare/iam/amiya.akn/cert-manager-rw",
      dataJson: pulumi.jsonStringify({
        api_token: certManagerToken.tokenValue,
      }),
      customMetadata: {
        // Convention for every secret pushed to Vault in this stack:
        //   description/owner/application — human identification, shown in
        //                                    the Vault UI.
        //   created-by                    — repo-relative path to this file,
        //                                    for traceability.
        //   renewal-process/x-renewal-cmd  — what rotating this secret does,
        //                                    and the exact copy/paste command
        //                                    to trigger it (built from the
        //                                    credential's own URN).
        data: {
          description: "Cloudflare API Token for cert-manager",
          owner: "amiya.akn",
          application: "cert-manager",

          "created-by": "projects/amiya.akn/src/infrastructure/pulumi/src/cert-manager.ts",
          "renewal-process":
            "Rotate the token below; this secret's value is recomputed from " +
            "it and picks up the new one automatically on the next `pulumi up`.",
          "x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${certManagerToken.tokenUrn}'`,
        },
      },
    },
    { parent: certManagerToken },
  );
}
