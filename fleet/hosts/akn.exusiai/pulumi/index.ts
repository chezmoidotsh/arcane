// Resources are created by importing the modules; only the stack outputs are exported.
import "./stack/platform/oci-compartment";
import "./stack/platform/network";
import "./stack/platform/instance";
import "./stack/platform/b2-backups";
import "./stack/access/dns";
import "./stack/access/tailscale";
import "./stack/access/pocket-id";
import "./stack/nix-secrets";

export { backupsBucketName } from "./stack/platform/b2-backups";
export { publicIp } from "./stack/platform/instance";
