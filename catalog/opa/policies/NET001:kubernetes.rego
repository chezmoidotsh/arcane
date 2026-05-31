package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# NET001 — Require Cilium Gateway ingress entity for HTTPRoute backends
#
# If a Service is referenced as an HTTPRoute backend AND at least one
# CiliumNetworkPolicy or NetworkPolicy targets the same pods, then a
# CiliumNetworkPolicy with `fromEntities: [ingress]` MUST exist targeting
# those same pods.
#
# Rationale: Cilium Gateway API routes traffic through `cilium-envoy` running
# as a hostNetwork DaemonSet. That traffic carries the `reserved:ingress`
# Cilium identity — NOT the identity of any pod in the gateway namespace.
# Policies using `fromEndpoints` matching the gateway namespace silently
# drop this traffic at the network layer.
#
# Supports both conftest invocation modes:
#   conftest test <file>           → input is a single document
#   conftest test <dir> --combine  → input is [{path, contents}, ...],
#                                    enabling multi-resource correlation
#
# References:
#   https://docs.cilium.io/en/latest/security/policy/layer3/#entities-based
#   docs/incidents/2026-05-31-amiya-cilium-gateway-api-agent-drift-netpol.md
# ──────────────────────────────────────────────────────────────────────────────

# ── Input normalization ───────────────────────────────────────────────────────

resources contains r if {
    # --combine mode (conftest 0.68+): input is [{path, contents}, ...]
    is_array(input)
    some item in input
    r := item.contents
    is_object(r)
}

resources contains r if {
    # single-file mode: input is the document object itself
    is_object(input)
    r := input
}

# ── Resource type extraction ──────────────────────────────────────────────────

services contains svc if {
    some r in resources
    r.apiVersion == "v1"
    r.kind == "Service"
    svc := r
}

cilium_network_policies contains cnp if {
    some r in resources
    r.apiVersion == "cilium.io/v2"
    r.kind == "CiliumNetworkPolicy"
    cnp := r
}

network_policies contains np if {
    some r in resources
    r.apiVersion == "networking.k8s.io/v1"
    r.kind == "NetworkPolicy"
    np := r
}

httproutes contains hr if {
    some r in resources
    r.apiVersion == "gateway.networking.k8s.io/v1"
    r.kind == "HTTPRoute"
    hr := r
}

# ── Label selector helpers ────────────────────────────────────────────────────

# True when every key/value in `subset` appears in `superset`.
# An empty `subset` ({}) is vacuously true — it represents "match all".
labels_subset(subset, superset) if {
    every k, v in subset {
        superset[k] == v
    }
}

# True when the pod selectors overlap:
# either selector is a subset of the other (they share at least one pod).
selectors_overlap(ep_labels, svc_labels) if {
    labels_subset(ep_labels, svc_labels)
}

selectors_overlap(ep_labels, svc_labels) if {
    labels_subset(svc_labels, ep_labels)
}

# ── HTTPRoute backend service set ─────────────────────────────────────────────

# Collect {namespace, name} pairs of Services used as HTTPRoute backends
# in the same namespace as the HTTPRoute.
# Cross-namespace backends (backend.namespace != httproute.namespace) are
# out of scope: they appear in a separate conftest directory run.
httproute_backend_services contains {"namespace": ns, "name": svc_name} if {
    some hr in httproutes
    ns := hr.metadata.namespace
    some rule in hr.spec.rules
    some backend in rule.backendRefs
    svc_name := backend.name

    # Default kind when unspecified is Service (Gateway API spec §v1.0)
    backend_kind := object.get(backend, "kind", "Service")
    backend_kind == "Service"

    # Only include backends in the same namespace as the HTTPRoute
    backend_ns := object.get(backend, "namespace", ns)
    backend_ns == ns
}

# ── Network policy coverage checks ───────────────────────────────────────────

# True when at least one CiliumNetworkPolicy or NetworkPolicy targets the
# same pods as `svc` (selector overlap within the same namespace).
has_network_policy(svc) if {
    svc_labels := svc.spec.selector
    some cnp in cilium_network_policies
    cnp.metadata.namespace == svc.metadata.namespace
    ep_labels := object.get(cnp.spec.endpointSelector, "matchLabels", {})
    selectors_overlap(ep_labels, svc_labels)
}

has_network_policy(svc) if {
    svc_labels := svc.spec.selector
    some np in network_policies
    np.metadata.namespace == svc.metadata.namespace
    ep_labels := object.get(np.spec.podSelector, "matchLabels", {})
    selectors_overlap(ep_labels, svc_labels)
}

# True when at least one CiliumNetworkPolicy allows the reserved:ingress
# entity to reach the same pods as `svc`.
has_ingress_entity_policy(svc) if {
    svc_labels := svc.spec.selector
    some cnp in cilium_network_policies
    cnp.metadata.namespace == svc.metadata.namespace
    ep_labels := object.get(cnp.spec.endpointSelector, "matchLabels", {})
    selectors_overlap(ep_labels, svc_labels)
    some ingress_rule in cnp.spec.ingress
    some entity in ingress_rule.fromEntities
    entity == "ingress"
}

# ── Deny rule ─────────────────────────────────────────────────────────────────

deny contains msg if {
    some svc in services

    # Service must have a pod selector (excludes ExternalName / headless services)
    svc.spec.selector
    svc_ref := {"namespace": svc.metadata.namespace, "name": svc.metadata.name}

    # Only services that are HTTPRoute backends in the same namespace
    svc_ref in httproute_backend_services

    # Only when the pods are already covered by at least one network policy
    has_network_policy(svc)

    # Violation: no CiliumNetworkPolicy grants ingress entity access
    not has_ingress_entity_policy(svc)
    msg := sprintf(
        concat("", [
            "NET001: Service '%s/%s' is an HTTPRoute backend and its pods are ",
            "covered by network policies, but no CiliumNetworkPolicy allows ",
            "traffic from the Cilium Gateway API (fromEntities: [ingress]). ",
            "Cilium Gateway API proxies via reserved:ingress — add a ",
            "CiliumNetworkPolicy with `fromEntities: [ingress]` targeting ",
            "the same pods.",
        ]),
        [svc.metadata.namespace, svc.metadata.name],
    )
}
