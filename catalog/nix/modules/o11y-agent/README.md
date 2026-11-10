# `o11y-agent` — LXC observability agent

A reusable NixOS module (`catalog.o11yAgent`, flake output `nixosModules.o11yAgent`) that makes any Proxmox LXC
observable: it ships the systemd journal, host metrics and, optionally, syslog and Prometheus-scraped metrics to the
central `o11y` appliance as **OTLP/HTTP**. One
[OpenTelemetry Collector contrib](https://opentelemetry.io/docs/collector/) process (`otelcol-contrib`) runs as the
`o11y-agent` systemd unit (user `o11y-agent`, state in `/var/lib/o11y-agent`). The appliance accepts nothing else than
OTLP on `:4318` (see
[`o11y-datastore`](../../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/o11y-datastore/README.md) and
[ADR-018](../../../../docs/decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md)).

## Pipelines

```text
journald ─▶ transform/journald ─▶ groupbyattrs ─┐
syslog   ─▶ transform/syslog   ─▶ groupbyattrs ─┤  (logs.syslog.enable)     ─▶ processors.logs ─┐
hostmetrics ────────────────────────────────────┤  (metrics.hostMetrics)                        │
prometheus scrape (one config per job) ─────────┘  (metrics.scrapeTargets)  ─▶ processors.metrics┤
                                                                                                 ▼
                         resourcedetection (host.name) ─▶ resource ─▶ batch ─▶ otlphttp ─▶ <o11y.endpoint>/v1/*
```

| Pipeline        | Receiver                       | Enabled when                                           | Result                                                         |
| --------------- | ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------- |
| `logs/journald` | `journald` (from now on)       | always                                                 | One OTLP log record per journal entry                          |
| `logs/syslog`   | `syslog` (RFC 5424, TCP)       | `logs.syslog.enable`                                   | One OTLP log record per message, `service.name` from `appname` |
| `metrics`       | `hostmetrics` and `prometheus` | `metrics.enable` and (`hostMetrics` or scrape targets) | OTel-native host metrics, plus one scrape config per job       |

- **Logs.** The journald body (a map of journal fields) is reduced to `MESSAGE`. `SYSLOG_IDENTIFIER` (fallback `_COMM`)
  becomes the `service.name` resource attribute, `PRIORITY` the OTel severity (0-2 `FATAL`, 3 `ERROR`, 4 `WARN`, 5-6
  `INFO`, 7 `DEBUG`), `_SYSTEMD_UNIT` and `_PID` the `systemd.unit` and `process.pid` attributes. Messages are forwarded
  raw: there is no per-service parsing. Parse at query time in VictoriaLogs (`| unpack_json`).
- **Host metrics.** The `hostmetrics` receiver (cpu, load, memory, network, paging, processes, system, filesystem; no
  disk scraper, `/proc/diskstats` is host-wide in an LXC) replaces node-exporter. Metric names look like
  `system_cpu_load_average_1m` once stored.
- **Prometheus scraping** is only for applications that expose nothing else. A `host_name` entry in `extraLabels` is
  promoted to the `host.name` resource attribute, so a job scraping a remote machine is attributed to it.
- **Own telemetry.** The collector pushes its own metrics as OTLP (`service.telemetry` periodic reader, same interval),
  no self-scrape.
- **Resource attributes.** `host.name` comes from `resourcedetection` (OS hostname, never overrides an existing value;
  `os.type` disabled). `server.port` and `url.scheme`, added by the Prometheus receiver, are dropped.
- **Buffering.** The exporter queue is persisted with `file_storage` in `/var/lib/o11y-agent`: telemetry survives an
  appliance outage or an agent restart. A `memory_limiter` caps the collector at 128 MiB.

## Use it

Import the module from the catalog flake, then enable it.

```nix
# flake.nix
inputs.arcane = {
  url = "path:../../../../../../catalog/nix";
  inputs.nixpkgs.follows = "nixpkgs";
};

outputs = { self, nixpkgs, arcane, ... }: {
  nixosConfigurations.default = nixpkgs.lib.nixosSystem {
    system = "x86_64-linux";
    modules = [ arcane.nixosModules.o11yAgent ./modules ];
  };
};
```

**Minimal: journal and host metrics.**

```nix
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    metrics.enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";
  };
}
```

**Full: syslog, scrape targets, hosts override** (as in `pve-exporter`).

```nix
{ ... }: {
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";

    logs.syslog.enable = true; # TCP :5140, open it in the firewall yourself

    metrics = {
      enable = true;
      scrapeInterval = 30;
      scrapeTargets = [
        { jobName = "zot"; targets = [ "127.0.0.1:5000" ]; }
        {
          jobName = "node_exporter_pve";
          targets = [ "10.0.0.11:9100" ];
          extraLabels = { host_name = "pve-01"; }; # attributed to pve-01, not to this LXC
        }
      ];
    };

    # Resolve the appliance to its bridge IP (avoids hairpin NAT)
    hostsOverride = { "10.0.0.22" = [ "data.o11y.chezmoi.sh" ]; };
  };
}
```

**Extra processors: drop debug logs, redact an attribute.** Each entry is inserted after the built-in mapping and before
resource detection; its id is `<type>/user-<name>`.

```nix
{ ... }: {
  catalog.o11yAgent.processors = {
    logs = [
      {
        name = "drop-debug";
        type = "filter";
        config.logs.log_record = [ "severity_number < SEVERITY_NUMBER_INFO" ];
      }
    ];
    metrics = [
      {
        name = "drop-noise";
        type = "filter";
        config.metrics.metric = [ ''name == "process_threads"'' ];
      }
    ];
  };
}
```

`processors.logs` applies to every log pipeline (journald and syslog), `processors.metrics` to the metrics pipeline.

## Options

| Option                      | Type                   | Default        | Description                                                                |
| --------------------------- | ---------------------- | -------------- | -------------------------------------------------------------------------- |
| `enable`                    | bool                   | `false`        | Enable the agent                                                           |
| `o11y.endpoint`             | string                 | _(required)_   | OTLP/HTTP base URL of the appliance; the signal paths `/v1/*` are appended |
| `logs.syslog.enable`        | bool                   | `false`        | RFC 5424 syslog TCP listener, forwarded as OTLP logs                       |
| `logs.syslog.listenAddress` | string                 | `0.0.0.0:5140` | Syslog listen address                                                      |
| `metrics.enable`            | bool                   | `false`        | Enable metrics shipping                                                    |
| `metrics.hostMetrics`       | bool                   | `true`         | Collect host metrics with the OTel `hostmetrics` receiver                  |
| `metrics.scrapeInterval`    | positive int           | `30`           | Collection and scrape interval in seconds                                  |
| `metrics.scrapeTargets`     | list of submodules     | `[]`           | One entry per Prometheus job (below)                                       |
| `processors.logs`           | list of submodules     | `[]`           | Extra processors for the log pipelines (below)                             |
| `processors.metrics`        | list of submodules     | `[]`           | Extra processors for the metrics pipeline (below)                          |
| `hostsOverride`             | `attrsOf (listOf str)` | `{}`           | Static `/etc/hosts` entries (`networking.hosts`)                           |

Each `metrics.scrapeTargets` entry:

| Field         | Type          | Description                                                                                                               |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `jobName`     | string        | Prometheus job name (becomes the OTel `service.name` of the scraped series)                                               |
| `targets`     | `listOf str`  | `host:port` (path `/metrics`), `host:port/path?query` or a full URL. All targets of a job share the path of the first one |
| `extraLabels` | `attrsOf str` | Static labels on every series of the job. `host_name` is promoted to the `host.name` resource attribute                   |

Each `processors.logs` and `processors.metrics` entry:

| Field    | Type                  | Description                                                         |
| -------- | --------------------- | ------------------------------------------------------------------- |
| `name`   | string (`[a-z0-9-]+`) | Unique short name; the processor id is `<type>/user-<name>`         |
| `type`   | string                | Collector processor type (`transform`, `filter`, `attributes`, ...) |
| `config` | attrs                 | Processor configuration, as in the collector YAML (default `{}`)    |

The generated collector configuration is validated with `otelcol-contrib validate` at build time: a broken config fails
the image build, not the service.

## Design notes

- **OpenTelemetry Collector, not Vector or vmagent.** The appliance ingests OTLP, and the Collector speaks it for all
  three signals and reads journald natively. Reasoning in
  [ADR-018](../../../../docs/decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md).
- **No per-service log parsing.** Parsers had to follow every upstream log format. Raw messages are stored and parsed at
  query time.
- **Buffer on the agent.** The persistent sending queue absorbs an appliance outage.
- **One scrape config per job.** Path, query string and scheme are per job; split a job whose targets need different
  paths.

## Further reading

- [`o11y-datastore`](../../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/o11y-datastore/README.md): the
  appliance that receives the data.
- [ADR-018](../../../../docs/decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md):
  why OTLP is the single ingest protocol.
