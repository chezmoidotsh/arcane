package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for NET001 — Require Cilium Gateway ingress entity for HTTPRoute backends
#
# Test matrix:
#   1.  Compliant:  HTTPRoute + Service + netpol + fromEntities(ingress)   → 0 violations
#   2.  Violation:  HTTPRoute + Service + netpol (fromEndpoints, no ingress entity) → 1
#   3.  No netpol:  HTTPRoute + Service, no network policy at all          → 0 violations
#   4.  No HTTPRoute: Service + netpol, not used as a backend              → 0 violations
#   5.  k8s NetworkPolicy: HTTPRoute + Service + k8s NetworkPolicy + no
#       CiliumNetworkPolicy with ingress entity                             → 1 violation
#   6.  Different selector: HTTPRoute targets svc-a, netpol targets svc-b  → 0 violations
#   7.  Multi-backend: two services, one covered one not                   → 1 violation
#   8.  Empty endpointSelector: matches all pods, has ingress entity        → 0 violations
#   9.  Cross-namespace backend: out of scope                               → 0 violations
#   10. No selector: ExternalName service has no spec.selector              → 0 violations
# ──────────────────────────────────────────────────────────────────────────────

# ── Mock resource builders ────────────────────────────────────────────────────

_httproute(ns, svc_name) := {
    "apiVersion": "gateway.networking.k8s.io/v1",
    "kind": "HTTPRoute",
    "metadata": {"name": "app-websecure", "namespace": ns},
    "spec": {
        "rules": [
            {"backendRefs": [{"name": svc_name, "port": 8080}]},
        ],
    },
}

_service(ns, name, selector) := {
    "apiVersion": "v1",
    "kind": "Service",
    "metadata": {"name": name, "namespace": ns},
    "spec": {
        "selector": selector,
        "ports": [{"port": 8080, "targetPort": 8080}],
    },
}

_cnp_fromendpoints(ns, ep_selector_labels) := {
    "apiVersion": "cilium.io/v2",
    "kind": "CiliumNetworkPolicy",
    "metadata": {"name": "allow-from-somewhere", "namespace": ns},
    "spec": {
        "endpointSelector": {"matchLabels": ep_selector_labels},
        "ingress": [
            {
                "fromEndpoints": [{"matchLabels": {
                    "io.kubernetes.pod.namespace": "in-gateway-system",
                }}],
                "toPorts": [{"ports": [{"port": "8080", "protocol": "TCP"}]}],
            },
        ],
    },
}

_cnp_fromingress(ns, ep_selector_labels) := {
    "apiVersion": "cilium.io/v2",
    "kind": "CiliumNetworkPolicy",
    "metadata": {"name": "allow-from-gateway", "namespace": ns},
    "spec": {
        "endpointSelector": {"matchLabels": ep_selector_labels},
        "ingress": [
            {
                "fromEntities": ["ingress"],
                "toPorts": [{"ports": [{"port": "8080", "protocol": "TCP"}]}],
            },
        ],
    },
}

_cnp_default_deny(ns, ep_selector_labels) := {
    "apiVersion": "cilium.io/v2",
    "kind": "CiliumNetworkPolicy",
    "metadata": {"name": "default-deny", "namespace": ns},
    "spec": {
        "endpointSelector": {"matchLabels": ep_selector_labels},
        "ingress": [],
    },
}

_np_vanilla(ns, pod_selector_labels) := {
    "apiVersion": "networking.k8s.io/v1",
    "kind": "NetworkPolicy",
    "metadata": {"name": "allow-from-netpol", "namespace": ns},
    "spec": {
        "podSelector": {"matchLabels": pod_selector_labels},
        "ingress": [
            {
                "from": [{"namespaceSelector": {"matchLabels": {
                    "kubernetes.io/metadata.name": "in-gateway-system",
                }}}],
                "ports": [{"port": 8080, "protocol": "TCP"}],
            },
        ],
    },
}

# ── Unit tests: labels_subset ─────────────────────────────────────────────────

test_labels_subset_empty_is_subset_of_anything if {
    labels_subset({}, {"app": "myapp", "env": "prod"})
}

test_labels_subset_empty_is_subset_of_empty if {
    labels_subset({}, {})
}

test_labels_subset_matching_labels if {
    labels_subset({"app": "myapp"}, {"app": "myapp", "env": "prod"})
}

test_labels_subset_non_matching_labels if {
    not labels_subset({"app": "other"}, {"app": "myapp"})
}

test_labels_subset_superset_not_subset if {
    not labels_subset({"app": "myapp", "env": "prod"}, {"app": "myapp"})
}

