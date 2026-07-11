---
title:
  "oci.chezmoi.sh unreachable after Cilium Gateway API migration — agent config drift + wrong network policy identity"
date: 2026-05-31
author: "Alexandre"
participants:
  - "Alexandre"
  - "[github-copilot:claude-sonnet-4.6]"
severity: "High"
status: "Open"
detection-method: "Manual discovery"
duration: "~2h55m (15:36 → ~18:31 UTC)"
services-affected:
  - "oci.chezmoi.sh (Zot OCI registry — amiya.akn)"
  - "lungmen.akn workloads pulling from oci.chezmoi.sh (ImagePullBackOff — secondary)"
users-affected:
  "me only — OCI registry inaccessible; Newt update on lungmen triggered ImagePullBackOff for workloads pulling from the
  unavailable registry"
root-cause-family:
  - "state-drift"
  - "network-policy-incomplete"
related-incidents:
  - path: "docs/incidents/2026-05-25-lungmen-clustersecretstore-vault-auth-failure.md"
    relation: "Same state-drift family — config change applied but component not restarted"
related-adrs: []
related-issues: []
---

## Executive Summary

After migrating `amiya.akn` from Envoy Gateway to Cilium Gateway API, `oci.chezmoi.sh` (Zot OCI registry) was completely
unreachable — TCP connections on ports 80 and 443 were refused for almost three hours. Only Zot was routed through the
new gateway at the time; all other services on `amiya.akn` remained on the old Envoy Gateway and were unaffected. Two
independent failures compounded: (1) the Cilium agent DaemonSet was never restarted after enabling Gateway API in its
ConfigMap, so the running agent silently ignored the new gateway configuration; (2) the CiliumNetworkPolicy for Zot was
written for Envoy Gateway's namespace-based identity and did not match Cilium's `reserved:ingress` identity used for
Gateway API traffic. Secondary impact: a Newt update on `lungmen.akn` during the outage triggered ImagePullBackOff for
workloads pulling from the unavailable registry. Both root causes were fixed sequentially, restoring full service.

---

## Event Summary

**Expected outcome:** After creating the new Cilium Gateway (`in-gateway-system/default`) and pointing the `zot`
HTTPRoute to it, `https://oci.chezmoi.sh` should have served requests through Cilium's built-in Envoy proxy with TLS
termination.

