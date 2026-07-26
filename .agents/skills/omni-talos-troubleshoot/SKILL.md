---
name: omni-talos-troubleshoot
description: >
  Use this skill whenever a Talos cluster provisioned through Omni is not reaching `Ready` — phrases like "cluster is
  stuck", "rhodes-akn / lungmen-akn not ready", "nodes stuck NotReady", "Cilium never installs", "workers stuck
  Reconfiguring / Config Outdated", "CSR not approved", or any symptom during initial bring-up or a machine-config
  reconciliation where the cause is not immediately known. Also trigger right after a fresh `cluster template sync` when
  convergence stalls past the ~15 min window `docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md` expects.
  This skill diagnoses via `omnictl` + `kubectl`, matches the failure against known patterns, and routes to the linked
  procedure — it does not blindly patch manifests or push commits without confirmation.
compatibility:
  Requires `omnictl` and `kubectl` (both via `mise install`), and `OMNICONFIG` pointing at an authenticated Omni context
  (`omnictl config new`/`add`, or `mise run bao:login:admin` in `chezmoi.sh` for the admin role).
---

# Omni / Talos Troubleshoot

Diagnoses a Talos cluster managed through Omni that is not `Ready` — most often during initial bring-up, but also after
a machine-config change gets stuck reconciling. It is intentionally thin: the fix logic lives in
`docs/procedures/omni/`, not here.

## When to use this skill

- "\<cluster> is stuck / not ready", "nodes stuck NotReady", "workers stuck Reconfiguring"
- "Cilium never installs", "pods stuck ContainerCreating / Pending across the whole cluster"
- "CSR not approved", "kubelet API error: remote error: tls: internal error"
- Convergence stalls past \~15 min after `omnictl cluster template sync`
- Any symptom of a broken Omni-provisioned Talos cluster where the cause is unknown

## When NOT to use this skill

- **Creating a brand-new cluster** → follow `docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md` directly;
  this skill is for when that procedure (or steady-state reconciliation) goes wrong.
- **A cluster that is `Ready` but an application is broken** → that's an app-level or CNPG issue; see
  `.agents/skills/cnpg-troubleshoot/SKILL.md` for databases.
- **Omni itself is down** (the LXC, not a downstream cluster) → operational issue with the Omni host, not this skill.

## Workflow

1. **Identify** the target cluster (user-provided, or discover via Step 0).
2. **Diagnose** cluster/machine status and node conditions (Step 1).
3. **Match** the symptom against the known-patterns table (Step 2).
4. **Confirm** the target and proposed fix with the user before any mutating action (Step 3).
5. **Execute** the matched procedure, or apply a manifest fix if none exists (Step 4).
6. **Verify** and report (Step 5).

---

## Step 0 — Target resolution

```sh
omnictl get clusters
```

If more than one cluster is unhealthy, surface all of them via `ask_user` before proceeding — don't assume which one is
the target.

## Step 1 — Diagnose

Run all of these; they are cheap and each one rules out a class of cause.

```sh
CLUSTER_NAME="<cluster>"   # e.g. rhodes-akn

# 1a. Top-level convergence status
omnictl cluster status $CLUSTER_NAME

# 1b. Per-machine detail — the "diagnostics" field is the single most useful thing here.
#     Grab machine IDs from 1a's tree output.
omnictl get machinestatus <machine-id> -o yaml

# 1c. Kubernetes-side view (requires a kubeconfig — service-account form avoids interactive OIDC)
omnictl kubeconfig -c $CLUSTER_NAME --service-account --user admin -f /tmp/${CLUSTER_NAME}-kubeconfig
export KUBECONFIG=/tmp/${CLUSTER_NAME}-kubeconfig
kubectl get nodes -o wide
kubectl get pods -A

# 1d. Node conditions + taints (why is the node NotReady, specifically?)
kubectl get nodes -o json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for n in d['items']:
    print('===', n['metadata']['name'], '===')
    print('taints:', n['spec'].get('taints'))
    for c in n['status']['conditions']:
        print(' ', c['type'], c['status'], '-', c.get('reason'), '-', c.get('message'))
"

# 1e. Any Pending pod cluster-wide → describe it for the scheduling reason
kubectl describe pod <pending-pod> -n <namespace> | tail -20
```

