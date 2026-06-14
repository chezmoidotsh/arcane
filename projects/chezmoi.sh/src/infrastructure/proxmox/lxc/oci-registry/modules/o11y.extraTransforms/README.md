# Zot OCI registry log transforms

Vector transform pipeline for the Zot OCI registry LXC.
Parses Zap JSON logs into OTLP SemConv fields before shipping to VictoriaLogs.

## Pipeline overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  route_builtin._unmatched  (from lxc-o11y-agent)                           │
│       │                                                                    │
│       ▼  route_by_service     switch on service.name                       │
│       │                                                                    │
│       ├─ zot ─▶ zot_zap_parse ─▶ route_zot_type                            │
│       │      │                                                             │
│       │      ├─ HTTP API ─▶ zot_http_to_semconv ──┐                        │
│       │      └─ other ────▶ zot_other_to_semconv ─┴─▶ zot_to_o11y ──┐      │
│       │                                                             │      │
│       └─ other ────────────────────────────────▶ unmatched_to_o11y ─┤      │
│                                                    glob *_to_o11y   │      │
│       ┌─────────────────────────────────────────────────────────────┘      │
│       ▼                                                                    │
│  out_logs  ──────────────────────────────────────────▶  o11y in_vector     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Available fields in VictoriaLogs

### All zot logs

| VictoriaLogs field       | Source Zap field | Notes                             | Spec                                                                    |
| ------------------------ | ---------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `_msg`                   | `message`        | Log message                       | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `_time`                  | `time`           | RFC3339 timestamp from Zot        | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `severity_number`        | `level`          | OTel numeric (1=TRACE … 21=FATAL) | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>             |
| `service.name`           | journald         | Always `zot`                      | <https://opentelemetry.io/docs/specs/semconv/resource/#service>         |
| `host.name`              | journald         | Always `oci-registry`             | <https://opentelemetry.io/docs/specs/semconv/resource/host/>            |
| `attrs.code.file.path`   | `caller`         | Go source file (full module path) | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.code.line.number` | `caller`         | Line number (integer)             | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |
| `attrs.code.function`    | `func`           | Fully-qualified Go function name  | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/code/> |

### HTTP API access logs (`_msg:"HTTP API"`)

| VictoriaLogs field                | Source Zap field | Notes                            | Spec                                                                          |
| --------------------------------- | ---------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `attrs.http.request.method`       | `method`         | GET, POST, PUT, DELETE, …        | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/http/>       |
| `attrs.url.path`                  | `path`           | Request path                     | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/url/>        |
| `attrs.http.response.status_code` | `statusCode`     | HTTP status code (integer)       | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/http/>       |
| `attrs.http.response.body.size`   | `bodySize`       | Response body size in bytes      | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/http/>       |
| `attrs.network.peer.address`      | `clientIP`       | Client IP address                | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/network/>    |
| `attrs.network.peer.port`         | `clientIP`       | Client port (integer)            | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/network/>    |
| `attrs.user_agent.original`       | `headers`        | User-Agent header value          | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/user-agent/> |
| `attrs.zot.latency_ms`            | `latency`        | Request duration in ms (integer) | —                                                                             |
| `attrs.zot.extra`                 | remaining fields | JSON blob of unparsed fields     | —                                                                             |

### Other logs (scrub, sync, startup)

| VictoriaLogs field | Notes                                                        | Spec |
| ------------------ | ------------------------------------------------------------ | ---- |
| `attrs.zot.extra`  | JSON blob of all Zap fields beyond time/level/message/caller | —    |

## VictoriaLogs query examples

```text
# All zot errors and above
service.name:zot severity_number:>=17

# Scrub integrity checks
service.name:zot _msg:"blobs/manifest ok"

# Sync errors
service.name:zot _msg:"failed to pull image"

# All HTTP API requests returning 5xx
service.name:zot _msg:"HTTP API" attrs.http.response.status_code:>=500

# All requests from a specific IP (SIEM: registry access audit)
service.name:zot attrs.network.peer.address:10.0.0.1

# Vector metrics scrapes (/metrics endpoint)
service.name:zot _msg:"HTTP API" attrs.url.path:/metrics

# Ingestion validation errors for zot
service.name:vector-ingest attrs.error.original_service:zot
```
