// Resources are created by importing the modules; nothing is read from outside this stack (secrets go to Vault), so
// nothing is exported: no resource or token leaks into the stack outputs.
//
// Same split as kubernetes/src/:
// stack/system/<component>.ts   what the cluster itself needs (Vault access, Proxmox identity, cert-manager, backups...)
// stack/apps/<app>/             everything one application needs: oidc (Pocket-Id client), pangolin (public route),
//                               secrets (Vault)
// stack/config.ts               every input of the program
import "./stack/system/cert-manager";
import "./stack/system/cloudnative-pg";
import "./stack/system/pangolin";
import "./stack/system/proxmox";
import "./stack/system/vault";

import "./stack/apps/argocd/oidc";
import "./stack/apps/argocd/oidc-cli";
import "./stack/apps/mcp/grafana-token";
import "./stack/apps/mcp/oidc";
import "./stack/apps/mcp/pangolin";
import "./stack/apps/o11y/grafana";
import "./stack/apps/o11y/oidc";
import "./stack/apps/o11y/pangolin";
import "./stack/apps/pocket-id/pangolin";
import "./stack/apps/vault/oidc";
