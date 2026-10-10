# REL001 — Single-instance CNPG Cluster must disable its PDB

| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| ID          | REL001                                    |
| Severity    | Medium                                    |
| Category    | Reliability / Node maintenance            |
| Scope       | All namespaces (CloudNative-PG `Cluster`) |
| Enforcement | CI-time (conftest)                        |

## Rationale

CloudNative-PG defaults `spec.enablePDB` to `true` and creates a `PodDisruptionBudget` with `minAvailable: 1` on the
primary. With a single instance, that budget can never be satisfied: `kubectl drain` (and therefore Talos upgrades and
node rotations) blocks forever on the lone pod.

A `Cluster` with `spec.instances: 1` must therefore set `spec.enablePDB: false`. Clusters with more than one instance are
unaffected: the PDB protects the quorum there.

## Background

Introduced after issue #1253 (fixed in PR #1290), where single-instance clusters such as `openbao-database` blocked node
drains. The fix sets `enablePDB: false` in the affected manifests and in the `mutualized-cnpg-databases` chart defaults;
this rule prevents the regression from coming back.

The `REL` family is new: `SEC` covers supply-chain/security and `NET` covers network policy, neither fits an
availability concern.

## Policy files

| File                                  | Scope                                              |
| ------------------------------------- | -------------------------------------------------- |
| `policies/REL001:cloudnative-pg.rego` | CloudNative-PG `Cluster` (`postgresql.cnpg.io/v1`) |

## What is checked

A `postgresql.cnpg.io/v1` `Cluster` with `spec.instances == 1` is denied unless `spec.enablePDB` is explicitly `false`
(missing or `true` are both denied). The message names the cluster and its namespace.

## Enforcement

```sh
# CI (GitHub Actions)
conftest test projects/*/dist --policy catalog/opa/policies/ --combine

# Local
mise exec conftest -- conftest test <manifest.yaml> -p catalog/opa/policies/

# OPA unit tests
mise exec opa -- opa test catalog/opa/policies/ -v
```

CI enforcement is **blocking**. All manifests in `projects/*/dist/` must be compliant before merging.
