// Resources are created by importing the modules; only what is read from outside is exported.
import "./stack/platform/oci-compartment";
import "./stack/platform/network";
import "./stack/access/dns";
import "./stack/access/pocket-id";

import { withPangolin } from "./stack/config";
import { instance } from "./stack/platform/instance";

// Needs the running Pangolin instance (see stack/config.ts): skipped with `pulumi config set pangolin false`.
if (withPangolin) {
	require("./stack/pangolin/idp");
	require("./stack/pangolin/role");
}

// Read by the NixOS flake (mise task nixos:binding-ip): Docker publishes 80/443 on this address only.
export const bindingIp = instance.privateIp;
// Read by rhodes.akn and lungmen.akn (StackReference, via the pulumi-lib edgeAccess rules): the
// public address Pangolin calls the identity provider from, allowed past the OCI ASN deny rule.
export const egressIp = instance.publicIp;

// Traefik DNS-01 token and Tailscale first-boot key: copied by hand into the host's SOPS secrets.
export { tailscaleAuthKey } from "./stack/access/tailscale";
export { traefikDns01TokenValue } from "./stack/access/traefik-dns01-token";
