# Omni infra-provider-proxmox log transforms

Vector transform pipeline for the Omni Proxmox infrastructure provider LXC.
Parses Zap JSON logs into OTLP SemConv fields before shipping to VictoriaLogs.

## Pipeline overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  journald_to_semconv  (from lxc-o11y-agent)                             │
│       │                                                                 │
│       ▼  route_omni_provider                                            │
│       │  service.name == 'omni-infra-provider-proxmox'?                 │
│       │                                                                 │
│       ├── provider ──▶  provider_zap_parse                              │
│       │                 ts · level · msg · caller · (rest) → attrs      │
│       │                      │                                          │
│       │                      ▼  provider_to_o11y                        │
│       │                      │                                          │
│       └── other ────▶  unmatched_to_o11y                                │
│                              │                                          │
│       ▼  (both paths converge)                                          │
│  out_logs  ──────────────────────────────────────►  o11y in_vector      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Provider logs are simpler than omni's (no gRPC call tracking, no reconcile loop) —
a single parse stage is sufficient.

## Available fields in VictoriaLogs

| VictoriaLogs field       | Source Zap field | Notes                                               | Spec                                                                    |
| ------------------------ | ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `_msg`                   | `msg`            | Log message                                         | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `_time`                  | `ts`             | Nanosecond precision from Unix float                | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `severity_number`        | `level`          | OTel numeric (1=TRACE … 21=FATAL)                   | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `service.name`           | journald         | Always `omni-infra-provider-proxmox`                | <https://opentelemetry.io/docs/specs/semconv/resource/#service>         |
| `host.name`              | journald         | Always `omni-infra-provider-proxmox`                | <https://opentelemetry.io/docs/specs/semconv/resource/host/>            |
| `attrs.code.file.path`   | `caller`         | Go source file                                      | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.code.line.number` | `caller`         | Line number (integer)                               | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.provider`         | remaining fields | JSON blob of unparsed Zap fields (absent when none) | —                                                                       |

## VictoriaLogs query examples

```
# All provider errors and above
service.name:omni-infra-provider-proxmox severity_number:>=17

# Provider startup sequence
service.name:omni-infra-provider-proxmox _msg:"starting infra provider"

# Insecure connection warnings (Proxmox TLS misconfiguration)
service.name:omni-infra-provider-proxmox _msg:"using insecure connection"

# All warnings and errors in the last hour
service.name:omni-infra-provider-proxmox severity_number:>=13

# Ingestion validation errors for this provider
service.name:vector-ingest attrs.error.original_service:omni-infra-provider-proxmox
```