# ── Unit tests: selectors_overlap ────────────────────────────────────────────

test_selectors_overlap_both_empty if {
    selectors_overlap({}, {})
}

test_selectors_overlap_ep_empty_matches_any_svc if {
    selectors_overlap({}, {"app": "myapp"})
}

test_selectors_overlap_svc_empty_matches_any_ep if {
    selectors_overlap({"app": "myapp"}, {})
}

test_selectors_overlap_equal_selectors if {
    selectors_overlap({"app": "myapp"}, {"app": "myapp"})
}

test_selectors_overlap_ep_more_specific_still_overlaps if {
    # CNP targets {app:myapp, component:api} — subset of pods the service targets
    selectors_overlap({"app": "myapp", "component": "api"}, {"app": "myapp"})
}

test_selectors_no_overlap_distinct_labels if {
    not selectors_overlap({"app": "otherapp"}, {"app": "myapp"})
}

# ── Unit tests: httproute_backend_services ────────────────────────────────────

test_httproute_backend_services_collects_same_ns_backend if {
    backends := httproute_backend_services with input as [
        {"path": "hr.yaml", "contents": _httproute("default", "myapp")},
    ]
    {"namespace": "default", "name": "myapp"} in backends
}

test_httproute_backend_services_excludes_cross_ns_backend if {
    backends := httproute_backend_services with input as [
        {
            "path": "hr.yaml",
            "contents": {
                "apiVersion": "gateway.networking.k8s.io/v1",
                "kind": "HTTPRoute",
                "metadata": {"name": "app-websecure", "namespace": "frontend"},
                "spec": {
                    "rules": [
                        {"backendRefs": [{"name": "myapp", "namespace": "backend", "port": 8080}]},
                    ],
                },
            },
        },
    ]
    not {"namespace": "frontend", "name": "myapp"} in backends
    not {"namespace": "backend", "name": "myapp"} in backends
}

test_httproute_backend_services_explicit_kind_service if {
    backends := httproute_backend_services with input as [
        {
            "path": "hr.yaml",
            "contents": {
                "apiVersion": "gateway.networking.k8s.io/v1",
                "kind": "HTTPRoute",
                "metadata": {"name": "app-websecure", "namespace": "default"},
                "spec": {
                    "rules": [
                        {"backendRefs": [{"name": "myapp", "kind": "Service", "port": 8080}]},
                    ],
                },
            },
        },
    ]
    {"namespace": "default", "name": "myapp"} in backends
}

# ── Test 1: Compliant — netpol + ingress entity → 0 violations ───────────────

test_compliant_with_cilium_ingress_entity_policy if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "myapp")},
        {"path": "service.yaml", "contents": _service("default", "myapp", {"app": "myapp"})},
        {"path": "cnp-deny.yaml", "contents": _cnp_default_deny("default", {"app": "myapp"})},
        {"path": "cnp-ingress.yaml", "contents": _cnp_fromingress("default", {"app": "myapp"})},
    ]}
    count(violations) == 0
}

# ── Test 2: Violation — netpol with fromEndpoints, no ingress entity ──────────

test_violation_when_netpol_uses_fromendpoints_not_ingress_entity if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "myapp")},
        {"path": "service.yaml", "contents": _service("default", "myapp", {"app": "myapp"})},
        {"path": "cnp.yaml", "contents": _cnp_fromendpoints("default", {"app": "myapp"})},
    ]}
    count(violations) == 1
}

# ── Test 3: No violation when no network policy exists ────────────────────────

test_no_violation_without_any_netpol if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "myapp")},
        {"path": "service.yaml", "contents": _service("default", "myapp", {"app": "myapp"})},
    ]}
    count(violations) == 0
}

# ── Test 4: No violation when service has netpol but is not in any HTTPRoute ──

test_no_violation_when_service_is_not_httproute_backend if {
    violations := {msg | some msg in deny with input as [
        {"path": "service.yaml", "contents": _service("default", "myapp", {"app": "myapp"})},
        {"path": "cnp.yaml", "contents": _cnp_fromendpoints("default", {"app": "myapp"})},
    ]}
    count(violations) == 0
}

# ── Test 5: Violation — k8s NetworkPolicy + no CiliumNetworkPolicy ingress entity ──

test_violation_when_k8s_networkpolicy_present_but_no_cilium_ingress_entity if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "myapp")},
        {"path": "service.yaml", "contents": _service("default", "myapp", {"app": "myapp"})},
        {"path": "np.yaml", "contents": _np_vanilla("default", {"app": "myapp"})},
    ]}
    count(violations) == 1
}

