import * as pulumi from "@pulumi/pulumi";

// Every input of the program is read here, once. The other modules import what they need.
// The Proxmox VE and Cloudflare providers authenticate with PROXMOX_VE_USERNAME / PROXMOX_VE_PASSWORD and
// CLOUDFLARE_* (fnox, see ../../.fnox.toml): never a Pulumi config, the provider configuration is stored in the
// state and a refresh reuses that stored copy.
const config = new pulumi.Config();

// Account and zone of the Cloudflare DNS-01 token behind Proxmox VE's ACME plugin (stack/system/acme.ts).
export const cloudflareAccountId = config.requireSecret("cloudflare_account_id");
export const cloudflareZoneId = config.requireSecret("cloudflare_zone_id");

// One-time secret of the `pve-backup@pbs!pve-storage` token minted by core.pbs (stack/storage/storage.ts).
export const pveBackupTokenSecret = config.requireSecret("pveBackupTokenSecret");

// kubeconfig contexts the cluster bootstrap tokens are written to (stack/access/*-akn-bootstrap.ts).
export const rhodesAknContext = config.require("rhodesAknKubernetesContext");
export const lungmenAknContext = config.require("lungmenAknKubernetesContext");

// Local keyfile of the PBS datastore's client-side encryption key, only needed by the one bootstrap apply that
// creates the storage entry (stack/storage/storage.ts). Never a Pulumi config: it would end up in git.
export const pbsStoreEncryptionKeyPath = process.env.PVE_PBS_STORE_ENCRYPTION_KEY;
