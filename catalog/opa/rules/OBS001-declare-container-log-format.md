# OBS001 — Every container declares its log format

| Field       | Value                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| ID          | OBS001                                                                     |
| Severity    | Low                                                                        |
| Category    | Observability                                                              |
| Scope       | All namespaces (workload pod templates, custom resources that create pods) |
| Enforcement | CI-time (conftest)                                                         |

## Rationale

The o11y agent parses a container's logs (level, error and semantic-convention fields) only when its pod declares their
format (ADR-020). Nothing is detected implicitly: a container without a format reaches VictoriaLogs with an unspecified
severity. This rule makes the declaration mandatory, so every new workload says how its logs are parsed, or `none`.

## Background

Introduced with the pod log parsers of the o11y agent (`catalog/kubernetes/o11y-agent/parsers/`, ADR-020). The `OBS`
family covers observability conventions.

## Policy files

| File                              | Scope                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `policies/OBS001:kubernetes.rego` | Workloads (Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob) and the custom resources below |

## What is checked

- Every container and init container of a workload template is covered by `o11y.chezmoi.sh/log-format.<container>` or by
  the pod default `o11y.chezmoi.sh/log-format`.
- Every value is a format of the parser library or `none`. `log_formats` must list the parser directories:
  `mise run o11y:parsers:check-formats` fails otherwise (CI: the o11y parsers workflow).
- A custom resource whose operator creates pods sets the pod default `o11y.chezmoi.sh/log-format` in the field the
  operator copies to those pods. These resources do not list their containers, so the per-container keys are optional
  there.

### Custom resources that create pods

Every CRD rendered in `projects/*/dist/` was checked for the pods its operator creates.

| Custom resource                             | Pods                                | Field checked                                                                     |
| ------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `postgresql.cnpg.io` `Cluster`              | instances, jobs                     | `spec.inheritedMetadata.annotations`                                              |
| `postgresql.cnpg.io` `Pooler`               | PgBouncer                           | `spec.template.metadata.annotations`                                              |
| `opentelemetry.io` `OpenTelemetryCollector` | collector                           | `spec.podAnnotations`                                                             |
| `opentelemetry.io` `TargetAllocator`        | target allocator                    | `spec.podAnnotations`                                                             |
| `opentelemetry.io` `OpAMPBridge`            | bridge                              | `spec.podAnnotations`                                                             |
| `grafana.integreatly.org` `Grafana`         | Grafana (not in `spec.external`)    | `spec.deployment.spec.template.metadata.annotations`                              |
| `toolhive.stacklok.dev` `MCPServer`         | MCP server, proxy                   | `spec.podTemplateSpec.metadata.annotations` and the proxy one (below)             |
| `toolhive.stacklok.dev` `MCPRemoteProxy`    | proxy                               | `spec.resourceOverrides.proxyDeployment.podTemplateMetadataOverrides.annotations` |
| `toolhive.stacklok.dev` `VirtualMCPServer`  | vMCP                                | `spec.podTemplateSpec.metadata.annotations`                                       |
| `toolhive.stacklok.dev` `MCPRegistry`       | registry API                        | `spec.podTemplateSpec.metadata.annotations`                                       |
| `toolhive.stacklok.dev` `EmbeddingServer`   | embedding server                    | `spec.podTemplateSpec.metadata.annotations`                                       |
| `tailscale.com` `ProxyClass`                | proxies that use the class          | `spec.statefulSet.pod.annotations`                                                |
| `tailscale.com` `Recorder`                  | recorder                            | `spec.statefulSet.pod.annotations`                                                |
| `tailscale.com` `Connector`, `ProxyGroup`   | proxies                             | `spec.proxyClass` must be set (the `ProxyClass` carries the annotation)           |
| `cert-manager.io` `Issuer`, `ClusterIssuer` | ACME HTTP-01 solver (per challenge) | `…http01.{ingress,gatewayHTTPRoute}.podTemplate.metadata.annotations`             |

Pods that no field can annotate, left unparsed:

- the target allocator embedded in an `OpenTelemetryCollector` (`spec.targetAllocator` has no pod annotations);
- the nameserver of a Tailscale `DNSConfig`, and Tailscale proxies created for a `Service` or an `Ingress` without a
  `ProxyClass`;
- the repository maintenance jobs of Velero (configured by a `ConfigMap`, not a custom resource).

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
