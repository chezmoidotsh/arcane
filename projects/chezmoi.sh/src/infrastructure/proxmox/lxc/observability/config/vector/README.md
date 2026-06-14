# Vector ingest pipeline — o11y appliance

Central Vector instance running on the `observability` LXC.
Receives logs from every other LXC via the Vector native protocol and from
external OTLP senders, validates them, then ships to VictoriaLogs.

## Pipeline overview

```
┌─ LOGS ─────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  in_otlp  (gRPC :4317 / HTTP :4318)        in_vector  (Vector native :6000)│
│       │                                    │                               │
│       ▼  otlp_to_semconv                   ▼  strip_vector_meta            │
│       │  normalize OTLP envelope           │  drop .source_type            │
│       │  → internal format                 │                               │
│       │                                    │                               │
│       └────────────────┬───────────────────┘                               │
│                        ▼  validate_semconv                                 │
│                        │  validate internal contract                       │
│                        │  bad events → ingestion error record              │
│                        │                                                   │
│                        ▼  to_vlogs_format                                  │
│                        │  body→_msg · resources.*→root · attributes→.attrs │
│                        │                                                   │
│                        ▼  out_victorialogs                                 │
│                           HTTP → VictoriaLogs :9428                        │
│                                                                            │
├─ METRICS ──────────────────────────────────────────────────────────────────┤
│                                                                            │
│  in_internal_metrics  (Vector self-metrics, every 30 s)                    │
│       │                                                                    │
│       ▼  out_victoriametrics                                               │
│          Prometheus remote write → VictoriaMetrics :8428                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Internal OTLP-like format

All stages between a source and `to_vlogs_format` operate on this contract:

| Field                | Type    | Mandatory | Notes                                     |
| -------------------- | ------- | --------- | ----------------------------------------- |
| `body`               | string  | yes       | Log message                               |
| `timestamp`          | RFC3339 | yes       | Event time (string, set by the transform) |
| `observed_timestamp` | RFC3339 | yes       | First-observed time                       |
| `resources`          | object  | no        | OTel resource attributes (nested)         |
| `attributes`         | object  | no        | Per-log attributes (nested)               |
| `severity_text`      | string  | no        | OTel severity label (TRACE…FATAL4)        |
| `severity_number`    | int     | no        | OTel severity number (0–24)               |
| `trace_id`           | string  | no        | W3C trace-id                              |
| `span_id`            | string  | no        | W3C span-id                               |

Any other root field causes `validate_semconv` to rewrite the event as an
ingestion error record (service `vector-ingest`).

## Stages

### `otlp_to_semconv` (sources.otlp.yaml)

Normalizes the envelope produced by Vector's `opentelemetry` source:

* Renames `.message` → `.body` (Vector maps OTLP body to `.message`)
* Flattens `.resources.attributes` → `.resources`
* Ensures `timestamp` is an RFC3339 string
* Stamps `observed_timestamp` with `now()` if the sender omitted it
* Marks the ingestion path: `.attributes.log.source = "otlp"`
* Moves OTLP `.flags` → `.attributes.trace.flags`

### `strip_vector_meta` (sources.vector.yaml)

Removes `.source_type` injected by the Vector native source.
No other transform — cluster-side Vectors are expected to send events already
in the internal OTLP-like format.

### `validate_semconv` (transforms.validate.yaml)

Validates every event against the internal format contract.
All violations are collected before rewriting (not fail-fast), so operators
see the full picture in one query.

Checks:

1. Mandatory fields present (`body`, `timestamp`, `observed_timestamp`)
2. No unknown root-level fields
3. `severity_number` integer in \[0, 24]
4. `severity_text` valid OTel name, consistent with `severity_number`
5. `resources` is an object
6. `attributes` is an object

Validation errors produce a replacement event:

```
body      = "ingestion_validation_error"
resources.service.name = "vector-ingest"
attributes.error.type             = "semconv_invalid"
attributes.error.messages         = "<all errors, semicolon-separated>"
attributes.error.original_service = "<original service.name>"
attributes.error.original_event   = "<JSON-encoded original event>"
```

Query in VictoriaLogs:

```
service.name:vector-ingest attrs.error.type:semconv_invalid
```

### `to_vlogs_format` + `out_victorialogs` (sinks.victorialogs.yaml)

Converts the internal format to VictoriaLogs JSON-line layout just before the
HTTP sink, keeping all upstream stages decoupled from the storage backend:

* `body` → `_msg`
* `timestamp` → `_time`
* `resources.*` → flattened to root (stream labels: `service.name`, `host.name`, …)
* `attributes` → `.attrs` as a raw nested JSON object (VictoriaLogs indexes it as `attrs.*`)
* Derives `severity_text` from `severity_number` when absent
* Adds `stored_timestamp` (time of push to VictoriaLogs)

Stream fields (query axes, ordered by priority):
`service.name`, `host.name`, `service.namespace`, `service.version`,
`k8s.cluster.name`, `k8s.namespace.name`

### `out_victoriametrics` (sinks.victoriametrics.yaml)

Prometheus remote write of Vector's own component metrics (events/s, errors,
buffer sizes) to VictoriaMetrics `:8428`. Separate pipeline — metrics never
mix with log events.