> \[!NOTE] `omnictl` commands routinely take 60–120s to round-trip through Omni's gRPC API — this is normal, not a hang.
> Prefer running them with a background-capable tool if your environment supports it rather than assuming a timeout
> means failure.

Collect: cluster/machine-set health tree, each machine's `diagnostics` field, node `Ready` condition + `reason`/
`message`, node taints, and any `FailedScheduling` events on cluster-critical pods (CNI installer, cert-approver,
CoreDNS).

## Step 2 — Match against known patterns

```sh
grep -n "<symptom>" .agents/skills/omni-talos-troubleshoot/SKILL.md   # this table
```

| Symptom                                                                                                                                                                                                                | Root cause                                                                                                                                                                                                                                                                                                                             | Fix                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All nodes stuck `Ready=False`, `NetworkPluginNotReady`, CNI installer Job `Pending` with `FailedScheduling: untolerated taint(s)` and the cluster's template sets `machine.kubelet.extraArgs.cloud-provider: external` | The CNI installer Job's tolerations predate `cloud-provider: external` being added and don't tolerate `node.cloudprovider.kubernetes.io/uninitialized`. Job never schedules → CNI never installs → node never Ready → nothing (incl. the CCM that would clear the taint) can ever schedule. Permanent deadlock, not a transient delay. | Add a toleration for `node.cloudprovider.kubernetes.io/uninitialized:NoSchedule` to the installer Job in `catalog/talos/manifests/cilium/*.yaml`, push, repin the SHA ([OMNI-20260629-03](../../../docs/procedures/omni/OMNI-20260629-03.sha-repin.md)), then `cluster template sync` again. Shared manifest — confirm with user before pushing (affects every cluster using it). |
| Cluster stuck `ContainerCreating`/`Pending` cluster-wide, Cilium pods absent entirely (not even installer Job present)                                                                                                 | Pinned bootstrap-manifest SHA in the `.clustertemplate.yaml` 404s on `raw.githubusercontent.com` (unpushed branch SHA, or squash-merge garbage-collected the branch tip).                                                                                                                                                              | [OMNI-20260629-03 — SHA pinning](../../../docs/procedures/omni/OMNI-20260629-03.sha-repin.md): verify reachability with `curl -sI`, repin to the merge-commit SHA on `origin/main`, re-`sync`.                                                                                                                                                                                    |
| `cluster template sync` fails with "machine class not found", or provisioning never starts after an Omni reset                                                                                                         | Machine classes are separate COSI resources, wiped by an Omni reset — not part of the cluster/template.                                                                                                                                                                                                                                | `mise run omni:machineclass:apply` (from Step 1 of [OMNI-20260721-00](../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md)) before retrying `sync`.                                                                                                                                                                                                           |
| Workers show `apidavailable: false` forever; join hangs; teardown also hangs                                                                                                                                           | Self-hosted Omni's NixOS firewall isn't trusting the `siderolink` interface, so trustd (50001) is dropped — workers can't get their apid cert signed (control planes self-sign, so they're unaffected and mask the issue).                                                                                                             | Confirm from a CP node: `nc -zv <siderolink-prefix>::1 50001` (timeout = blocked). Fix: `networking.firewall.trustedInterfaces = [ "siderolink" ]` in `catalog/nix/siderolabs/omni/omni.nix`, rebuild/redeploy the Omni LXC.                                                                                                                                                      |
| Nodes never join / KubeSpan errors referencing a discovery service that doesn't exist                                                                                                                                  | `useEmbeddedDiscoveryService: true` set on the cluster, but self-hosted Omni wasn't started with `--embedded-discovery-service-enabled`. Not enterprise-gated — that Talos license note is about the _standalone_ discovery-service, unrelated.                                                                                        | For native-routing clusters without KubeSpan, disable discovery entirely (`cluster.discovery.enabled: false`) — nodes join via the Kubernetes API, no discovery service needed.                                                                                                                                                                                                   |
| One `kubelet-csr` diagnostic on a single node, cluster otherwise converging                                                                                                                                            | Expected transient: `kubelet-serving-cert-approver` (a Deployment, not a DaemonSet) only schedules once _some_ node is `Ready` — it doesn't need to run during CNI bootstrap. Resolves itself once CNI comes up.                                                                                                                       | No action — re-check after Cilium installs. Only investigate further if it persists after CNI is confirmed Running on all nodes.                                                                                                                                                                                                                                                  |

