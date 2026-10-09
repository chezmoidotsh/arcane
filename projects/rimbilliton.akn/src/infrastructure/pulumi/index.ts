// Only what is read from outside is exported (BOOTSTRAP.md, SOPS secrets): the
// instance IP and the credentials fed into the NixOS secrets file. Everything else
// stays internal instead of being exported as a stack output.
export { backupsBucketName, backupsKeyId, backupsKeySecret } from "./stack/backblaze";
export { publicIp } from "./stack/oci";
export { minecraftOidcClientSecret } from "./stack/pocket-id";
export { tailscaleAuthKey } from "./stack/tailscale";

// Imported for their side effects only (resources are created on load).
import "./stack/dns";
