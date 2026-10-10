import "./stack/pangolin";
import "./stack/pocket-id";

// Only what is read from outside is exported: the Traefik DNS-01 token (NixOS flake)
// the `chezmoiSh` compartment id (StackReference from rimbilliton.akn)
// and the binding IP of the instance (NixOS flake). Everything
// else in the stack stays internal instead of being exported as a stack output.
import { chezmoiSh, instance } from "./stack/oci";

export { traefikDns01TokenValue } from "./stack/oci";
export const chezmoiShCompartmentId = chezmoiSh.id;
// Read by the NixOS flake (nixos/binding-ip): Docker publishes 80/443 on this address only.
export const bindingIp = instance.privateIp;

export { tailscaleAuthKey } from "./stack/tailscale";