# ── Test 6: No violation — HTTPRoute targets svc-a, netpol targets svc-b ─────

test_no_violation_when_netpol_targets_different_app if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "svc-a")},
        {"path": "service-a.yaml", "contents": _service("default", "svc-a", {"app": "app-a"})},
        {"path": "service-b.yaml", "contents": _service("default", "svc-b", {"app": "app-b"})},
        # netpol only targets svc-b, not svc-a
        {"path": "cnp.yaml", "contents": _cnp_fromendpoints("default", {"app": "app-b"})},
    ]}
    count(violations) == 0
}

# ── Test 7: Two services in HTTPRoute, one covered one not → 1 violation ──────

test_violation_for_uncovered_service_in_multi_backend_httproute if {
    violations := {msg | some msg in deny with input as [
        {
            "path": "httproute.yaml",
            "contents": {
                "apiVersion": "gateway.networking.k8s.io/v1",
                "kind": "HTTPRoute",
                "metadata": {"name": "multi-backend", "namespace": "default"},
                "spec": {
                    "rules": [{"backendRefs": [
                        {"name": "svc-a", "port": 8080},
                        {"name": "svc-b", "port": 8080},
                    ]}],
                },
            },
        },
        {"path": "svc-a.yaml", "contents": _service("default", "svc-a", {"app": "app-a"})},
        {"path": "svc-b.yaml", "contents": _service("default", "svc-b", {"app": "app-b"})},
        # svc-a: has netpol AND ingress entity → compliant
        {"path": "cnp-a.yaml", "contents": _cnp_fromendpoints("default", {"app": "app-a"})},
        {"path": "cnp-a-ingress.yaml", "contents": _cnp_fromingress("default", {"app": "app-a"})},
        # svc-b: has netpol but NO ingress entity → violation
        {"path": "cnp-b.yaml", "contents": _cnp_fromendpoints("default", {"app": "app-b"})},
    ]}
    count(violations) == 1
}

# ── Test 8: Empty endpointSelector (matches all pods) + ingress entity ────────

test_compliant_with_empty_endpoint_selector_ingress_policy if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "myapp")},
        {"path": "service.yaml", "contents": _service("default", "myapp", {"app": "myapp"})},
        # default-deny with specific selector
        {"path": "cnp-deny.yaml", "contents": _cnp_fromendpoints("default", {"app": "myapp"})},
        # ingress entity policy with empty endpointSelector (matches ALL pods in ns)
        {
            "path": "cnp-ingress.yaml",
            "contents": {
                "apiVersion": "cilium.io/v2",
                "kind": "CiliumNetworkPolicy",
                "metadata": {"name": "allow-all-ingress", "namespace": "default"},
                "spec": {
                    "endpointSelector": {},
                    "ingress": [{"fromEntities": ["ingress"]}],
                },
            },
        },
    ]}
    count(violations) == 0
}

# ── Test 9: Cross-namespace backend → out of scope, no violation ──────────────

test_no_violation_for_cross_namespace_backend if {
    violations := {msg | some msg in deny with input as [
        {
            "path": "httproute.yaml",
            "contents": {
                "apiVersion": "gateway.networking.k8s.io/v1",
                "kind": "HTTPRoute",
                "metadata": {"name": "cross-ns-route", "namespace": "frontend"},
                "spec": {
                    "rules": [{"backendRefs": [
                        {"name": "myapp", "namespace": "backend", "port": 8080},
                    ]}],
                },
            },
        },
        # service is in "backend" namespace (different from the HTTPRoute's "frontend")
        {"path": "service.yaml", "contents": _service("backend", "myapp", {"app": "myapp"})},
        {"path": "cnp.yaml", "contents": _cnp_fromendpoints("backend", {"app": "myapp"})},
    ]}
    count(violations) == 0
}

# ── Test 10: ExternalName service (no spec.selector) → no violation ───────────

test_no_violation_for_service_without_selector if {
    violations := {msg | some msg in deny with input as [
        {"path": "httproute.yaml", "contents": _httproute("default", "external-svc")},
        {
            "path": "service.yaml",
            "contents": {
                "apiVersion": "v1",
                "kind": "Service",
                "metadata": {"name": "external-svc", "namespace": "default"},
                "spec": {
                    "type": "ExternalName",
                    "externalName": "external.example.com",
                },
            },
        },
        # Even with a matching netpol, ExternalName services have no selector → no violation
        {"path": "cnp.yaml", "contents": _cnp_fromendpoints("default", {"app": "external-svc"})},
    ]}
    count(violations) == 0
}
