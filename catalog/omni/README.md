# `omni` — shared Omni cluster-template base and machine-class catalog

This catalog holds the **reusable Omni cluster-template base** and the **machine-class catalog** for Talos-on-Proxmox-VE
— both are shared, reusable definitions, not tied to any one cluster project.

## Layout

```text
catalog/omni/
├── clustertemplates/
│   └── base.yaml              # reference base — NOT applied directly
└── machineclasses/            # VM sizing catalog — see machineclasses/README.md
    ├── c1.minimal.yaml
    ├── w1.medium.yaml
    ├── w1.large.yaml
    └── w1.xlarge.yaml
```

## Cluster templates

[`clustertemplates/base.yaml`](clustertemplates/base.yaml) is a **reference template**, not a live cluster — it is not
applied directly. It encodes the shared architecture: V2 dual-NIC layout, Cilium native routing (no kube-proxy),
proxmox-csi system extensions, and the Talos schematic published via `systemExtensions`.

To create a real cluster:

1. **Copy** the base to the cluster's project as a standalone full file:
   `projects/<cluster>/src/infrastructure/omni/<name>.clustertemplate.yaml`.
2. **Override in place** at minimum: cluster `name`, pod CIDR, and machineClass sizes/counts.

The worked example is lungmen —
[`../../projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml`](../../projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml)
(`lungmen-akn`, pod CIDR `172.30.32.0/19`, service CIDR `172.31.0.0/19` and clusterDNS `172.31.0.10` are shared defaults
(all clusters, ClusterMesh-ready) per [ADR-014][], `c1.minimal`×1 control plane, `w1.large`×3 workers — sized to survive
a one-at-a-time Talos reboot under real load; `rhodes.akn`'s copy overrides this back down to 2, so worker count is a
genuine per-cluster override, not a fixed default).

### Why standalone copies (no kustomize)

Omni cluster templates are **flat, apiVersion-free** multi-document YAML: each document carries only a top-level `kind`
(and `name`), with no `apiVersion:`, `metadata:`, or `spec:`. `omnictl` **rejects** `metadata`, while kustomize
**requires** `metadata.name` — the two are mutually incompatible on a single file, so overlays/patches are not viable.
Per-cluster templates therefore ship as a full copy of the base with overrides edited in place. (Regenerating from the
base is a future improvement; today the copy is intentional.)

## Workflow

**Validate (offline, no Omni connectivity required):**

```sh
omnictl cluster template validate -f <path/to/template>.clustertemplate.yaml
```

lungmen exposes this as a project mise task — from `projects/lungmen.akn/`:

```sh
mise run omni:clustertemplate:validate
```

**Apply (online, needs Omni auth):**

```sh
omnictl cluster template sync -f <path/to/template>.clustertemplate.yaml
```

`omnictl apply -f` is the generic COSI resource command (`metadata`/`spec` YAML) — it cannot parse the
`kind: Cluster`/`ControlPlane`/`Workers` template DSL and fails with
`yaml: construct errors: ... expected 4 elements node, got N`. `cluster template sync -f <single-file>` is the command
that understands the DSL, and scoped to one file it only touches that cluster's resources (the
multi-cluster/delete-everything-not-present risk only applies when `-f` points at a directory).

`sync` requires `OMNICONFIG` (set by the root `.mise.toml`) and an Omni login
(`omnictl config new`/`omnictl config add`). There is no `omni:clustertemplate:apply` task by design: apply is an
online, authenticated, state-changing operation and does not belong in a per-cluster offline task.

**Drift check (online, read-only, manual):**

```sh
omni:drift:check                    # machine classes + every projects/*/src/infrastructure/omni/*.clustertemplate.yaml
omni:drift:check --machineclasses   # machine classes only
omni:drift:check --templates        # cluster templates only
```

Wraps `omnictl apply --dry-run` (machine classes) and `omnictl cluster template diff` (templates), which both exit 0
even when they print a diff. Exit codes: `0` no drift, `1` drift (diff printed), `2` tooling/auth error. It never writes
to Omni. Use it before a `sync`/`apply` or after a manual change in the Omni UI to catch Git/Omni divergence. The
"no change" wording of `omnictl` is unverified against a live instance: if it reports false drift, extend the filter in
the script.

It is deliberately **not** run in CI: it needs an Omni service account (`OMNICONFIG` credentials), which no workflow
holds today. Wiring it into a scheduled workflow requires creating that secret — a human decision.

## Cross-references

- [ADR-014 — Network topology](../../docs/decisions/014-network-topology.md) — pod/service CIDRs and the kube-dns IP
  decision.
- [VLAN / SDN VNet layout](../../docs/network/ipam.md) — VLAN 5 and the `talosnet` SDN.
- [Machine-class catalog README](machineclasses/README.md) — detailed sizing, naming, and provider tuning (includes the
  YAML).
- [Proxmox infra provider README](../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox/README.md)
  — the provider that turns a machine class into a Talos VM.

<!-- link references -->

[ADR-014]: ../../docs/decisions/014-network-topology.md
