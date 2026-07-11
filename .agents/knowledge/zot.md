# Zot OCI registry — Agent knowledge

Distilled from incident post-mortems. Each bullet stands alone.

## Cache behavior

- Zot caches every requested image from configured upstream registries (docker.io, ghcr.io, gcr.io, registry.k8s.io, …).
  Without size-based retention, the cache grows monotonically.
- `gcInterval` controls cleanup of obsolete layers — **not total cache size**. To bound total size, configure
  `storage.retention` (max total size and/or per-repo).
- On `amiya.akn` the Zot PVC is Longhorn-backed and serves every downstream cluster — capacity is a critical shared
  dependency without (currently) any monitoring.

## Disk-full failure mode

- A disk-full event during a write can leave the `index.json` of the target repository corrupted (null bytes). Resulting
  symptom: Zot returns 500 (`invalid JSON` / `unsupported repository layout version`) on every manifest request for that
  specific repo — **distinct from 404** returned for missing images.
- Recovery: scale Zot to 0, delete the corrupted repo directory from the PVC, scale back up. Zot will re-sync from
  upstream on next pull.

## ArgoCD interaction

- ArgoCD `selfHeal` on the `zot-registry` Application will undo manual `kubectl scale --replicas=0` within seconds.
  Before any maintenance: `argocd app set zot-registry --sync-policy none`, perform changes, then re-enable.

## Emergency maintenance escape hatch

- Kyverno's image-rewrite policy (when present) could be bypassed for emergency pods via
  `priorityClassName: system-cluster-critical`. **Kyverno was removed in May 2026** — see
  `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`. Any replacement supply-chain enforcer must
  preserve a similar escape hatch.

## Longhorn PVC resize

- Online resize: `kubectl patch pvc <name> -p '{"spec":{"resources":{"requests":{"storage":"<size>"}}}}'`. Works without
  pod restart; volume + filesystem expanded transparently.

## Sources

- `docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md`
- `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`
