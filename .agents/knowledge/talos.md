# Talos — Agent knowledge

Distilled from incident post-mortems. Each bullet stands alone.

## Machine config

* `talosctl patch machineconfig`: applies a **strategic merge** — adds/updates keys but never deletes. To remove a key, extract full config (`talosctl get machineconfig -o yaml`), edit, then `talosctl apply-config --file <path>`.
* JSON6902 patches with `op: remove` are **not supported** for multi-document Talos machine configs.
* `talosctl apply-config` overwrites node state with the provided file — use it for any deletion or schema cleanup that merge can't express.

## Kubernetes upgrades

* `talosctl upgrade-k8s`: idempotent. After fixing config, relaunch is safe.
* `talosctl upgrade-k8s --dry-run` "removed component flags" check covers Talos-native flags only — it does **not** validate feature gates injected via user-supplied `extraArgs`, `extraConfig`, or `feature-gates` maps.
* Before any K8s minor-version upgrade: grep the patch file for every feature gate name, cross-reference against the target K8s release notes for graduated/removed gates.

## Control-plane diagnostics

* Talos diagnostics work without `kube-apiserver`: `talosctl containers -k`, `talosctl logs -k`, `talosctl apply-config` all use the Talos API on port 50000 directly.
* When kube-apiserver is down, `kubectl get ...` returns `connection refused` on 6443 — switch to `talosctl` for everything until apiserver recovers.

## Clock skew (for incident timelines)

* `talosctl time --nodes <node-ip>` — compare LOCAL TIME vs reference TIME (NTP) columns.
* Pair with `date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"` on the local machine to compute skew between transcript host and cluster nodes.

## Sources

* `docs/incidents/2026-05-26-lungmen-k8s-1.35-removed-featuregate.md`
