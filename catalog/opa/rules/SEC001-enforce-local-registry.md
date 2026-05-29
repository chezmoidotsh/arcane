# SEC001 — Enforce Local OCI Registry

| Field       | Value                                       |
| ----------- | ------------------------------------------- |
| ID          | SEC001                                      |
| Severity    | Medium                                      |
| Category    | Supply-chain security / Air-gapped registry |
| Scope       | All namespaces (exclusions listed below)    |
| Enforcement | CI-time (conftest)                          |

## Rationale

All container images must be pulled through the local Zot registry mirror at
`oci.chezmoi.sh`. This ensures:

1. **Air-gapped operation** — clusters can pull images without direct internet
   access, reducing the blast radius of local internet outages.
2. **Supply-chain control** — every image transits a single mirror that can be
   scanned, cached, and audited independently of the upstream source.
3. **Network efficiency** — images are cached locally; repeated pulls resolve
   against the LAN mirror instead of traversing the WAN link.

## Background

This rule replaces the Kyverno `enforce-local-registry` MutatingPolicy that was
removed after the **2026-05-26 circular-dependency incident** (full post-mortem:
`docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`).

Kyverno ran as an in-cluster mutating webhook that rewrote image references at
admission time. Because Kyverno itself ran as a pod needing images from Zot, and
Zot relied on Longhorn for storage, whose workloads also needed image pulls, a
storage degradation event caused a circular dependency: Kyverno could not start
→ no image mutation → Zot pods could not be scheduled → storage never recovered.

The OPA/conftest approach avoids this entirely: policy is enforced at CI time
with no in-cluster dependency. Images are committed with the correct registry
prefix, eliminating the need for runtime mutation.

## Applicable best practices

| Reference                                                                       | Relevance                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------- |
| [NIST SP 800-190 §3.1.5 §3.2 §3.4](https://csrc.nist.gov/pubs/sp/800/190/final) | Use trusted registries for container images |

## Policy files

| File                                  | Scope                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| `policies/SEC001:kubernetes.rego`     | Native Kubernetes resources (Pods, Deployments, DaemonSets, …) |
| `policies/SEC001:cloudnative-pg.rego` | CloudNative-PG `ImageCatalog` and `ClusterImageCatalog`        |

## What is checked

### Native Kubernetes resources

Every resource that embeds a Pod spec is checked. The following container and
volume fields must reference `oci.chezmoi.sh`:

* `spec.containers[].image`
* `spec.initContainers[].image`
* `spec.ephemeralContainers[].image`
* `spec.template.spec.{containers,initContainers,ephemeralContainers}[].image`
* `spec.jobTemplate.spec.template.spec.{containers,initContainers,ephemeralContainers}[].image`
* `spec.volumes[].image`
* `spec.template.spec.volumes[].image`
* `spec.jobTemplate.spec.template.spec.volumes[].image`

### CloudNative-PG resources

* `postgresql.cnpg.io/v1` kind `ImageCatalog` → `.spec.images[].image`
* `postgresql.cnpg.io/v1` kind `ClusterImageCatalog` → `.spec.images[].image`

## Exclusions

The following namespaces are excluded from enforcement — they host infrastructure
components that must be schedulable before the registry mirror is available:

| Namespace            | Reason                                                 |
| -------------------- | ------------------------------------------------------ |
| `kube-system`        | Core Kubernetes components                             |
| `kube-public`        | Cluster metadata                                       |
| `kube-node-lease`    | Node heartbeat leases                                  |
| `longhorn-system`    | CSI - required for the registry (bootstrap dependency) |
| `local-path-storage` | Local path provisioner (bootstrap dependency)          |

## Enforcement

```sh
# CI (GitHub Actions)
conftest test <manifest.yaml> -p catalog/opa/policies/

# Local
mise exec conftest -- conftest test <manifest.yaml> -p catalog/opa/policies/

# OPA unit tests
mise exec opa -- opa test catalog/opa/policies/ -v
```

CI enforcement is **non-blocking** during the initial rollout (see ADR-012).
The policy will transition to blocking once all existing manifests are compliant.
