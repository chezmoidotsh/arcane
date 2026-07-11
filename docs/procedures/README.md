# Procedures

This directory contains Standard Operating Procedures (SOPs) for various tasks within the project. These documents
provide step-by-step instructions to ensure consistency, security, and reliability across operations.

Each procedure is designed to be a clear and actionable guide for a specific technical process, suitable for execution
by either a human operator or an AI agent.

## Available Procedures

### Security

- **[SEC-20250808-00: Add OIDC SecurityPolicy to an HTTPRoute](./security/SEC-20250808-00.add-securitypolicy-on-httproute.md)**:
  Details how to secure an application exposed via a Kubernetes `HTTPRoute` with OIDC authentication using Envoy
  Gateway, Authelia, and Vault.

### Databases

- **[DB-20260530-00: CNPG WAL disk full recovery](./databases/DB-20260530-00.cnpg-wal-disk-full-recovery.md)**: Recovery
  procedure for a CloudNative-PG cluster whose WAL PVC has reached 100% capacity. Covers PVC expansion,
  `Expected empty archive` S3 fix, WAL archiving verification, and backup trigger. Origin:
  `docs/incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md`.

### Omni

- **[OMNI-20260629-00: Omni cluster creation](./omni/OMNI-20260629-00.omni-cluster-creation.md)**: Creates a new Talos
  cluster managed by Omni (Sidero Omni) on Proxmox VE. Covers cluster identity and pod CIDR allocation (ADR-014),
  generating the cluster template from the reference base, SHA reachability checks, machine-class application, template
  validation and application, convergence monitoring, and kubeconfig retrieval.
- **[OMNI-20260629-03: SHA pinning — repinning Omni bootstrap manifests after a squash-merge](./omni/OMNI-20260629-03.sha-repin.md)**:
  Repins the Talos bootstrap manifest SHA references in Omni cluster templates after a pull request is squash-merged to
  `main`. Covers why SHA pinning exists, the squash-merge 404 problem, reachability verification, template updates,
  application, and a recommended CI guard.

### Infrastructure

- **[MIGR-20260628-00: Migrate Talos nodes from VLAN 2 to VLAN 5 (V1→V2 dual-NIC)](./infrastructure/MIGR-20260628-00.vlan2-to-vlan5.md)**:
  Rolling migration of existing Omni-managed Talos VMs from the legacy VLAN 2 single-NIC layout to the V2 dual-NIC
  layout (VLAN 5 on eth0, vnet-talos on eth1). Required after applying the updated V2 machine classes.
- **[INF-20260525-00: Upgrade Talos OS on a Single-Node Cluster](./infrastructure/INF-20260525-00.upgrade-talos.md)**:
  Full lifecycle upgrade of the Talos OS version on a single-node cluster, including pre-upgrade checks, image pre-pull,
  upgrade execution, post-upgrade verification, and rollback.
- **[INF-20260525-01: Upgrade Kubernetes on a Talos Single-Node Cluster](./infrastructure/INF-20260525-01.upgrade-kubernetes.md)**:
  Kubernetes version upgrade using `talosctl upgrade-k8s`, covering the six-phase upgrade process with dry-run
  validation, post-upgrade verification, and interrupted-upgrade recovery.
- **[INF-20260627-00: Provisioning the Proxmox SDN (VXLAN VNet for Talos clusters)](./infrastructure/INF-20260627-00.proxmox-sdn-setup.md)**:
  Provisions the Proxmox VE SDN backing the single shared `vnet-talos` for all Talos clusters (VXLAN zone, gateway/SNAT
  so nodes reach `pve-01:8006` for proxmox-csi-plugin, dnsmasq DHCP, MTU 1450) and the per-VNet `SDN.Use` ACL for
  `omni@pve`. References ADR-014 and `docs/network/vlans.md`.
- **[Bootstrap VPS with Pangolin and CrowdSec](../../projects/kazimierz.akn/docs/bootstrap-vps.md)**: Complete bootstrap
  process for deploying a VPS with Pangolin VPN and CrowdSec security monitoring using Tailscale for secure remote
  access.
- **[Add Site to Pangolin VPN](../../projects/kazimierz.akn/docs/add-site-to-pangolin.md)**: Expose applications and
  services through Pangolin VPN using Helm or Kustomize deployments.
- **[Configure Watchtower for Automatic Updates](../../projects/kazimierz.akn/docs/configure-watchtower.md)**: Add and
  configure Watchtower for automatic Docker container updates with docker-compose compatibility.
