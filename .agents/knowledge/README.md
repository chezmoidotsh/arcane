# Agent Knowledge

Operational truths distilled from past incidents and intentionally exposed for future agents
(human or AI) before they touch the corresponding components.

Each file groups bullets by topic. Bullets must be:

* **Declarative** — facts, not narrative.
* **Self-contained** — readable without the source post-mortem.
* **Specific** — name the command, flag, or behavior.

## Source of truth

Bullets are extracted from the `## Agent Knowledge` section of post-mortems in
`docs/incidents/*.md`. The post-mortem is authoritative; this directory is a cross-cutting
view. When updating, prefer editing the source PM and re-extracting.

## Files

| File          | Components covered                                             |
| ------------- | -------------------------------------------------------------- |
| `talos.md`    | `talosctl`, machine config patches, K8s upgrade procedure      |
| `cilium.md`   | Cilium datapath, BPF programs, hardware constraints (r8169)    |
| `openbao.md`  | OpenBao Kubernetes auth, JWT issuer, ESO integration           |
| `zot.md`      | Zot OCI registry cache, GC, retention, disk-full recovery      |
| `longhorn.md` | Longhorn PVC online resize, dependency considerations          |
| `kyverno.md`  | (Removed from clusters) policy scoping pitfalls — kept for ref |
