import "./stack/pangolin";
import "./stack/pocket-id";

// Only what is read from outside is exported: the Traefik DNS-01 token (Ansible)
// and the `chezmoiSh` compartment (StackReference from rimbilliton.akn). Everything
// else in the stack stays internal instead of being exported as a stack output.
export { chezmoiSh, traefikDns01TokenValue } from "./stack/oci";
