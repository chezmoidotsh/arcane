# NET001 — Require Cilium Gateway ingress entity for HTTPRoute backends

| Field       | Value                                  |
| ----------- | -------------------------------------- |
| ID          | NET001                                 |
| Severity    | High                                   |
| Category    | Network policy / Cilium Gateway API    |
| Scope       | All namespaces with HTTPRoute backends |
| Enforcement | CI-time (conftest)                     |

## Rationale

When a Service is referenced as an HTTPRoute backend and its pods are covered by at least one network policy, a
`CiliumNetworkPolicy` with `fromEntities: [ingress]` **must** exist targeting those same pods.

This is required because Cilium Gateway API routes traffic through `cilium-envoy`, a DaemonSet that runs on the host
network (`hostNetwork: true`). Traffic proxied by the Cilium Gateway API carries the `reserved:ingress` Cilium identity
— **not** the identity of any pod in the gateway namespace (`in-gateway-system`).

A policy using `fromEndpoints` that matches the gateway namespace will not match this traffic and will silently drop it
at the network layer, even if the Gateway is programmed correctly and DNS resolves to the right IP.

## Background

This rule was introduced after the **2026-05-31 incident** where migrating both `amiya.akn` and `lungmen.akn` clusters
to Cilium Gateway API left all HTTPRoute-backed applications unreachable. The apps had Cilium network policies that
matched `in-gateway-system` pods — valid for Envoy Gateway, which ran dedicated proxy pods there, but incorrect for
Cilium Gateway API.

Full post-mortem: `docs/incidents/2026-05-31-amiya-cilium-gateway-api-agent-drift-netpol.md`

## Applicable best practices

| Reference                                                                                                      | Relevance                                                  |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Cilium docs — Entity-based policies](https://docs.cilium.io/en/latest/security/policy/layer3/#entities-based) | `reserved:ingress` identity for Cilium Gateway API traffic |

## Policy files

| File                              | Scope                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `policies/NET001:kubernetes.rego` | HTTPRoute, Service, CiliumNetworkPolicy, NetworkPolicy |

## What is checked

The rule fires when **all four** conditions hold simultaneously:

1. A `Service` (with a pod selector) appears in the resources.
2. That Service is referenced as a backend in an `HTTPRoute` in the **same namespace** (cross-namespace backends are out
   of scope for a single conftest directory run).
3. At least one `CiliumNetworkPolicy` or `networking.k8s.io/v1 NetworkPolicy` targets the same pods as that Service
   (selector overlap within the namespace).
4. **No** `CiliumNetworkPolicy` with `fromEntities: [ingress]` exists that also targets those same pods.

### Selector overlap semantics

Two selectors "overlap" when either is a subset of the other (matching at least one pod in common). An empty
`endpointSelector` (`{}`) is treated as "matches all pods" — consistent with Cilium's own semantics.

### What is NOT checked

- Cross-namespace HTTPRoute backends (would require loading resources from two different directories into the same
  conftest run).
- Services with no `spec.selector` field (ExternalName, headless without endpoints) — these do not target pods and
  cannot be protected by pod-level policies.
- Apps with **no** network policy — if no network policy is present, there is no enforcement to breach; the rule is not
  triggered.

## Correct pattern

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-myapp-from-cilium-gateway
  namespace: myapp
  annotations:
    policy.networking.k8s.io/description: |
      Allows the Cilium Gateway API to route traffic to myapp.
      Traffic proxied by Cilium Gateway API carries the reserved:ingress
      identity — see https://docs.cilium.io/en/latest/security/policy/layer3/
spec:
  endpointSelector:
    matchLabels:
      app.kubernetes.io/name: myapp
  ingress:
    - fromEntities:
        - ingress
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
```

## Incorrect patterns (will trigger NET001)

```yaml
# BAD: fromEndpoints matching the gateway namespace does NOT work with
# Cilium Gateway API — the traffic identity is reserved:ingress, not
# a pod from in-gateway-system.
ingress:
  - fromEndpoints:
      - matchLabels:
          io.kubernetes.pod.namespace: in-gateway-system
```

## Namespace enforcement model

NET001 applies to all namespaces. There are no bootstrap exclusions: Cilium Gateway API routes are only established
after the cluster is fully operational, so all HTTPRoute backends are regular application pods subject to this rule.

## Enforcement

```sh
# CI (GitHub Actions) — per-app directory with --combine
conftest test projects/<cluster>/dist/apps/<app>/ -p catalog/opa/policies/ --combine

# Local — test a specific app
mise exec conftest -- conftest test \
  projects/lungmen.akn/dist/apps/linkding/ \
  -p catalog/opa/policies/ \
  --combine

# OPA unit tests
mise exec opa -- opa test catalog/opa/policies/ -v
```
