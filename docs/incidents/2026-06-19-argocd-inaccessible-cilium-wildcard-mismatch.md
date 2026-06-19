---
title: "ArgoCD inaccessible — Cilium Gateway wildcard hostname mismatch"
date: 2026-06-19
author: "Alexandre"
participants: ["Alexandre", "[anthropic:glm-5-turbo]"]
severity: "Medium"
status: "Open"
detection-method: "User report"
duration: "Unknown"
services-affected: ["argocd"]
users-affected: "Alexandre"
root-cause-family: ["observability-gap", "missing-pre-deploy-check"]
related-incidents: []
---

## Event

**Expected:** `argocd.akn.chezmoi.sh` reachable via Cilium Gateway API ingress.
**Actual:** HTTPRoute for `argocd.akn.chezmoi.sh` was silently rejected by Cilium —
no status written, no traffic routed. The Cilium operator was also crashlooping
with `no kind is registered for the type v1.Gateway`, preventing any Gateway
reconciliation for \~2.5h prior to investigation.
**Impact:** ArgoCD UI and API unreachable at `argocd.akn.chezmoi.sh`. Duration
unknown (no alerting on route rejection or operator health).
**Resolution:** Added a dedicated `*.akn.chezmoi.sh` listener on the Cilium
Gateway, pointed the ArgoCD HTTPRoute to it, and restarted the Cilium operator
pod (crashloop resolved on restart — likely corrupted cache after transient
connectivity issue).

## Root Cause

**Technique:** 5 Whys

1. Why was ArgoCD unreachable? → HTTPRoute not accepted by Cilium Gateway.
2. Why not accepted? → Listener `*.chezmoi.sh` only matches single-level
   subdomains; `argocd.akn.chezmoi.sh` is two levels deep.
3. Why was it two levels deep? → Historical convention (`<service>.akn.chezmoi.sh`)
   that worked with Envoy Gateway but not with Cilium's stricter wildcard matching.
4. Why no detection? → Cilium wrote no status for rejected routes (silent
   failure), and no alert existed on route attachment or operator health.
5. Why was the operator crashlooping? → Gateway API CRD scheme failed to
   register after a transient issue, leaving the operator unable to
   reconcile any Gateway resources.

**Root cause:** **Cilium Gateway API silently rejects HTTPRoutes when the
hostname doesn't match the listener wildcard, with no status or alert — and
the migration from Envoy Gateway to Cilium was not validated for route
attachment.**

## Change Register

* [ ] \[due:: 2026-06-26] \[priority:: high] \[size:: M] \[owner:: Alexandre]
  Add alert on Cilium operator restarts and Gateway listener
  `Programmed=false` conditions
  * **Verification:** Grafana alert fires within 5min of Cilium operator
    restart or listener degradation
  * **If not done:** Future Gateway changes fail silently with no detection

* [ ] \[due:: 2026-06-26] \[priority:: medium] \[size:: S] \[owner:: Alexandre]
  Audit all HTTPRoutes across clusters for hostname depth vs listener
  wildcard compatibility
  * **Verification:** No routes with multi-level subdomains pointing to
    single-level wildcard listeners
  * **If not done:** Same rejection pattern on other services

* [ ] \[due:: 2026-06-26] \[priority:: low] \[size:: S] \[owner:: Alexandre]
  Add `*.akn.chezmoi.sh` listener to lungmen.akn Cilium Gateway
  * **Verification:** `kubectl get gateway` shows `akn.chezmoi.sh-websecure`
    listener on lungmen.akn
  * **If not done:** lungmen.akn services using `*.akn.chezmoi.sh` will
    hit the same wildcard mismatch

## Agent Knowledge

* \[Cilium Gateway API]: `*.chezmoi.sh` wildcard only matches single-level
  subdomains (e.g. `auth.chezmoi.sh`), not multi-level (e.g.
  `argocd.akn.chezmoi.sh`). Use explicit per-depth listeners when
  multi-level hostnames exist.
* \[Cilium Gateway API]: When Cilium rejects an HTTPRoute due to hostname
  mismatch, it writes **no status at all** — the route's `status.parents`
  array simply omits the Cilium controller. This is different from Envoy
  Gateway which writes explicit rejection conditions.
* \[Cilium operator]: If the operator crashloops with `no kind is registered
  for the type v1.Gateway`, a pod delete/restart often resolves it (likely
  corrupted informer cache after transient API server disruption).
