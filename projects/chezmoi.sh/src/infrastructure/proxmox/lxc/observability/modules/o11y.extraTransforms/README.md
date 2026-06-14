# Observability appliance log transforms

Vector transform pipeline for the `observability` LXC itself.
Parses JSON logs from the Victoria stack (VictoriaMetrics, VictoriaLogs,
VictoriaTraces, vmalert), Alertmanager, and Caddy into OTLP SemConv fields
before shipping to VictoriaLogs.

## Pipeline overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  journald_to_semconv  (from lxc-o11y-agent)                             │
│       │                                                                 │
│       ▼  route_by_service                                               │
│       │                                                                 │
│       ├── victoria-* / vmalert                                          │
│       │        └─▶  victoria_to_o11y                                    │
│       │              victoria-metrics · victoria-logs                   │
│       │              victoria-traces · vmalert                          │
│       │                   │                                             │
│       ├── alertmanager                                                  │
│       │        └─▶  alertmanager_to_o11y                                │
│       │                   │                                             │
│       ├── caddy                                                         │
│       │        └─▶  caddy_to_o11y                                       │
│       │                   │                                             │
│       └── other ──▶  unmatched_to_o11y                                  │
│                           │                                             │
│       ▼  (all paths converge)                                           │
│  out_logs  ──────────────────────────────────────►  o11y in_vector      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Available fields in VictoriaLogs

### Victoria stack logs (`service.name`: `victoria-metrics`, `victoria-logs`, `victoria-traces`, `vmalert`)

Log format: `{"ts":"RFC3339","level":"info","caller":"pkg/file.go:N","msg":"..."}`

| VictoriaLogs field    | Source JSON field | Notes                              | Spec                                                                    |
| --------------------- | ----------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `_msg`                | `msg`             | Log message                        | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `_time`               | journald          | Journald ingestion time            | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `severity_number`     | `level`           | OTel numeric (1=TRACE … 21=FATAL)  | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `service.name`        | journald          | e.g. `victoria-metrics`, `vmalert` | <https://opentelemetry.io/docs/specs/semconv/resource/#service>         |
| `host.name`           | journald          | Always `o11y`                      | <https://opentelemetry.io/docs/specs/semconv/resource/host/>            |
| `attrs.code.filepath` | `caller`          | Go source file path                | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.code.lineno`   | `caller`          | Line number (integer)              | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |

### Alertmanager logs (`service.name`: `alertmanager`)

Log format: `{"time":"RFC3339","level":"INFO","source":"file.go:N","msg":"...","component":"...","file":"..."}`

| VictoriaLogs field               | Source JSON field | Notes                            | Spec                                                                    |
| -------------------------------- | ----------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `_msg`                           | `msg`             | Log message                      | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `severity_number`                | `level`           | OTel numeric; AM emits uppercase | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `attrs.code.filepath`            | `source`          | Go source file (`file.go`)       | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.code.lineno`              | `source`          | Line number (integer)            | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.alertmanager.component`   | `component`       | e.g. `configuration`, `silence`  | —                                                                       |
| `attrs.alertmanager.config_file` | `file`            | Config file path (optional)      | —                                                                       |

### Caddy logs — startup / info (`service.name`: `caddy`)

Log format: `{"level":"info","ts":unix_float,"logger":"...","msg":"..."}`

| VictoriaLogs field      | Source JSON field | Notes                             | Spec                                                                   |
| ----------------------- | ----------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `_msg`                  | `msg`             | Log message                       | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>            |
| `severity_number`       | `level`           | OTel numeric (1=TRACE … 21=FATAL) | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>            |
| `attrs.log.logger.name` | `logger`          | e.g. `tailscale`, `http`, `tls`   | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/log/> |

### Caddy logs — HTTP access (`service.name`: `caddy`, `logger`: `http.log.access`)

Log format: `{..., "request":{...}, "duration":float, "size":int, "status":int}`

| VictoriaLogs field     | Source JSON field  | Notes                                         | Spec                                                        |
| ---------------------- | ------------------ | --------------------------------------------- | ----------------------------------------------------------- |
| `_msg`                 | `request` + fields | Apache Combined Log Format                    | <https://opentelemetry.io/docs/specs/otel/logs/data-model/> |
| `attrs.caddy.request`  | `request`          | Full request object (method, uri, headers, …) | —                                                           |
| `attrs.caddy.duration` | `duration`         | Request duration in seconds (float)           | —                                                           |
| `attrs.caddy.size`     | `size`             | Response body size in bytes                   | —                                                           |
| `attrs.caddy.status`   | `status`           | HTTP status code (integer)                    | —                                                           |

## VictoriaLogs query examples

```
# All errors from the Victoria stack
service.name:victoria-metrics severity_number:>=17

# vmalert rule group evaluation errors
service.name:vmalert severity_number:>=17

# Alertmanager configuration reloads
service.name:alertmanager attrs.alertmanager.component:configuration

# Alertmanager silences activity
service.name:alertmanager attrs.alertmanager.component:silence

# Caddy tailscale tsnet startup events
service.name:caddy attrs.log.logger.name:tailscale

# Caddy HTTP access logs (all requests)
service.name:caddy attrs.log.logger.name:http.log.access

# Ingestion validation errors for o11y appliance services
service.name:vector-ingest attrs.error.original_service:victoria-metrics
service.name:vector-ingest attrs.error.original_service:alertmanager
service.name:vector-ingest attrs.error.original_service:caddy
```
