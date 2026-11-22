// Resources are created by importing the modules; only the stack outputs are exported.
//
// Moved from the chezmoi-sh-infra project with `pulumi state move`: the logical names, the types and the parent
// chains must stay as they are, or the moved resources get replaced (new Proxmox VE tokens for the cluster
// bootstraps, a new Cloudflare token, a re-created SDN zone). Moving a file never changes a URN: only these three
// things do.
//
// stack/config.ts     every input of the program
// stack/access/       who may do what: the Omni identity and the cluster bootstrap identities (roles, users, tokens, ACLs)
// stack/network/      the SDN zone `pvenet` and its VNet `talosnet`, the `talos` firewall security group
// stack/storage/      the resource pools and the PBS storage entry
// stack/system/       the ACME account, the DNS-01 plugin and the Cloudflare token behind it
//
// The cluster bootstrap tokens reach their clusters as Kubernetes Secrets (stack/access/*-akn-bootstrap.ts); the
// exports below are the stack outputs, none is read by another project.
import "./stack/access/rhodes-akn-bootstrap";
import "./stack/access/lungmen-akn-bootstrap";
import "./stack/access/omni";
import "./stack/network/firewall";
import "./stack/network/sdn";
import "./stack/storage/pools";
import "./stack/storage/storage";
import "./stack/system/acme";

export * from "./stack/access/lungmen-akn-bootstrap";
export * from "./stack/access/omni";
export * from "./stack/access/rhodes-akn-bootstrap";
