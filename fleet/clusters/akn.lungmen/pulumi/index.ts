// Resources are created by importing the modules; nothing is read from outside this stack (secrets go to Vault), so
// nothing is exported: no resource or token leaks into the stack outputs.
//
// Same split as kubernetes/src/:
// stack/system/<component>.ts   what the cluster itself needs (Vault access, Proxmox identity, cert-manager, backups...)
// stack/apps/<app>/             everything one application needs: oidc (Pocket-Id client), pangolin (public route),
//                               storage and secrets (Garage, Vault)
// stack/config.ts               every input of the program
import "./stack/system/cert-manager";
import "./stack/system/cloudnative-pg";
import "./stack/system/o11y";
import "./stack/system/pangolin";
import "./stack/system/proxmox";
import "./stack/system/tailscale";
import "./stack/system/vault";
import "./stack/system/velero";

import "./stack/apps/actual-budget/oidc";
import "./stack/apps/forgejo/oidc";
import "./stack/apps/homebox/oidc";
import "./stack/apps/homebox/storage";
import "./stack/apps/immich/oidc";
import "./stack/apps/immich/pangolin";
import "./stack/apps/jellyfin/oidc";
import "./stack/apps/jellyfin/pangolin";
import "./stack/apps/linkding/oidc";
import "./stack/apps/n8n/binary-storage";
import "./stack/apps/n8n/encryption-key";
import "./stack/apps/n8n/external-secrets";
import "./stack/apps/n8n/oidc";
import "./stack/apps/n8n/pangolin";
import "./stack/apps/n8n/workflow-storage";
import "./stack/apps/paperless-ngx/oidc";