**Actual outcome:** Ports 80 and 443 on `10.0.2.3` (the Gateway's LoadBalancer IP) refused all TCP connections. DNS
resolved correctly, the Gateway object showed `PROGRAMMED=True`, but no listener was active because the Cilium agent was
not aware of the gateway config. After the agent restart exposed the second failure, all requests returned HTTP 503 due
to a network policy blocking traffic from the Cilium Envoy proxy.

**Impact:** Only Zot (`oci.chezmoi.sh`) was routed through the new Cilium Gateway at the time of the incident — all
other services on `amiya.akn` remained on the old Envoy Gateway and were unaffected. Secondary impact: a Newt update on
`lungmen.akn` during the outage window triggered ImagePullBackOff for workloads pulling images from the unavailable
registry. No data loss; no security exposure. Note: `lungmen.akn` has the same Cilium config-drift and
network-policy-identity problems independently (all apps auto-synced to Cilium Gateway → separate incident).

**Duration:** `2026-05-31T15:36Z` (gateway created, first config-drift warning) → `±? 2026-05-31T18:31Z` (200 OK
confirmed) — approximately 2h55m.

**First signal:** Manual test (`curl http://10.0.2.3`) by Alexandre at `±? 2026-05-31T18:00`. No alert existed; the
outage had been running silently for \~2.5h before discovery.

---

## Timeline

<!-- skew: exact timestamps sourced from Cilium operator structured logs (JSON) and
cilium-envoy xDS access logs; Alexandre's recall for ±? entries; curl timestamps
from terminal history. Clock skew between cluster nodes and workstation not measured. -->

| Time (UTC)            | Actor                               | Event                                                                                                                |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `2026-05-31T15:36:12` | \[system:cilium-operator]           | Gateway `in-gateway-system/default` created. Operator logs config drift: `enable-gateway-api=false` in running agent |
| `2026-05-31T15:36:12` | \[system:cilium-operator]           | `CiliumEnvoyConfig cilium-gateway-default` created — but agent silently ignores it (feature disabled)                |
| `2026-05-31T15:54:35` | \[system:cilium-operator]           | Gateway reconciled successfully (TLS secret found). `PROGRAMMED=True`. No listener active — drift persists           |
| `±? 2026-05-31T18:00` | Alexandre                           | Manual discovery: `curl http://10.0.2.3` → connection refused. Investigation starts                                  |
| `±? 2026-05-31T18:10` | \[github-copilot:claude-sonnet-4.6] | Diagnostic sweep: DNS ✓, Gateway IP ✓, cert ✓, HTTPRoute Accepted ✓. No pods in `in-gateway-system`                  |
| `±? 2026-05-31T18:15` | \[github-copilot:claude-sonnet-4.6] | Reads operator logs — config drift warnings identified. Decides to restart Cilium DaemonSet                          |
| `2026-05-31T18:22:31` | Alexandre                           | `kubectl -n kube-system rollout restart daemonset cilium` — agent pod restarts                                       |
| `2026-05-31T18:22:44` | \[system:cilium-envoy]              | xDS update received: listener `in-gateway-system/cilium-gateway-default/listener` added                              |
| `2026-05-31T18:26:21` | Alexandre                           | `curl` now returns HTTP 503 (connection refused → 503: second failure exposed)                                       |
| `2026-05-31T18:28:11` | \[github-copilot:claude-sonnet-4.6] | New netpol `allow-zot-from-cilium-gateway` (`fromEntities: [ingress]`) applied via kubectl                           |
| `2026-05-31T18:28:12` | \[system:argocd]                    | ArgoCD auto-sync detects deleted old policy and re-creates it from git (git wins)                                    |
| `±? 2026-05-31T18:31` | Alexandre                           | ingress-entity policy committed to git; ArgoCD syncs; `curl -sv https://oci.chezmoi.sh/v2/` → 200 OK                 |

---

## What Went Well

- **DNS was correct from the start.** `dig oci.chezmoi.sh` returned `10.0.2.3` immediately after Gateway creation,
  because external-dns reads the HTTPRoute annotation correctly.
- **TLS certificate was ready.** cert-manager issued the wildcard and Cilium copied it to `cilium-secrets` without
  intervention.
- **Cilium operator logged the config drift immediately.** The exact mismatch (`enable-gateway-api=false`,
  `enable-envoy-config=false`) was present in structured logs from `T15:36:12`. The signal was there; it was just not
  observed for 2.5h.
- **Iterative diagnosis converged quickly once started.** From first manual test to 503 (agent restart) was \~26
  minutes; from 503 to 200 OK (network policy fix) was \~5 minutes.
- **ArgoCD self-healing exposed the git-vs-live gap.** The auto-sync re-applying the old policy forced committing the
  fix to git rather than relying on a kubectl-only workaround.

---

## Root-Cause Analysis

**Technique:** 5 Whys — applied independently to each of the two failure chains.

**Why this technique:** Two distinct, sequential failures with clear linear cause chains; no branching or parallel
dependency between them that would require Ishikawa or Swiss Cheese.

### Failure Chain 1 — No listener active (connection refused)

1. **Why were ports 80/443 refusing connections?** → `cilium-envoy` had no listener for
   `in-gateway-system/cilium-gateway-default`.
2. **Why did `cilium-envoy` have no listener?** → The Cilium agent never pushed an xDS update to `cilium-envoy` for the
   `CiliumEnvoyConfig` created by the operator.
3. **Why did the agent not push the update?** → The running agent had `enable-gateway-api=false` and
   `enable-envoy-config=false` in its active config; it silently skipped `CiliumEnvoyConfig` reconciliation.
4. **Why did the running agent have those flags disabled?** → The `cilium-config` ConfigMap was updated (flags set to
   `true`), but the agent DaemonSet pod (`cilium-wqd2x`, age 3d20h) was not restarted. Cilium does not hot-reload
   ConfigMap changes — a pod restart is required.
5. **Why was the DaemonSet not restarted after the ConfigMap change?** → **ROOT CAUSE:** No documented step in the
   migration procedure requires restarting the Cilium DaemonSet when enabling new feature flags. The operator restart
   (which was performed) is insufficient — the agent pod must also restart independently.

### Failure Chain 2 — 503 after agent restart (network policy mismatch)

1. **Why did `curl` return 503 after the agent restart?** → `cilium-envoy` received a connection timeout from the Zot
   backend (`10.0.48.x:5000`).
2. **Why did the connection to Zot time out?** → The CiliumNetworkPolicy `allow-zot-from-envoy-gateway` was blocking the
   request; Zot's pod was not responding to TCP SYN from `cilium-envoy`.
3. **Why did the network policy block the request?** → The policy used `fromEndpoints` matching
   `io.kubernetes.pod.namespace: in-gateway-system`. The `cilium-envoy` DaemonSet is in `kube-system` and runs with
   `hostNetwork: true`; its traffic carries the `reserved:ingress` Cilium identity, not a namespace label.
4. **Why did the policy use namespace-based matching?** → The policy was written for Envoy Gateway, which runs dedicated
   Envoy proxy pods _inside_ `in-gateway-system`. This is a valid approach for Envoy Gateway but incorrect for Cilium
   Gateway API, which uses a shared host-network DaemonSet.
5. **Why was the policy not updated during the migration?** → **ROOT CAUSE:** The migration from Envoy Gateway to Cilium
   Gateway API was not accompanied by a review of network policies to replace namespace-based endpoint matching with the
   correct Cilium entity (`reserved:ingress`). The behavioral difference (dedicated namespace pod vs. host-network
   DaemonSet with reserved identity) is not obvious and was not documented anywhere in the codebase.

### Root Causes

- **Cilium feature-flag activation requires DaemonSet restart, not just ConfigMap update.** Enabling
  `enable-gateway-api`, `enable-envoy-config`, or `gateway-api-secrets-namespace` in `cilium-config` has no effect on
  running agent pods. The DaemonSet must be rolled out. This is a non-obvious operational constraint not captured in
  code or runbooks.

- **Cilium Gateway API traffic arrives at backend pods with `reserved:ingress` identity, not from the gateway's
  namespace.** Network policies written for Envoy Gateway (namespace-scoped pods) are silently wrong when used with
  Cilium Gateway API (host-network DaemonSet). The policy appears valid syntactically and is accepted by Cilium — the
  error only surfaces at runtime under load.

### Contributing Factors

- **No health check or smoke test after gateway creation.** The 2.5h silent outage was possible only because no
  automated check tested reachability of `oci.chezmoi.sh` after migration.
- **`PROGRAMMED=True` is misleading.** The Gateway API status surface shows the Gateway as programmed (IP assigned, cert
  ready) even when the xDS config push has failed silently. There is no `Status.Conditions` entry distinguishing "IP
  assigned" from "listener active".

---

## Warning Signs Missed

| Signal                                                                            | When visible          | Why it wasn't acted on                                            |
| --------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| Cilium operator logs: `warn Mismatch found key=enable-gateway-api actual=false`   | `2026-05-31T15:36:12` | No monitoring on Cilium operator log stream; not observed         |
| `kubectl get pods -n in-gateway-system` shows no Envoy pods (expected for Cilium) | `2026-05-31T15:36`    | Absence of pods not alarming — Cilium uses host-network           |
| No connectivity test immediately after migration ("smoke test")                   | `2026-05-31T15:36`    | Migration checklist doesn't include post-switch reachability test |

---

## Control Analysis

### In Control (what we could have changed)

- **Add a DaemonSet rollout step to the Cilium upgrade/config-change procedure.** The Cilium migration procedure
  (whether in a runbook or a checklist) should explicitly require
  `kubectl -n kube-system rollout restart daemonset cilium` whenever feature flags are toggled in `cilium-config`.
- **Document the `reserved:ingress` entity requirement for Cilium Gateway API.** Every app migrating from Envoy Gateway
  to Cilium Gateway API must replace namespace-scoped `fromEndpoints` with `fromEntities: [ingress]`. A knowledge file
  or OPA rule can encode this.
- **Add a smoke test to the Gateway API migration checklist.** `curl -sv https://<hostname>/` immediately after route
  creation would have caught both failures in under a minute.

### Out of Control (external factors)

| External factor                                                                        | What would reduce exposure?                                                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Cilium design: ConfigMap changes require pod restart (no hot-reload for feature flags) | Accept the constraint; encode the restart step explicitly in every runbook and as a pre-deploy check |
| Cilium design: `PROGRAMMED=True` does not imply "listener active"                      | Add an alert or smoke test that validates actual TCP reachability, not just API object status        |

---

## Systemic Lessons

- **Feature-flag changes in Cilium ConfigMap silently take no effect until agents restart.** The operator restart is a
  separate lifecycle from the agent DaemonSet. This will recur on every future Cilium feature enablement (Gateway API,
  BPF masquerade, BGP, etc.) unless the restart step is explicit in the procedure.

- **Cilium Gateway API uses a fundamentally different traffic identity model from Envoy Gateway.** Any existing network
  policy written for Envoy Gateway's namespace-pod model will silently block traffic when migrated to Cilium Gateway
  API. This is a migration trap that applies to every app in the cluster, not just Zot.

---

## From Lesson to Control

| Lesson                                            | Artifact type  | Linked artifact                                                                    |
| ------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| Cilium ConfigMap feature flags require DS restart | Knowledge file | `.agents/knowledge/cilium.md` — "Feature flag activation" bullet (TBD)             |
| Cilium ConfigMap feature flags require DS restart | Runbook step   | `docs/procedures/` — Cilium config-change procedure (TBD with deadline)            |
| Cilium GW API → `reserved:ingress` identity       | Knowledge file | `.agents/knowledge/cilium.md` — "Gateway API traffic identity" bullet (TBD)        |
| Cilium GW API → `reserved:ingress` identity       | OPA rule       | `catalog/opa/` — enforce `fromEntities: [ingress]` for gateway-facing netpol (TBD) |
| No smoke test after migration                     | Runbook step   | Gateway migration checklist (TBD with deadline)                                    |

---

## Change Register

- [x] \[due:: 2026-05-31] \[priority:: high] \[size:: S] \[owner:: Alexandre] Replace `fromEndpoints(in-gateway-system)`
      with `fromEntities: [ingress]` in zot network policy and rename file to `allow-zot-from-cilium-gateway`
  - **Verification:** `curl -sv https://oci.chezmoi.sh/v2/` returns HTTP 200
  - **If not done:** Zot registry remains inaccessible via Cilium Gateway

- [ ] \[due:: 2026-06-07] \[priority:: high] \[size:: S] \[owner:: Alexandre] Write `.agents/knowledge/cilium.md` with
      two bullets: (1) feature-flag activation requires DaemonSet restart; (2) Gateway API traffic identity is
      `reserved:ingress`
  - **Verification:** Future AI agent sessions touching Cilium auto-load the knowledge file and do not repeat either
    mistake
  - **If not done:** Next Cilium config change silently fails; next Gateway API migration replicates the wrong network
    policy pattern

- [ ] \[due:: 2026-06-14] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Add smoke-test step to gateway migration
      checklist: `curl -sv https://<hostname>/` immediately after HTTPRoute creation; expected HTTP 200 or 401 (not
      connection refused)
  - **Verification:** Next Gateway API route migration includes a documented reachability test before the migration is
    declared complete
  - **If not done:** Silent outages of the same duration remain possible on future migrations

- [ ] \[due:: 2026-06-14] \[priority:: medium] \[size:: M] \[owner:: Alexandre] Review all other apps in `amiya.akn`
      with `fromEndpoints` matching `in-gateway-system` namespace — replace with `fromEntities: [ingress]` for any app
      behind Cilium Gateway API
  - **Verification:** `grep -r "in-gateway-system" projects/amiya.akn/src/apps/` returns no CiliumNetworkPolicy
    `fromEndpoints` matches
  - **If not done:** Other apps migrated to Cilium Gateway API will hit the same 503 issue

- [ ] \[due:: 2026-06-30] \[priority:: low] \[size:: M] \[owner:: Alexandre] Add OPA rule in `catalog/opa/` to warn when
      a CiliumNetworkPolicy targeting an app behind a Cilium Gateway uses `fromEndpoints` with a gateway namespace
      rather than `fromEntities: [ingress]`
  - **Verification:** CI rejects a PR that adds a `fromEndpoints(in-gateway-system)` policy to an app with a Cilium
    Gateway HTTPRoute
  - **If not done:** Pattern recurs silently on any app migration; OPA provides no pre-deployment safety net

---

## Agent Knowledge

- \[Cilium]: Enabling feature flags in `cilium-config` ConfigMap (e.g., `enable-gateway-api`, `enable-envoy-config`,
  `gateway-api-secrets-namespace`) requires a `kubectl -n kube-system rollout restart daemonset cilium`. The running
  agent does not hot-reload the ConfigMap. The Cilium **operator** restart is independent and insufficient — the agent
  DaemonSet must also restart.

- \[Cilium Gateway API]: Traffic proxied by Cilium Gateway API (via `cilium-envoy` DaemonSet in `kube-system`,
  `hostNetwork: true`) arrives at backend pods with the Cilium identity `reserved:ingress`, **not** with a pod label
  from the gateway's namespace. CiliumNetworkPolicies must use `fromEntities: [ingress]`, not `fromEndpoints` matching
  `io.kubernetes.pod.namespace: in-gateway-system`.

- \[Cilium Gateway API]: `Gateway.status` showing `PROGRAMMED=True` means the LoadBalancer Service has an IP and the
  cert is ready. It does **not** guarantee that the xDS listener is active in `cilium-envoy`. A connection-refused
  response (not timeout) indicates no listener — likely the agent has not processed the `CiliumEnvoyConfig` yet (check
  for config-drift warnings in operator logs).

- \[Cilium operator logs]: When the operator detects config drift between the ConfigMap and the running agent, it logs
  `warn Mismatch found key=<flag>` at `WARN` level. These warnings are the only observable signal that an agent restart
  is required after a ConfigMap change.

---

## Resolution Tracker

### Done

- [x] Network policy `allow-zot-from-envoy-gateway` replaced with `allow-zot-from-cilium-gateway`
      (`fromEntities: [ingress]`)
- [x] `kustomization.yaml` updated and `dist/` regenerated

### Pending — after this PM is committed

- [ ] `.agents/knowledge/cilium.md` created — \[no issue yet]
- [ ] Other apps network policy review — \[no issue yet]
- [ ] Smoke-test step added to gateway migration checklist — \[no issue yet]
- [ ] OPA rule for gateway entity enforcement — \[no issue yet]

---

## Verification Schedule

| Checkpoint | Date       | What we'll check                                                                  | Forum       |
| ---------- | ---------- | --------------------------------------------------------------------------------- | ----------- |
| 1-week     | 2026-06-07 | Knowledge file created; no other app in 503 behind Cilium Gateway                 | Solo review |
| 1-month    | 2026-06-30 | OPA rule drafted; smoke-test in migration checklist; no recurrence of 503 pattern | Solo review |
| 3-month    | 2026-08-31 | Has a config-drift silent failure recurred on any Cilium feature change?          | Solo review |
