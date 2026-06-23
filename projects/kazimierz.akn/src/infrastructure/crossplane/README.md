# Crossplane Infrastructure — kazimierz.akn

This directory manages the **OCI Free Tier** (Oracle Cloud Infrastructure) cloud
infrastructure for the `kazimierz.akn` project via GitOps (ArgoCD + Crossplane).

`kazimierz.akn` is the homelab's public gateway VPS: an ARM instance running
Pangolin + Gerbil + Traefik + CrowdSec, reachable from the internet to route traffic
to internal services. The project is being migrated from Hetzner Cloud (Ubuntu 24.04)
to OCI Free Tier ARM (NixOS). During the transition, the legacy Hetzner Terraform
workspace (`pangolin.terraform.yaml`) coexists with the OCI resources until final cutover.

## Table of Contents

* [File overview](#file-overview)
* [Architecture](#architecture)
  * [Resource inventory](#resource-inventory)
  * [Dependency graph](#dependency-graph)
  * [Design decisions](#design-decisions)
* [Prerequisites](#prerequisites)
  * [Crossplane providers](#crossplane-providers)
  * [IAM policies](#iam-policies)
  * [OpenBao secret](#openbao-secret)
* [Provider bootstrap](#provider-bootstrap)
  * [1. Create the IAM user and group](#1-create-the-iam-user-and-group)
  * [2. Add IAM policies](#2-add-iam-policies)
  * [3. Generate an API key](#3-generate-an-api-key)
  * [4. Populate the OpenBao secret](#4-populate-the-openbao-secret)
  * [5. Verify the ExternalSecret sync](#5-verify-the-externalsecret-sync)
  * [6. Verify the ProviderConfig health](#6-verify-the-providerconfig-health)
* [Operational procedures](#operational-procedures)
  * [Deploy a new NixOS image](#deploy-a-new-nixos-image)
  * [Recreate the instance](#recreate-the-instance)
  * [Retrieve the subnet IPv6 CIDR (post-creation)](#retrieve-the-subnet-ipv6-cidr-post-creation)
  * [Wire the NSG OCID into claim.yaml](#wire-the-nsg-ocid-into-claimyaml)
* [File reference](#file-reference)
* [Migration / Transitional state](#migration--transitional-state)

***

## File overview

```
oci.identity.yaml        OCI Compartment (imported/observed — source of compartmentIdRef)
oci.providerconfig.yaml  ExternalSecret + ProviderConfig (OCI credentials via OpenBao)
oci.network.yaml         VCN, IGW, RouteTable, Subnet (dual-stack IPv4/IPv6)
oci.security-group.yaml  NSG + 14 security rules (ingress/egress dual-stack)
oci.volume.yaml          Persistent block volume for Pangolin/Gerbil/Traefik state
oci.bucket.yaml          Object Storage bucket for NixOS images (2-slot model)
pangolin.terraform.yaml  [LEGACY] Hetzner Terraform workspace — kept until cutover
```

***

## Architecture

### Resource inventory

| File                      | Crossplane resource                                | OCI object                                   |
| ------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `oci.identity.yaml`       | `identity.oci.m.upbound.io/v1alpha1 Compartment`   | Compartment `kazimierz.akn`                  |
| `oci.network.yaml`        | `networking…/Vcn`                                  | VCN `172.16.0.0/26` + Oracle GUA /56 (IPv6)  |
| `oci.network.yaml`        | `networking…/InternetGateway`                      | Dual-stack internet gateway                  |
| `oci.network.yaml`        | `networking…/RouteTable`                           | Default route table (default → IGW)          |
| `oci.network.yaml`        | `networking…/Subnet`                               | Subnet `172.16.0.0/28`                       |
| `oci.security-group.yaml` | `networking…/NetworkSecurityGroup`                 | NSG attached to instance VNIC                |
| `oci.security-group.yaml` | `networking…/NetworkSecurityGroupSecurityRule` ×14 | TCP/UDP ingress + egress rules               |
| `oci.volume.yaml`         | `blockstorage.oci.m.upbound.io/v1alpha1 Volume`    | 50 GiB block volume (`jbln:EU-PARIS-1-AD-1`) |
| `oci.bucket.yaml`         | `objectstorage.oci.m.upbound.io/v1alpha1 Bucket`   | Bucket `sh-chezmoi-akn-kazimierz-nixos`      |

### Dependency graph

```
ExternalSecret (oci-credentials)
    └─> ProviderConfig "default" (kazimierz-akn ns)
            └─> Compartment kazimierz-akn [Observe]
                    ├─> Vcn kazimierz-akn-vcn
                    │       ├─> InternetGateway kazimierz-akn-igw
                    │       ├─> RouteTable kazimierz-akn-rt ──────> IGW
                    │       ├─> Subnet kazimierz-akn-subnet ──────> RouteTable
                    │       └─> NetworkSecurityGroup kazimierz-akn-nsg
                    │               └─> 14× NetworkSecurityGroupSecurityRule
                    ├─> Volume kazimierz-akn-pangolin-data (50 GiB)
                    └─> Bucket sh-chezmoi-akn-kazimierz-nixos
```

### Design decisions

**NSG over SecurityList**

Network Security Groups are attached to the instance VNIC rather than the subnet. This
decouples the network topology (subnet, VCN) from application-level security rules:
recreating the instance, changing subnets, or refactoring the network does not require
rewriting firewall rules. NSG rules are always stateful by design (OCI does not allow
stateless rules in NSGs, unlike SecurityLists). The subnet uses the VCN's default
SecurityList, which is left empty and unmanaged by convention.

**Immutable NixOS image + separate persistent volume**

The OS disk is disposable: every update produces a new raw compressed image built by Nix.
All mutable state — Pangolin database, Traefik config, Gerbil keys, TLS certificates —
lives on a block volume that is decoupled from the instance lifecycle. Updating the
instance means detaching the volume, recreating the instance with the new image, then
reattaching the volume.

The volume is attached in paravirtualized mode (required for ARM Ampere) and appears as
`/dev/oracleoci/oraclevdb`. NixOS mounts it by filesystem label `pangolin-data` for a
stable mount identity that is independent of device enumeration order.

**2-slot image model (50 GiB free-tier constraint)**

OCI Object Storage free tier is capped at 50 GiB. At any point, at most two images
coexist in the bucket:

* **prod** (`managementPolicies: [Observe]`) — the image currently in production. Crossplane
  never deletes it, even if the ManagedResource is removed from git.
* **next** (`managementPolicies: [Observe, Delete]`) — the candidate image under validation.
  Crossplane deletes the OCI object when its ManagedResource is removed from git.

Promoting `next` to `prod` first frees the old prod slot (OCI object deletion), then
switches the `next` MR to `[Observe]`.

***

## Prerequisites

### Crossplane providers

The following providers must be installed in `projects/chezmoi.sh` before applying
any resource from this directory:

| Provider                     | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `provider-family-oci`        | Base OCI provider family (required by all others)            |
| `provider-oci-identity`      | Compartment import                                           |
| `provider-oci-networking`    | VCN, Subnet, RouteTable, IGW, NSG                            |
| `provider-oci-blockstorage`  | Persistent block volume                                      |
| `provider-oci-objectstorage` | Bucket and objects (NixOS images)                            |
| `provider-oci-compute`       | Instance (required for VolumeAttachment via `instanceIdRef`) |

### IAM policies

The `crossplane-rw` IAM group must have the following policies in the `chezmoi.sh`
compartment (OCID: `ocid1.compartment.oc1..aaaaaaaajyh7a5rbs3gcnvmxffcwewtuftrakz5ndd6ojwxcjyjecuvnafaq`)
before Crossplane resources can reconcile. Missing policies surface as
`404-NotAuthorizedOrNotFound` errors or `409-BucketAlreadyExists` observe loops.

```
Allow group 'crossplane-rw' to manage compartments in compartment chezmoi.sh
Allow group 'crossplane-rw' to manage instance-family in compartment chezmoi.sh
Allow group 'crossplane-rw' to manage object-family in compartment chezmoi.sh
Allow group 'crossplane-rw' to manage virtual-network-family in compartment chezmoi.sh
Allow group 'crossplane-rw' to manage volume-family in compartment chezmoi.sh
```

`identity-family` covers most identity resources (users, groups, policies, tag namespaces,
…). The explicit `manage compartments` is added because Crossplane may need to create or
import sub-compartments inside `chezmoi.sh` (e.g. `kazimierz.akn`), and in some tenancy
configurations OCI requires the compartment verb to be granted independently of the broader
identity aggregate.

### OpenBao secret

The secret at `shared/third-parties/oci/iam/chezmoi.sh/crossplane-rw` in OpenBao
(`vault.chezmoi.sh`) must exist before the ExternalSecret can sync. Required fields:

```
tenancy_ocid  ocid1.tenancy.oc1..xxx
user_ocid     ocid1.user.oc1..xxx
fingerprint   xx:xx:xx:...
private_key   -----BEGIN RSA PRIVATE KEY-----\n...
region        eu-paris-1
```

***

## Provider bootstrap

This section covers the full procedure to initialize OCI credentials from scratch. If
the IAM user and API key already exist, skip directly to
[Populate the OpenBao secret](#4-populate-the-openbao-secret).

### 1. Create the IAM user and group

```bash
# Create the group
oci iam group create --name crossplane-rw \
  --description "Crossplane read-write access"

# Create the user
oci iam user create --name crossplane-rw \
  --description "Crossplane service account"

# Retrieve OCIDs
GROUP_OCID=$(oci iam group list \
  --query "data[?name=='crossplane-rw'].id | [0]" --raw-output)
USER_OCID=$(oci iam user list \
  --query "data[?name=='crossplane-rw'].id | [0]" --raw-output)

# Add the user to the group
oci iam group add-user --group-id "$GROUP_OCID" --user-id "$USER_OCID"
```

### 2. Add IAM policies

Create a Policy in the `chezmoi.sh` compartment (not the root tenancy) with the
statements from the [IAM policies](#iam-policies) section above:

```bash
COMPARTMENT_OCID="ocid1.compartment.oc1..aaaaaaaajyh7a5rbs3gcnvmxffcwewtuftrakz5ndd6ojwxcjyjecuvnafaq"

oci iam policy create \
  --compartment-id "$COMPARTMENT_OCID" \
  --name crossplane-rw-policy \
  --description "Crossplane managed resources in chezmoi.sh compartment" \
  --statements '[
    "Allow group crossplane-rw to manage compartments in compartment chezmoi.sh",
    "Allow group crossplane-rw to manage instance-family in compartment chezmoi.sh",
    "Allow group crossplane-rw to manage object-family in compartment chezmoi.sh",
    "Allow group crossplane-rw to manage virtual-network-family in compartment chezmoi.sh",
    "Allow group crossplane-rw to manage volume-family in compartment chezmoi.sh"
  ]'
```

### 3. Generate an API key

```bash
# Generate the RSA key pair
mkdir -p ~/.oci
openssl genrsa -out ~/.oci/crossplane-rw.pem 2048
chmod 600 ~/.oci/crossplane-rw.pem
openssl rsa -pubout -in ~/.oci/crossplane-rw.pem -out ~/.oci/crossplane-rw-public.pem

# Upload the public key to the OCI user
oci iam user api-key upload \
  --user-id "$USER_OCID" \
  --key-file ~/.oci/crossplane-rw-public.pem

# Retrieve the fingerprint
FINGERPRINT=$(oci iam user api-key list \
  --user-id "$USER_OCID" \
  --query "data[0].fingerprint" --raw-output)

# Retrieve the tenancy OCID
TENANCY_OCID=$(oci iam compartment list --include-root \
  --query "data[?\"compartment-id\"==null].id | [0]" --raw-output)
```

### 4. Populate the OpenBao secret

```bash
# Ensure you are logged in (mise run bao:login)
bao kv put shared/third-parties/oci/iam/chezmoi.sh/crossplane-rw \
  tenancy_ocid="$TENANCY_OCID" \
  user_ocid="$USER_OCID" \
  fingerprint="$FINGERPRINT" \
  private_key="$(cat ~/.oci/crossplane-rw.pem)" \
  region="eu-paris-1"
```

### 5. Verify the ExternalSecret sync

```bash
kubectl get externalsecret oci-credentials -n kazimierz-akn
# STATUS must be "SecretSynced"

kubectl get secret oci-credentials -n kazimierz-akn \
  -o jsonpath='{.data.credentials}' | base64 -d | jq .
# Verify tenancy_ocid, user_ocid, fingerprint, region, private_key are all present
```

### 6. Verify the ProviderConfig health

```bash
kubectl get providerconfig default -n kazimierz-akn
# READY must be "True"

# Check that ManagedResources move to Synced/Ready
kubectl get managed -n kazimierz-akn
```

***

## Operational procedures

### Deploy a new NixOS image

**1. Build the image**

```bash
# From the kazimierz.akn flake root
nix build .#packages.aarch64-linux.oci-image
```

**2. Push to the bucket**

```bash
DATE=$(date +%Y%m%d)
oci os object put \
  --namespace ax25b8ybxdyk \
  --bucket-name sh-chezmoi-akn-kazimierz-nixos \
  --name "nixos-kazimierz-${DATE}.raw.gz" \
  --file result/nixos-*.raw.gz
```

**3. Import as an OCI Custom Image**

The import must use `CUSTOM` launch mode and `UEFI_64` firmware (required for NixOS on
ARM). This cannot be done through the console for raw images; use the OCI CLI:

```bash
oci compute image import from-object \
  --compartment-id "ocid1.compartment.oc1..aaaaaaaajyh7a5rbs3gcnvmxffcwewtuftrakz5ndd6ojwxcjyjecuvnafaq" \
  --namespace ax25b8ybxdyk \
  --bucket-name sh-chezmoi-akn-kazimierz-nixos \
  --name "nixos-kazimierz-${DATE}.raw.gz" \
  --display-name "nixos-kazimierz-${DATE}" \
  --launch-mode CUSTOM \
  --source-image-type QCOW2
```

**4. Declare the image in Crossplane (next slot)**

Create `oci.image.${DATE}.yaml` following the template in `oci.bucket.yaml`, with
`managementPolicies: [Observe, Delete]`. Add the file to `kustomization.yaml` and
sync ArgoCD.

**5. Validate then promote (next → prod)**

Once the instance is validated with the new image:

1. Delete the old `oci.image.<old-date>.yaml` from git — Crossplane deletes the old OCI
   object and frees the space.
2. In `oci.image.${DATE}.yaml`, switch `managementPolicies` to `[Observe]` — the image
   becomes immutable prod.
3. Update `spec.instance.imageId` in `claim.yaml` with the new image OCID.
4. Commit and sync.

### Recreate the instance

The persistent volume survives instance deletion. The procedure is:

```bash
# 1. Detach the volume (delete the VolumeAttachment if it exists)
kubectl delete volumeattachment kazimierz-akn-pangolin-data-attachment -n kazimierz-akn

# 2. Recreate the instance via the Claim (update imageId or delete/recreate).
#    The OCI volume already exists — only the attachment is removed.

# 3. Once the new instance is READY, reapply the VolumeAttachment
kubectl apply -f <path-to-volumeattachment.yaml>
```

Do not delete the `Volume` ManagedResource without first manually protecting or backing
up the OCI block volume — the v1alpha1 CRD does not expose `deletionPolicy`.

### Retrieve the subnet IPv6 CIDR (post-creation)

OCI dynamically assigns an Oracle GUA /56 block to the VCN. The subnet IPv6 CIDR can
only be set after the VCN is provisioned:

```bash
# 1. Retrieve the /56 assigned to the VCN
kubectl get vcn kazimierz-akn-vcn -n kazimierz-akn \
  -o jsonpath='{.status.atProvider.ipv6CidrBlocks[0]}'

# 2. The first /64 of that /56 is the default subnet CIDR.
#    Example: if the VCN gets 2603:c020:4001:ab00::/56,
#    the subnet CIDR is 2603:c020:4001:ab00::/64.

# 3. Add ipv6CidrBlock to the Subnet in oci.network.yaml
# 4. Re-render dist: dist:render
# 5. Sync ArgoCD
```

### Wire the NSG OCID into claim.yaml

The NSG OCID is unknown before first provisioning. After the NSG becomes READY:

```bash
kubectl get networksecuritygroup kazimierz-akn-nsg -n kazimierz-akn \
  -o jsonpath='{.status.atProvider.id}'
```

Copy this OCID into `claim.yaml` under `spec.instance.nsgIds`. Without this, the
instance is not attached to any NSG and the security rules do not apply.

***

## File reference

### `oci.identity.yaml`

Imports the existing OCI compartment `kazimierz.akn` with `managementPolicies: [Observe]`.
Crossplane does not create or delete this compartment — it only reads its OCI state and
exposes it via `status.atProvider`, making the resource referenceable as
`compartmentIdRef: name: kazimierz-akn` by every other ManagedResource. The parent is
the tenancy root
(`ocid1.tenancy.oc1..aaaaaaaafeeoyrhgtgjvfruptzctounvrltlygstnkvpdvyr5b6ulos5jiua`).

### `oci.providerconfig.yaml`

Two resources:

* An `ExternalSecret` that syncs OCI credentials from OpenBao
  (`shared/third-parties/oci/iam/chezmoi.sh/crossplane-rw`) into the Kubernetes Secret
  `oci-credentials` in the `kazimierz-akn` namespace. Refresh interval: 720h (30 days).
* A `ProviderConfig` (`oci.m.upbound.io/v1beta1`) named `default` in the `kazimierz-akn`
  namespace, consuming that Secret. The `oci.m.upbound.io` provider family uses
  **namespaced** ProviderConfigs (unlike the legacy `oci.upbound.io` family), which is
  why the secret must be synced into the application namespace rather than a central one.

### `oci.network.yaml`

Four interdependent network resources:

* **Vcn** `kazimierz-akn-vcn`: `172.16.0.0/26` IPv4, Oracle GUA /56 IPv6. DNS label:
  `kazimierzaknvcn`.
* **InternetGateway** `kazimierz-akn-igw`: dual-stack, sole egress point.
* **RouteTable** `kazimierz-akn-rt`: default routes `0.0.0.0/0` and `::/0` to the IGW.
* **Subnet** `kazimierz-akn-subnet`: `172.16.0.0/28`, bound to the RouteTable. No custom
  SecurityList — the VCN default SL is left empty by convention; all traffic control
  goes through the NSG.

### `oci.security-group.yaml`

One `NetworkSecurityGroup` (`kazimierz-akn-nsg`) and 14
`NetworkSecurityGroupSecurityRule` resources (dual-stack IPv4 + IPv6, all stateful):

| Direction | Protocol | Port(s) | Source/Destination | Purpose                       |
| --------- | -------- | ------- | ------------------ | ----------------------------- |
| Ingress   | TCP      | 22      | 0.0.0.0/0, ::/0    | SSH (public key only)         |
| Ingress   | TCP      | 80      | 0.0.0.0/0, ::/0    | HTTP → HTTPS redirect         |
| Ingress   | TCP      | 443     | 0.0.0.0/0, ::/0    | HTTPS (Traefik)               |
| Ingress   | UDP      | 51820   | 0.0.0.0/0, ::/0    | WireGuard site tunnels (Newt) |
| Ingress   | UDP      | 21820   | 0.0.0.0/0, ::/0    | WireGuard client tunnels      |
| Egress    | TCP      | all     | 0.0.0.0/0, ::/0    | All outbound TCP              |
| Egress    | UDP      | all     | 0.0.0.0/0, ::/0    | All outbound UDP              |

### `oci.volume.yaml`

50 GiB block volume in availability domain `jbln:EU-PARIS-1-AD-1`, display name
`kazimierz-pangolin-data`. Must be in the same AD as the instance.

The v1alpha1 `blockstorage` CRD does not expose a `deletionPolicy` field. Never delete
this ManagedResource without first manually protecting or backing up the OCI block volume.

### `oci.bucket.yaml`

Private Object Storage bucket `sh-chezmoi-akn-kazimierz-nixos` in namespace
`ax25b8ybxdyk` (`NoPublicAccess`, Standard tier). Holds NixOS images under the 2-slot
model described in [Design decisions](#design-decisions). Individual image objects
(dated files) are declared in separate `oci.image.<YYYYMMDD>.yaml` files that are
added and removed as part of the image deployment workflow; none are present in this
directory when no image is in-flight.

### `pangolin.terraform.yaml`

Terraform workspace (`tf.upbound.io/v1beta1`) managing the current Hetzner Cloud
infrastructure. See [Migration / Transitional state](#migration--transitional-state).

***

## Migration / Transitional state

`pangolin.terraform.yaml` keeps the Hetzner Cloud infrastructure running in production
during the migration to OCI. It manages:

* The Hetzner firewall (`kazimierz-pangolin`) with the same port rules as the OCI NSG.
* A `cx23` server in Nuremberg (`nbg1`) running Ubuntu 24.04.
* Cloudflare A records for `kazimierz.akn` and `*.kazimierz.akn` pointing to the
  Hetzner IPv4 address (AAAA records are commented out — IPv6 is not yet validated on
  the current infrastructure).

This file will be removed from `kustomization.yaml` once the OCI NixOS instance is
validated in production and DNS is cut over. Its ProviderConfig reference is `kazimierz`
(not `default`) — that ProviderConfig is defined in `projects/chezmoi.sh` with Hetzner
and Cloudflare credentials.
