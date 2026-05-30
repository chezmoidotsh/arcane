# Longhorn — Agent knowledge

Distilled from incident post-mortems. Each bullet stands alone.

## PVC operations

* **Online resize**: `kubectl patch pvc <name> -p '{"spec":{"resources":{"requests":{"storage":"<size>"}}}}'`. Works without pod restart; volume and filesystem are expanded transparently. Used live on Zot PVC 50 Gi → 100 Gi during the 2026-05-25 saturation incident.

## Dependency considerations

* `longhorn-system` is on the critical path of any workload whose images come from a Longhorn-backed registry (e.g. Zot on `amiya.akn`). **Never apply admission/mutation policies that redirect Longhorn pod images through that registry** — this creates a hard circular dependency that collapses the cluster on the next Longhorn pod restart.
* Longhorn pods restart during normal cluster upgrades. Any policy scope decision must account for this restart path.

## Sources

* `docs/incidents/2026-05-25-zot-disk-full-imagepullbackoff.md`
* `docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`
