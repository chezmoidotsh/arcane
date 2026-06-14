# PVE exporter log transforms

Vector transform pipeline for the PVE exporter LXC.

This LXC has a dual log pipeline: it ships its own systemd journal (like every
other LXC) and also acts as the **syslog ingest point** for the Proxmox host.
The PVE host forwards RFC 5424 syslog via rsyslog `omfwd` to this LXC on
TCP :5140; syslog events are parsed here and forwarded to o11y alongside the
journal stream.

## Pipeline overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  journald source  (from lxc-o11y-agent)                                     │
│       ↓ route_builtin._unmatched                                            │
│       ↓ journald_to_o11y (passthrough filter)       ──────────────────────┐ │
│                                                                           │ │
│  in_syslog (TCP :5140, RFC 5424 from PVE host)                            │ │
│       ↓ syslog_to_o11y                              ──────────────────────┤ │
│                                                      glob *_to_o11y       │ │
│                                                            ↓              │ │
│                                                       out_logs (vector)  ◄┘ │
│                                                       → o11y VictoriaLogs   │
└─────────────────────────────────────────────────────────────────────────────┘
```

The `journald_to_o11y` passthrough is required because `logs.extraTransforms`
is non-empty (syslog source is added), which disables the automatic journald
passthrough in `catalog.lxcAgent`.

## Available fields in VictoriaLogs

### All syslog events (from Proxmox host via `in_syslog`)

| VictoriaLogs field             | Source syslog field | Notes                               | Spec                                                                       |
| ------------------------------ | ------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `_msg`                         | `message`           | Log body                            | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>                |
| `_time`                        | `timestamp`         | RFC3339 from RFC 5424 header        | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>                |
| `severity_number`              | `severity`          | OTel numeric (5=DEBUG … 24=FATAL4)  | <https://opentelemetry.io/docs/specs/otel/logs/data-model/>                |
| `service.name`                 | `appname`           | RFC 5424 APP-NAME field             | <https://opentelemetry.io/docs/specs/semconv/resource/#service>            |
| `host.name`                    | `hostname`          | RFC 5424 HOSTNAME field             | <https://opentelemetry.io/docs/specs/semconv/resource/host/>               |
| `attrs.log.source`             | —                   | Always `"syslog"`                   | —                                                                          |
| `attrs.log.record.uid`         | —                   | Generated UUID per event            | <https://opentelemetry.io/docs/specs/semconv/general/logs/>                |
| `attrs.log.record.original`    | —                   | Reconstructed syslog header         | <https://opentelemetry.io/docs/specs/semconv/general/logs/>                |
| `attrs.syslog.severity.text`   | `severity`          | Keyword: `"info"`, `"err"`, …       | —                                                                          |
| `attrs.syslog.severity.code`   | `severity`          | Numeric 0–7 (emerg=0 … debug=7)     | —                                                                          |
| `attrs.syslog.facility.name`   | `facility`          | Keyword: `"daemon"`, `"user"`, …    | —                                                                          |
| `attrs.process.pid`            | `procid`            | String (RFC 5424 procid is untyped) | <https://opentelemetry.io/docs/specs/semconv/attributes-registry/process/> |
| `attrs.syslog.message_id`      | `msgid`             | RFC 5424 MSGID (optional)           | —                                                                          |
| `attrs.syslog.structured_data` | `structured_data`   | JSON-encoded SD elements (optional) | —                                                                          |

### Severity mapping (syslog → OTel)

| RFC 5424 keyword | code | `severity_number` | OTel level |
| ---------------- | ---- | ----------------- | ---------- |
| `emerg`          | 0    | 24                | FATAL4     |
| `alert`          | 1    | 23                | FATAL3     |
| `crit`           | 2    | 21                | FATAL      |
| `err`            | 3    | 17                | ERROR      |
| `warning`        | 4    | 13                | WARN       |
| `notice`         | 5    | 9                 | INFO       |
| `info`           | 6    | 9                 | INFO       |
| `debug`          | 7    | 5                 | DEBUG      |

### LXC journal events (from `route_builtin._unmatched`)

Fields follow the standard journald-to-OTLP mapping defined in
`catalog/nix/modules/lxc-o11y-agent/config/vector/sources.journald.yaml`.
The service running in this LXC is `pve-prometheus-exporter`.

## VictoriaLogs query examples

```text
# All syslog errors from the Proxmox host
log.source:syslog severity_number:>=17

# SSH logins on the Proxmox host
log.source:syslog service.name:sshd

# Kernel OOM kills on the Proxmox host
log.source:syslog service.name:kernel _msg:"oom-kill"

# systemd unit state changes on the Proxmox host
log.source:syslog service.name:systemd _msg:"Started"

# All warnings and errors in the last hour
log.source:syslog severity_number:>=13

# LXC's own pve-exporter service logs (from journald)
log.source:journald host.name:pve-exporter

# Ingestion validation errors for syslog events
service.name:vector-ingest attrs.err.original_service:unknown
```
