// Nothing is read from outside this stack (secrets go to Vault): import for side
// effects only, so no resource or token leaks into the stack outputs.
import "./stack/cert-manager";
import "./stack/cloudnative-pg";
import "./stack/grafana";
import "./stack/pangolin";
import "./stack/pocket-id";
import "./stack/proxmox";
import "./stack/vault";
