# descheduler (lungmen.akn)

[kubernetes-sigs/descheduler](https://github.com/kubernetes-sigs/descheduler) run as a `CronJob` every 6 hours with
the `LowNodeUtilization` strategy only. The kube scheduler never revisits placements; this evicts pods from busy nodes
so the scheduler re-places them on idle ones. Tracking issue: #1215.

## Thresholds (percent of node allocatable, computed from pod _requests_)

- **low** (`thresholds`): cpu 30 / memory 30 / pods 25. A worker is "underutilized" if **all** are below these.
- **high** (`targetThresholds`): cpu 60 / memory 60 / pods 50. A worker is "overutilized" if **any** is above these.

With 2 workers, eviction only happens when one worker is above "high" **and** the other is below "low" (and the evicted
pod fits there, `nodeFit: true`). Evictions stop as soon as the busy node drops back under "high". Hard caps: 3 pods
per node and 2 per namespace per run.

## Safety

- Evictions use the Eviction API, so PodDisruptionBudgets are respected.
- Never evicted: pods with a PVC (Proxmox CSI block volumes cannot follow a pod without detach/attach), pods with
  local storage, DaemonSet/bare pods, system-critical pods, and everything in `databases`, `cloudnative-pg-system`,
  `velero-system`, `smb-csi-driver-system`, `proxmox-system`, `kube-system`.
- Egress is limited to the kube-apiserver and DNS (CiliumNetworkPolicy, default-deny).

## Rollout: dry-run first

`cmdOptions.dry-run: true` is set in `descheduler.helmvalues/default.yaml`: the Job only logs what it would evict.

```sh
kubectl -n descheduler-system create job --from=cronjob/descheduler descheduler-manual   # optional: don't wait 6h
kubectl -n descheduler-system logs job/descheduler-manual | grep -iE 'evict|underutilized|overutilized|dry'
```

Look for `"Node is underutilized"` / `"Node is overutilized"` lines (the computed usage per node) and
`"Evicted pod in dry run mode"` lines (pod, namespace, node). Check that the pods it would move are the ones you
accept to restart, and that it does not oscillate between runs.

To go live (human step, after a few cycles of sane logs): remove `dry-run: true` from `default.yaml`, run
`dist:render`, commit, then watch the first real cycle and confirm no PodDisruptionBudget or availability issue.
Extending to other clusters is a separate decision.
