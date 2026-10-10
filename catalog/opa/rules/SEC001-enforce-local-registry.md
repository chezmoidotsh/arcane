# SEC001 — Enforce Local OCI Registry

| Field       | Value                                       |
| ----------- | ------------------------------------------- |
| ID          | SEC001                                      |
| Severity    | Medium                                      |
| Category    | Supply-chain security / Air-gapped registry |
| Scope       | All namespaces, no exclusion                |
| Enforcement | CI-time (conftest)                          |

## Rationale

All container images must be pulled through the local Zot registry mirror at `oci.chezmoi.sh`. This ensures:

1. **Air-gapped operation** — clusters can pull images without direct internet access, reducing the blast radius of
   local internet outages.
2. **Supply-chain control** — every image transits a single mirror that can be scanned, cached, and audited
   independently of the upstream source.
3. **Network efficiency** — images are cached locally; repeated pulls resolve against the LAN mirror instead of
   traversing the WAN link.

## Background

This rule replaces the Kyverno `enforce-local-registry` MutatingPolicy that was removed after the **2026-05-26
circular-dependency incident** (full post-mortem:
`docs/incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md`).

Kyverno ran as an in-cluster mutating webhook that rewrote image references at admission time. Because Kyverno itself
ran as a pod needing images from Zot, and Zot relied on Longhorn for storage, whose workloads also needed image pulls, a
storage degradation event caused a circular dependency: Kyverno could not start → no image mutation → Zot pods could not
be scheduled → storage never recovered.

The OPA/conftest approach avoids this entirely: policy is enforced at CI time with no in-cluster dependency. Images are
committed with the correct registry prefix, eliminating the need for runtime mutation.

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

Every resource that embeds a Pod spec is checked. The following container and volume fields must reference
`oci.chezmoi.sh`:

- `spec.containers[].image`
- `spec.initContainers[].image`
- `spec.ephemeralContainers[].image`
- `spec.template.spec.{containers,initContainers,ephemeralContainers}[].image`
- `spec.jobTemplate.spec.template.spec.{containers,initContainers,ephemeralContainers}[].image`
- `spec.volumes[].image`
- `spec.template.spec.volumes[].image`
- `spec.jobTemplate.spec.template.spec.volumes[].image`

### CloudNative-PG resources

- `postgresql.cnpg.io/v1` kind `ImageCatalog` → `.spec.images[].image`
- `postgresql.cnpg.io/v1` kind `ClusterImageCatalog` → `.spec.images[].image`

### Crossplane resources

Crossplane `Provider` and `Function` resources reference OCI packages through `.spec.package` rather than a pod spec
container image field. This field is functionally equivalent to a container image pull and must equally resolve through
`oci.chezmoi.sh`.

- `pkg.crossplane.io/v1` kind `Provider` → `.spec.package`
- `pkg.crossplane.io/v1beta1` kind `Function` → `.spec.package`

These resources are cluster-scoped; namespace exclusions do not apply.

## Namespace enforcement model

SEC001 applies to **every namespace**, `kube-system` included, and to cluster-scoped resources: images must use the
`oci.chezmoi.sh` prefix. There is no exclusion list.

Zot runs as a standalone Proxmox LXC, independent of any Kubernetes cluster, so the registry cannot depend on the
workloads it serves. The circular bootstrap dependency that used to justify exempting `kube-system`, `kube-public`,
`kube-node-lease`, `longhorn-system`, `zot-registry` and `argocd` no longer exists, and neither does the former
requirement that bootstrap namespaces must _not_ use the mirror.

## Enforcement

```sh
# CI (GitHub Actions)
conftest test <manifest.yaml> -p catalog/opa/policies/

# Local
mise exec conftest -- conftest test <manifest.yaml> -p catalog/opa/policies/

# OPA unit tests
mise exec opa -- opa test catalog/opa/policies/ -v
```

CI enforcement is **blocking** (no `continue-on-error`). All manifests in `projects/*/dist/` must be compliant before
merging.
