# Omni log transforms

Vector transform pipeline for the Omni control-plane LXC.
Parses Zap JSON logs into OTLP SemConv fields before shipping to VictoriaLogs.

## Pipeline overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  route_builtin._unmatched  (from lxc-o11y-agent)                           │
│       │                                                                    │
│       ▼  route_by_service     switch on service.name                       │
│       │                                                                    │
│       ├─ omni ─▶ omni_zap_parse ─▶ route_omni_type                         │
│       │      │                                                             │
│       │      ├─ gRPC ──────▶ omni_grpc_to_semconv ─────┐                   │
│       │      ├─ reconcile ─▶ omni_reconcile_to_semconv ┤                   │
│       │      └─ other ─────▶ omni_other_to_semconv ────┴─▶  omni_to_o11y ┐ │
│       │                                                                  │ │
│       └─ other ────────────────────────────────────▶ unmatched_to_o11y ──┤ │
│                                                        glob *_to_o11y    │ │
│       ┌──────────────────────────────────────────────────────────────────┘ │
│       ▼                                                                    │
│  out_logs  ──────────────────────────────────────────▶  o11y in_vector     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Available fields in VictoriaLogs

### All omni logs

| VictoriaLogs field       | Source Zap field | Notes                                | Spec                                                                    |
| ------------------------ | ---------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `_msg`                   | `msg`            | Log message                          | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `_time`                  | `ts`             | Nanosecond precision from Unix float | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `severity_number`        | `level`          | OTel numeric (1=TRACE … 21=FATAL)    | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `service.name`           | journald         | Always `omni`                        | <https://opentelemetry.io/docs/specs/semconv/resource/#service>         |
| `host.name`              | journald         | Always `omni`                        | <https://opentelemetry.io/docs/specs/semconv/resource/host/>            |
| `attrs.code.file.path`   | `caller`         | Go source file                       | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.code.line.number` | `caller`         | Line number (integer)                | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |

### gRPC call logs (`_msg:"finished unary call"`)

| VictoriaLogs field                     | Source Zap field            | Notes                                                                                      | Spec                                                                          |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `attrs.rpc.system`                     | —                           | Always `grpc`                                                                              | <https://opentelemetry.io/docs/specs/semconv/rpc/rpc-spans/>                  |
| `attrs.rpc.service`                    | `grpc.service`              | e.g. `cosi.resource.State`                                                                 | <https://opentelemetry.io/docs/specs/semconv/rpc/rpc-spans/>                  |
| `attrs.rpc.method`                     | `grpc.method`               | e.g. `Update`, `Create`                                                                    | <https://opentelemetry.io/docs/specs/semconv/rpc/rpc-spans/>                  |
| `attrs.rpc.response.status_code`       | `grpc.code`                 | `OK`, `AlreadyExists`, …                                                                   | —                                                                             |
| `attrs.omni.grpc.status_code`          | `grpc.code`                 | Same value, gRPC-specific                                                                  | <https://opentelemetry.io/docs/specs/semconv/rpc/grpc/>                       |
| `attrs.rpc.duration_ms`                | `grpc.time_ms`              | Call duration in ms                                                                        | —                                                                             |
| `attrs.network.peer.address`           | `peer.address`              | Client IP address                                                                          | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/network/>    |
| `attrs.user_agent.original`            | `user_agent`                | Client user-agent string                                                                   | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/user-agent/> |
| `attrs.user.id`                        | `authenticator.user_id`     | UUID of authenticated user                                                                 | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/user/>       |
| `attrs.identity.id`                    | `authenticator.user_id`     | Same UUID, custom interim (mirrors `user.id`)                                              | —                                                                             |
| `attrs.identity.role`                  | `authenticator.role`        | e.g. `InfraProvider`, `Admin` (⚠ custom field — migrate when OTel stabilizes `user.roles`) | —                                                                             |
| `attrs.omni.authenticator.identity`    | `authenticator.identity`    | Full identity string                                                                       | —                                                                             |
| `attrs.omni.authenticator.fingerprint` | `authenticator.fingerprint` | Key fingerprint                                                                            | —                                                                             |
| `attrs.error.message`                  | `error`                     | Present only on non-OK codes                                                               | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/error/>      |
| `attrs.omni.extra`                     | remaining fields            | JSON blob of unparsed fields                                                               | —                                                                             |

### Reconcile logs (`_msg:"reconcile …"`)

| VictoriaLogs field         | Source Zap field | Notes                                            | Spec |
| -------------------------- | ---------------- | ------------------------------------------------ | ---- |
| `attrs.omni.controller`    | `controller`     | Controller name                                  | —    |
| `attrs.omni.namespace`     | `namespace`      | Resource namespace                               | —    |
| `attrs.omni.resource.type` | `type`           | CRD type (e.g. `InfraProviders.omni.sidero.dev`) | —    |
| `attrs.omni.resource.id`   | `id`             | Resource identifier                              | —    |
| `attrs.omni.job`           | `job`            | Always `reconcile`                               | —    |
| `attrs.omni.busy`          | `busy`           | Seconds spent reconciling                        | —    |
| `attrs.omni.interval`      | `interval`       | Next interval seconds (optional)                 | —    |
| `attrs.omni.requeued`      | `requeued`       | Requeue flag (optional, boolean)                 | —    |
| `attrs.omni.extra`         | remaining fields | JSON blob of unparsed fields                     | —    |

### Other logs (startup, misc)

| VictoriaLogs field | Notes                                                  | Spec |
| ------------------ | ------------------------------------------------------ | ---- |
| `attrs.omni.extra` | JSON blob of all Zap fields beyond ts/level/msg/caller | —    |

## VictoriaLogs query examples

```text
# All omni errors and above
service.name:omni severity_number:>=17

# gRPC calls that failed (non-OK status)
service.name:omni _msg:"finished unary call" NOT attrs.rpc.grpc.status_code:OK

# gRPC calls from a specific IP (SIEM: lateral movement)
service.name:omni attrs.network.peer.address:10.0.1.211

# All actions by a specific authenticated user (SIEM: user activity audit)
service.name:omni attrs.user.id:f4659ce8-1f80-4d55-9e7f-f97563987e58
# All actions by a specific role (infra providers)
service.name:omni attrs.identity.role:InfraProvider

# Reconcile failures
service.name:omni _msg:"reconcile failed"

# Reconcile activity for a specific controller
service.name:omni attrs.omni.controller:InfraProviderStatusController

# Slow gRPC calls (>50 ms)
service.name:omni attrs.rpc.duration_ms:>50

# Activity on a specific resource
service.name:omni attrs.omni.resource.id:pve-01.pve.chezmoi.sh

# Ingestion validation errors for omni
service.name:vector-ingest attrs.error.original_service:omni
```
