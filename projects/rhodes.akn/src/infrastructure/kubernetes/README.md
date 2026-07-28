<h4 align="center">Rhodes·AKN - Infrastructure Operators</h4>

---

## ℹ️ About this folder

Each subdirectory is a self-contained Kustomize package for one infrastructure operator/controller, discovered and
synced automatically by the `system` ApplicationSet (`../../argocd/shoot.apps/system.applicationset.yaml`) — no manual
ArgoCD `Application` manifest needed, see the top-level [README](../../../README.md#-usage-and-development) for the
add-a-component workflow.

Namespace convention: the ApplicationSet appends `-system` to the directory name to form the target namespace (e.g.
`cert-manager/` → `cert-manager-system`), except where a component's upstream chart hard-codes `kube-system` (Cilium,
the two Proxmox components below).

## [Cilium](https://cilium.io/) — `cilium/` (namespace `kube-system`)

eBPF-based CNI: pod networking, `CiliumNetworkPolicy` enforcement, L2 announcement for LoadBalancer IPs — two
`CiliumLoadBalancerIPPool`s, `external.ippool.yaml` (VLAN5, `10.0.0.64/29`, the catch-all default) and
`internal.ippool.yaml` (talosnet-only, opt-in — see `docs/network/ipam.md`) — and the cluster's **Gateway API**
implementation, no separate ingress controller.

**Why this choice**: one component covers both CNI and ingress instead of stacking Cilium + a dedicated Gateway
controller. Envoy Gateway used to run alongside it on this cluster; that's gone now — Cilium's own Gateway API
implementation handles all in-cluster routing (see `../ingress-gateway/` below for the actual `Gateway`/`HTTPRoute`
resources).

## [Ingress Gateway](https://gateway-api.sigs.k8s.io/) — `ingress-gateway/` (namespace `ingress-gateway-system`)

Not a separate operator — this is where the two `Gateway`s Cilium's Gateway API controller (above) reconciles live:
`external` (VLAN5, `external.ippool.yaml`) and `internal` (talosnet-only, `internal.ippool.yaml`), plus the HTTP→HTTPS
redirect `HTTPRoute` and wildcard `*.chezmoi.sh` `Certificate` shared by both. Every app that needs split-horizon
exposure carries a matching pair of `HTTPRoute`s (e.g. `src/apps/pocket-id/main.ext.httproute.yaml` /
`main.int.httproute.yaml`), each attaching to the matching `Gateway` here via a cross-namespace `ReferenceGrant`.

**Why a separate folder**: keeps the Gateway/certificate lifecycle (rarely changes) decoupled from Cilium's own Helm
release (upgraded independently), and gives every app a single, stable `parentRef` to attach to.

## [CloudNative-PG](https://cloudnative-pg.io/) — `cloudnative-pg/` (namespace `cloudnative-pg-system`)

PostgreSQL operator. Provisions and manages every `Cluster` on rhodes (OpenBao, Pocket-Id), with the Barman Cloud CNPG-I
plugin for S3-compatible backups.

**Why this choice**: it provides automated backups to [Garage](https://garagehq.deuxfleurs.fr/), high availability, and
full lifecycle management of the database infrastructure, instead of hand-rolled StatefulSets + cronjobs.

## [Cert-Manager](https://cert-manager.io/) — `cert-manager/` (namespace `cert-manager-system`)

Automated TLS certificate issuance and renewal via DNS-01 challenges — Cloudflare `ClusterIssuer` (production),
credentials from a scoped Pulumi-issued token (`letsencrypt-issuer-credentials.externalsecret.yaml`, synced through
OpenBao/ESO).

**Why this choice**: the de-facto standard for cert lifecycle management in Kubernetes — no manual renewal, no
expired-cert incidents. Its own token is separate from `cloudflare-operator`'s (removed — see
[#370](https://github.com/chezmoidotsh/arcane/issues/370)), scoped to DNS write only.

## [External Secrets Operator](https://external-secrets.io/) — `external-secrets/` (namespace `external-secrets-system`)

Syncs Kubernetes `Secret` objects from OpenBao (`ClusterSecretStore` patched with this cluster's own Vault Kubernetes
auth mount/role: `rhodes.akn` / `rhodes.akn-eso-role`).

**Why this choice**: keeps secrets out of Git entirely and out of raw Kubernetes manifests — OpenBao stays the single
source of truth, ESO is just the delivery mechanism. Bootstrapped right after OpenBao during disaster recovery, ahead of
every other component that needs a credential (see the top-level README's Disaster Recovery section).

## [ExternalDNS](https://github.com/kubernetes-sigs/external-dns) — `external-dns/` (namespace `external-dns-system`)

Two releases, one per Gateway/network plane, selected by the `external-dns.alpha.kubernetes.io/zone` annotation on each
`HTTPRoute`:

- `external-dns-unifi` (`zone: external`) — publishes to the local UDM-Pro (UniFi) controller via the
  [external-dns-unifi-webhook](https://github.com/kashalls/external-dns-unifi-webhook) provider. VLAN5-reachable records
  only.
- `external-dns-bind` (`zone: internal`) — publishes to talosnet-dns (BIND, RFC2136/TSIG) for split-horizon: the same
  `*.chezmoi.sh` hostname, resolved to the `internal` Gateway's talosnet-only IP instead.

**Why this choice**: DNS records stay declarative and in sync with what's actually deployed, without a manual UniFi
console step per service, and split-horizon is expressed as a Kubernetes annotation instead of hand-maintained zone file
entries. Neither talks to Cloudflare — these are homelab-internal records; Cert-Manager (above) is the one talking to
Cloudflare, for ACME DNS-01 only.

## [Proxmox Cloud Controller Manager](https://github.com/sergelogvinov/proxmox-cloud-controller-manager) — `proxmox-cloud-controller-manager/` (namespace `kube-system`)

Labels Kubernetes `Node` objects with Proxmox topology (`providerID`, zone/region) so the scheduler and the CSI plugin
below can make topology-aware decisions.

## [Proxmox CSI Plugin](https://github.com/sergelogvinov/proxmox-csi-plugin) — `proxmox-csi-plugin/` (namespace `kube-system`)

Dynamic block-volume provisioning on Proxmox VE storage backends.

**Why this choice** (both Proxmox components): volumes are decoupled from VM lifecycle — they survive VM rebuilds and
can be reattached to a different VM on the same Proxmox node — without running a distributed storage system (e.g.
Longhorn) inside the cluster.