**If a match is found:** confirm it against the Step 1 evidence (don't pattern-match on symptom text alone — verify the
actual root cause, e.g. check the Job's tolerations directly rather than assuming). Surface the match and the linked
procedure to the user in Step 3.

**If no match is found:** present the raw diagnostic output (cluster tree, machine diagnostics, node conditions,
`FailedScheduling` events) to the user. Do not improvise a fix for an unknown pattern. After resolution, add a row to
the table above and, if it's a meaningful incident, a "Known issues" entry in
`docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md` (its own convention: "Hit something not listed here?
Add it.").

## Step 3 — Confirm with the user

Before any mutating action (`kubectl apply`, `omnictl cluster template sync`, editing and pushing a shared bootstrap
manifest, deleting/recreating a node), confirm using the interactive question tool. Show:

- The cluster name and current `omnictl cluster status` tree
- The matched pattern and root cause
- The exact fix (file(s) touched, whether it requires a `git push` to `main` before it can take effect, whether it
  affects other clusters sharing the same manifest)

Manifest fixes under `catalog/talos/manifests/` and `catalog/omni/` are shared across every cluster using Omni — treat
edits there with the same care as any shared-infrastructure change.

## Step 4 — Execute

Read the full linked procedure before executing; follow it step by step, including its own confirmation/verification
gates. For a pattern with no existing procedure (e.g. the taint-toleration fix), the fix is generally:

1. Edit the manifest under `catalog/talos/manifests/`.
2. Commit and push to `main` (confirm with user first — see Step 3).
3. Verify reachability of the new commit SHA:
   `curl -sI https://raw.githubusercontent.com/chezmoidotsh/arcane/<sha>/<path>`.
4. Repin the SHA in the affected `.clustertemplate.yaml`(s).
5. `omnictl cluster template sync -f <template>` (never bare `omnictl apply -f` on a template — see
   [OMNI-20260721-00, Step 6](../../../docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md#step-6--apply-the-cluster-template)).

> \[!WARNING] `providerID` is immutable once a node registers. If `cloud-provider: external` is added/changed **after**
> a node already joined, the only fix is deleting and recreating that node — not a config patch. Confirm this explicitly
> with the user before proceeding down that path.

## Step 5 — Verify and report

```sh
omnictl cluster status $CLUSTER_NAME
kubectl get nodes -o wide
kubectl get pods -A | grep -v Running
```

Report per cluster:

- `omnictl cluster status` → all machine sets `Ready` ✓, or still degraded (with the tree)
- Nodes → all `Ready` ✓, or remaining `NotReady` with conditions
- Pods → none stuck `Pending`/`ContainerCreating` outside expected transients ✓, or remaining list

If verification fails, do not declare it resolved — surface the remaining state to the user with the exact output.

---

## Guardrails

- **Never push a manifest fix or `cluster template sync` without user confirmation.** Bootstrap manifests and cluster
  templates are shared, hard-to-reverse (SHA-pinned, fetched by every node at bootstrap) infrastructure.
- **Never treat `omnictl` slowness as failure.** 60–120s round-trips are normal; don't retry-loop or assume the backend
  is down from a single slow command.
- **Never assume "not ready 5 minutes in" is transient.** Re-check the exact same tree twice — if the state hasn't moved
  at all (same machine IDs, same phase, same diagnostics), it's stuck, not converging. Investigate immediately.
- **Never delete/recreate a node casually.** `providerID` is immutable post-registration; this is sometimes the only fix
  (see Step 4 warning) but is destructive and must be confirmed.
- **Don't confuse `omnictl apply -f` with `omnictl cluster template sync -f`.** `apply` is the generic COSI resource
  command and cannot parse the template DSL. `sync` is template-aware; scoped to one cluster when pointed at a single
  file, but processes every template in a directory (including deletions) when pointed at one — never point it at a
  directory containing more than the intended cluster's template.

## Related skills and references

- **Cluster creation**: `docs/procedures/omni/OMNI-20260721-00.omni-cluster-creation.md`
- **SHA repinning**: `docs/procedures/omni/OMNI-20260629-03.sha-repin.md`
- **App-level database issues on an already-Ready cluster**: `.agents/skills/cnpg-troubleshoot/SKILL.md`
- **Omni documentation**: <https://omni.sidero.dev/>
- **Talos documentation**: <https://www.talos.dev/>
