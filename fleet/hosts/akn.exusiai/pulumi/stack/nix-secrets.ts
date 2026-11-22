import { SopsFile } from "@chezmoi.sh/pulumi-sops-file";
import * as pulumi from "@pulumi/pulumi";

import { minecraftOidcClientId, minecraftOidcClientSecret } from "./access/pocket-id";
import { tailscaleAuthKey } from "./access/tailscale";
import { backupsKeyId, backupsKeySecret, resticRepository } from "./platform/b2-backups";

// The contract with nix/: everything the host reads from this stack, and nothing else.
// Each key matches a `sops.secrets.<key>` of nix/ (configuration.nix, modules/backup.nix, modules/pelican.nix).
// Rewritten at every `pulumi up` (same pattern as akn.ptilopsis). The values nothing generates
// (restic password, Wings node) stay in nix/secrets/manual.sops.yaml.
// The creation rules, recipients included, live in nix/.sops.yaml.
new SopsFile("exusiai-sops", {
	file: "../nix/secrets/exusiai.sops.json",
	config: "../nix/.sops.yaml",
	content: pulumi.output({
		tailscale_authkey: tailscaleAuthKey,
		restic_repository: resticRepository,
		restic_b2_env: pulumi.interpolate`AWS_ACCESS_KEY_ID=${backupsKeyId}\nAWS_SECRET_ACCESS_KEY=${backupsKeySecret}\n`,
		oauth_pocketid_client_id: minecraftOidcClientId,
		oauth_pocketid_client_secret: minecraftOidcClientSecret,
	}),
});
