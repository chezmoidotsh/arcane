# OBS001 — Every container declares its log format

| Field       | Value                                                             |
| ----------- | ----------------------------------------------------------------- |
| ID          | OBS001                                                            |
| Severity    | Low                                                               |
| Category    | Observability                                                     |
| Scope       | All namespaces (workload pod templates, CloudNative-PG `Cluster`) |
| Enforcement | CI-time (conftest)                                                |

## Rationale

The o11y agent parses a container's logs (level, error and semantic-convention fields) only when its pod declares their
format (ADR-020). Nothing is detected implicitly: a container without a format reaches VictoriaLogs with an unspecified
severity. This rule makes the declaration mandatory, so every new workload says how its logs are parsed, or `none`.

## Background

Introduced with the pod log parsers of the o11y agent (`catalog/kubernetes/o11y-agent/parsers/`, ADR-020). The `OBS`
family covers observability conventions.

## Policy files

| File                              | Scope                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `policies/OBS001:kubernetes.rego` | Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob, CloudNative-PG `Cluster` |

## What is checked

- Every container and init container of a workload template is covered by `o11y.chezmoi.sh/log-format.<container>` or by
  the pod default `o11y.chezmoi.sh/log-format`.
- A CloudNative-PG `Cluster` sets `o11y.chezmoi.sh/log-format` in `spec.inheritedMetadata.annotations` (CNPG copies it
  to its pods).
- Every value is a format of the parser library or `none`. `log_formats` must list the parser directories:
  `mise run o11y:parsers:test` fails otherwise.

Pods created at runtime by operators are not in `dist/` and are not checked; annotate them through their custom resource
when it exposes pod metadata (OpenTelemetryCollector `podAnnotations`, Grafana deployment template, ToolHive
`podTemplateSpec`).

The rule emits `violation` instead of `deny`: conftest fails on both, and the unit tests of the other policies keep
counting only their own `deny` messages.

## Enforcement

```sh
# CI (GitHub Actions)
conftest test projects/*/dist --policy catalog/opa/policies/ --combine

# OPA unit tests
mise exec opa -- opa test catalog/opa/policies/ -v
```

CI enforcement is **blocking**. All manifests in `projects/*/dist/` must be compliant before merging.
