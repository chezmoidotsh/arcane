# REL002 — Multi-instance CNPG Cluster must keep its PDB

| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| ID          | REL002                                    |
| Severity    | Medium                                    |
| Category    | Reliability / Node maintenance            |
| Scope       | All namespaces (CloudNative-PG `Cluster`) |
| Enforcement | CI-time (conftest)                        |

## Rationale

CloudNative-PG defaults `spec.enablePDB` to `true` and creates a `PodDisruptionBudget` on the primary. With more than one
instance that budget is what protects the primary during a node drain: without it, the eviction can hit the primary with
no prior switchover, and the database is unavailable until a replica is promoted.

A `Cluster` with `spec.instances > 1` must therefore not set `spec.enablePDB: false`. Draining the node of a primary
then waits for a switchover (`kubectl cnpg promote <cluster> <replica>`) instead of killing the primary.

## Background

The mirror of [REL001](REL001-single-instance-cnpg-disable-pdb.md), which handles `spec.instances: 1`. Introduced by
issue #1356 after `pocket-id-20260530` on `rhodes.akn` was found with 2 instances and `enablePDB: false`.

## Policy files

| File                                  | Scope                                              |
| ------------------------------------- | -------------------------------------------------- |
| `policies/REL002:cloudnative-pg.rego` | CloudNative-PG `Cluster` (`postgresql.cnpg.io/v1`) |

## What is checked

A `postgresql.cnpg.io/v1` `Cluster` with `spec.instances > 1` is denied when `spec.enablePDB` is explicitly `false`
(missing or `true` are both compliant). The message names the cluster and its namespace.

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
