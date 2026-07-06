import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

import * as config from "../config";

// Lets cert-manager complete DNS-01 challenges for amiya.akn.chezmoi.sh certificates.
// The Vault secret below is parented directly to the token, so they share a
// single lifecycle without an artificial wrapper resource.
const certManagerToken = new Dns01TokenComponent("cert-manager", {
  owner: "amiya.akn",
  application: "cert-manager",
  accountId: config.cloudflare.accountId,
  zoneId: config.cloudflare.zoneId,
});
export const certManagerDns01Token = certManagerToken.tokenValue;

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
