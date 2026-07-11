# Kyverno — Agent knowledge

**Kyverno was removed from `amiya.akn` and `lungmen.akn` in May 2026** (see related incident). This file is retained
because the supply-chain redesign tracked in issue #1005 will reintroduce the same class of admission policy, and the
lessons below must inform the rewrite.

Distilled from incident post-mortems. Each bullet stands alone.

## Policy scoping (the trap that took down amiya.akn)

- `MutatingPolicy` with image-rewrite + `imagePullPolicy: Always` forces fresh pulls on every pod restart. If applied to
  the namespace hosting the registry's storage backend (e.g. `longhorn-system` for a Longhorn-backed Zot), creates a
  hard circular dependency that collapses the cluster on the next backend pod restart.
- "System namespaces" exclusion (`kube-system`, `kube-public`, `kube-node-lease`) is **insufficient** in this homelab —
  application-tier infrastructure (`longhorn-system`, Cilium operator namespace, anything the OCI mirror depends on)
  must be excluded too.
- **Pre-flight checklist for any future image-rewrite policy:** "What does the target registry depend on? Are those
  namespaces excluded?" Map the dependency graph before deployment.

## Escape hatch

- The `enforce-local-registry` policy had a documented bypass via `priorityClassName: system-cluster-critical`. Any
  replacement must preserve a similar escape hatch — emergency cleanup pods need to pull a known-good image (e.g.
  `busybox` from docker.io) without rewrite.

## Recovery procedure (when Kyverno itself blocks recovery)

- Scale Kyverno deployments to 0; if ArgoCD `selfHeal` is on, disable it first
  (`argocd app set kyverno --sync-policy none`).
- If `kubectl` cannot reach the cluster: `helm template kyverno ... | kubectl apply -f -` to restore webhooks with a
  corrected policy.
- After full recovery: re-enable ArgoCD `selfHeal`.

## Sources

- `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`
- `docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md`
- [issue #1005](https://github.com/chezmoidotsh/arcane/issues/1005) — replacement design
