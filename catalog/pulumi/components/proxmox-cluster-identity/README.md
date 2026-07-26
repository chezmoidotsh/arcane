# `@chezmoi.sh/pulumi-proxmox-cluster-identity`

A self-contained Pulumi `ComponentResource` (`chezmoi:proxmox:ClusterIdentity`) that provisions a single Proxmox VE
service identity for a Kubernetes cluster integration: a custom `VirtualEnvironmentRole`, a `VirtualEnvironmentUser`, a
`UserToken` (always created with `privilegesSeparation` disabled, so the token carries exactly the user's own
permissions), and one `Acl` grant per path supplied.

It packages the per-identity pattern hand-rolled in `chezmoi.sh`'s
[`stack/proxmox/access.ts`](../../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/access.ts) for reuse
by cluster-owned Pulumi programs that provision their **own** Proxmox identities directly, against their own
`proxmox.Provider`, instead of consuming a token minted by chezmoi.sh's stack — see
[`rhodes.akn`'s `stack/proxmox.ts`](../../../../projects/rhodes.akn/src/infrastructure/pulumi/stack/proxmox.ts) for the
first consumer, and that stack's `rhodes-akn-bootstrap@pve` delegated credential (chezmoi.sh's
`stack/proxmox/access.ts`) for how a cluster's own program gets enough privilege on `pve-01` to do this without ever
touching `root@pam`.

## Usage

```ts
import * as proxmox from "@pulumi/proxmox";
import { ProxmoxClusterIdentityComponent } from "@chezmoi.sh/pulumi-proxmox-cluster-identity";

const provider = new proxmox.Provider("pve-01", {
  endpoint: "https://pve-01.pve.chezmoi.sh:8006/api2/json",
  // credential supplied via PROXMOX_VE_USERNAME/PROXMOX_VE_API_TOKEN env vars — never Pulumi config.
});

const identity = new ProxmoxClusterIdentityComponent("kubernetes-cloud-provider", {
  userId: "kubernetes-cloud-provider@pve",
  comment: "Kubernetes CCM+CSI — node/VM audit and volume lifecycle, scoped to /pool/talos",
  role: {
    roleId: "KubernetesCloudProvider",
    privileges: ["Sys.Audit", "VM.Audit", "Datastore.Allocate" /* … */],
  },
  aclPaths: ["/nodes/pve-01", "/pool/talos"],
  tokenName: "cloud-provider",
  tokenComment: "proxmox-cloud-controller-manager + proxmox-csi-plugin token",
  provider,
});

export const tokenId = identity.tokenId;
export const tokenSecret = identity.tokenSecret;
```

## Design notes

- **One identity per component instance.** Callers that need several distinct identities (e.g. one per concern, rather
  than merged) instantiate the component once per identity — it does not fan out internally.
- **`provider` is required, not implicit.** Unlike a stack that configures one ambient Proxmox provider for its whole
  program, this component is meant to be reusable across callers with different Proxmox targets — the caller always
  passes its own `proxmox.Provider` explicitly.
- **ACL path naming.** Each `Acl` child resource is named `<name>-acl-<path-with-slashes-as-dashes>` (e.g. `/pool/talos`
  → `<name>-acl-pool-talos`), so multiple grants on the same identity get distinct, stable resource names instead of
  colliding or relying on positional indices.
