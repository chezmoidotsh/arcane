# `omni` — shared Omni cluster-template base

This catalog holds the **reusable Omni cluster-template base** for
Talos-on-Proxmox-VE. The machine-class catalog is project-specific — it lives
in [`../../projects/chezmoi.sh/src/infrastructure/omni/machineclasses/`](../../projects/chezmoi.sh/src/infrastructure/omni/machineclasses/)
because it is tightly coupled to the Proxmox instance that `chezmoi.sh` manages.

## Layout

```text
catalog/omni/
└── clustertemplates/
    └── base.yaml              # reference base — NOT applied directly
```

## Cluster templates

[`clustertemplates/base.yaml`](clustertemplates/base.yaml) is a **reference
template**, not a live cluster — it is not applied directly. It encodes the
shared architecture: V2 dual-NIC layout, Cilium native routing (no kube-proxy),
proxmox-csi system extensions, and the Talos schematic published via
`systemExtensions`.

To create a real cluster:

1. **Copy** the base to the cluster's project as a standalone full file:
   `projects/<cluster>/src/infrastructure/omni/<name>.clustertemplate.yaml`.
2. **Override in place** at minimum: cluster `name`, pod CIDR, and machineClass
   sizes/counts.

The worked example is lungmen —
[`../../projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml`](../../projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml)
(`lungmen-akn`, pod CIDR `172.30.0.0/19`, service CIDR `172.31.0.0/19` and
clusterDNS `172.31.0.10` are shared defaults (all clusters, ClusterMesh-ready) per
[ADR-014][], `c1.small`×1 control plane, `w1.large`×2 workers).

### Why standalone copies (no kustomize)

Omni cluster templates are **flat, apiVersion-free** multi-document YAML: each
document carries only a top-level `kind` (and `name`), with no `apiVersion:`,
`metadata:`, or `spec:`. `omnictl` **rejects** `metadata`, while kustomize
**requires** `metadata.name` — the two are mutually incompatible on a single
file, so overlays/patches are not viable. Per-cluster templates therefore ship
as a full copy of the base with overrides edited in place. (Regenerating from
the base is a future improvement; today the copy is intentional.)

## Workflow

**Validate (offline, no Omni connectivity required):**

```sh
omnictl cluster template validate -f <path/to/template>.clustertemplate.yaml
```

lungmen exposes this as a project mise task — from
`projects/lungmen.akn/`:

```sh
mise run omni:clustertemplate:validate
```

**Apply (online, needs Omni auth):**

```sh
omnictl apply -f <path/to/template>.clustertemplate.yaml
```

`apply` requires `OMNICONFIG` (set by `projects/chezmoi.sh/.mise.toml`) and an
Omni login, so run it from a context where both are configured — e.g. the
`projects/chezmoi.sh/` project after `mise run bao:login:admin`. There is no
`omni:clustertemplate:apply` task by design: apply is an online, authenticated,
state-changing operation and does not belong in a per-cluster offline task.

## Cross-references

* [ADR-014 — Network topology](../../docs/decisions/014-network-topology.md) — pod/service CIDRs and the kube-dns IP decision.
* [VLAN / SDN VNet layout](../../docs/network/vlans.md) — VLAN 5 and the `vnet-talos` SDN.
* [Machine-class catalog README](../../projects/chezmoi.sh/src/infrastructure/omni/README.md) — detailed sizing, naming, and provider tuning (includes the YAML).
* [Proxmox infra provider README](../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md) — the provider that turns a machine class into a Talos VM.

<!-- link references -->

[ADR-014]: ../../docs/decisions/014-network-topology.md
