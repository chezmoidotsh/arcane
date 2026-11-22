// Moved from the chezmoi-sh-infra project with `pulumi state move`: the
// logical names, the types and the parent chains must stay as they are, or
// the moved resources get replaced (new Proxmox VE tokens for the cluster
// bootstraps, a new Cloudflare token, a re-created SDN zone).
//
// Nothing is exported: no task or other project reads an output of this
// stack. The cluster bootstrap tokens reach their clusters as Kubernetes
// Secrets (./access/*-akn-bootstrap.ts).
import "./access";
import "./acme";
import "./firewall";
import "./pools";
import "./sdn";
import "./storage";
