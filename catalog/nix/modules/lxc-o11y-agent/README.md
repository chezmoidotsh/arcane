# `lxc-o11y-agent` — LXC observability agent

A reusable NixOS module (`catalog.lxcAgent`) that makes any Proxmox LXC
fully observable: it ships its systemd journal logs and scrapes its local
Prometheus exporters, forwarding everything to the central `o11y` appliance.

***

## What it does

One Vector process runs two independent pipelines on the LXC:

```
┌─ LOGS ─────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  systemd journal  (current boot)                                           │
│       │                                                                    │
│       ▼  journald source                                                   │
│  journald_to_semconv        ◄── lib/vector/conf.d/sources.journald.yaml    │
│       │  journald fields → OTel SemConv / VictoriaLogs layout              │
│       │                                                                    │
│       ▼  [logs.extraTransforms]   user filters, if any                     │
│       │   else journald_to_o11y   auto passthrough (when none)             │
│       │                                                                    │
│       ▼  glob *_to_o11y                                                    │
│  out_logs ─────────────────────────────────────────▶  o11y in_vector       │
│           Vector native protocol · 256 MiB disk buffer (block)             │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌─ METRICS (optional) ───────────────────────────────────────────────────────┐
│                                                                            │
│  in_internal_metrics  (always shipped) ─────────────────────────────────┐  │
│                                                                         │  │
│  scrape_<job>  (prometheus_scrape, one source per job)                  │  │
│       │                                                                 │  │
│       ▼  tag_<job>  (stamps `job` label) ───────────────────────────────┤  │
│                                                                         │  │
│       ┌─────────────────────────────────────────────────────────────────┘  │
│       ▼                                                                    │
│  out_metrics ───────────────────────────────────▶  o11y VictoriaMetrics    │
│              prometheus_remote_write · 256 MiB disk buffer (drop-newest)   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Logs** — Vector reads the systemd journal natively (no extra daemon).
Fields are mapped once to the OTel SemConv / VictoriaLogs loki-like layout
and forwarded over the Vector native protocol. A 256 MiB disk buffer absorbs
o11y outages without dropping events.

**Metrics** — One `prometheus_scrape` source per job (required for per-job
labels). A remap transform stamps every series with `job` labels before
shipping via `prometheus_remote_write`. Vector's own internal metrics are
always included. A 256 MiB disk buffer absorbs outages; newest samples are
dropped when full (point-in-time data is replaceable).

***

## When to use it

Use `lxc-o11y-agent` on **every Proxmox LXC that runs NixOS with systemd**.

| Situation                                 |          Use this module?          |
| ----------------------------------------- | :--------------------------------: |
| NixOS LXC shipping journald logs to o11y  |               **Yes**              |
| NixOS LXC with local Prometheus exporters |     **Yes** (enable `metrics`)     |
| Non-NixOS container or bare-metal host    | **No** — configure Vector manually |

***

## How to use it

### 1. Add the catalog input to your flake

```nix
# flake.nix
inputs = {
  nixpkgs.url    = "github:NixOS/nixpkgs/nixos-unstable";
  arcane-catalog = {
    url = "path:../../../../../../catalog/nix";
    inputs.nixpkgs.follows = "nixpkgs";
  };
};
```

### 2. Import the module

```nix
# flake.nix — outputs
outputs = { self, nixpkgs, nixos-generators, arcane-catalog, ... }:
  nixos-generators.nixosGenerate {
    modules = [
      arcane-catalog.nixosModules.lxcAgent
      ./modules                          # your LXC-specific modules
    ];
  };
```

### 3. Configure in a module file

**Minimal — logs only:**

```nix
# modules/log-shipper.nix
{ ... }: {
  catalog.lxcAgent = {
    enable      = true;

    o11y.logsAddress = "10.0.0.252:6000";
    o11y.metricsUrl  = "https://o11y.chezmoi.sh/metrics/api/v1/write";
  };
}
```

**Full — logs + metrics + hosts override:**

```nix
# modules/log-shipper.nix
{ ... }: {
  catalog.lxcAgent = {
    enable      = true;

    o11y = {
      logsAddress = "o11y.chezmoi.sh:6000";    # hostname resolved via hostsOverride
      metricsUrl  = "https://o11y.chezmoi.sh/metrics/api/v1/write";
    };

    metrics = {
      enable         = true;
      scrapeInterval = 30;
      scrapeTargets  = [
        { jobName = "zot"; targets = [ "127.0.0.1:5000" ]; }
      ];
    };

    # Resolve o11y.chezmoi.sh to the Proxmox bridge IP instead of the public IP
    # (avoids hairpin NAT through the firewall)
    hostsOverride = {
      "10.0.0.252" = [ "o11y.chezmoi.sh" ];
    };
  };
}
```

**With a custom log transform loaded from a separate file:**

Keep complex transforms out of the Nix string by storing them as plain YAML
files next to the module and loading them with `builtins.readFile`:

```
modules/
├── log-shipper.nix
└── vector/
    └── transforms.parse-caddy.yaml   ← the Vector config fragment
```

```nix
# modules/log-shipper.nix
{ ... }: {
  catalog.lxcAgent = {
    enable      = true;

    o11y.logsAddress = "o11y.chezmoi.sh:6000";
    o11y.metricsUrl  = "https://o11y.chezmoi.sh/metrics/api/v1/write";

    logs.extraTransforms = [
      {
        name    = "transforms.parse-caddy.yaml";
        content = builtins.readFile ./vector/transforms.parse-caddy.yaml;
      }
    ];
  };
}
```

```yaml
# modules/vector/transforms.parse-caddy.yaml
transforms:
  parse_caddy_json:
    type: remap
    inputs: [journald_to_semconv]
    source: |
      if is_string(._msg) {
        parsed, err = parse_json(._msg)
        if err == null { . = merge(., parsed) }
      }
  journald_to_o11y:
    type: filter
    inputs: [parse_caddy_json]
    condition:
      type: vrl
      source: "true"
```

> When `extraTransforms` is non-empty, you are responsible for exposing at
> least one component named `*_to_o11y`. The auto-generated passthrough is
> omitted.

***

## Configuration reference

### Top-level options

| Option          | Type                   | Default | Description                                      |
| --------------- | ---------------------- | ------- | ------------------------------------------------ |
| `enable`        | bool                   | `false` | Enable the agent                                 |
| `hostsOverride` | `attrsOf (listOf str)` | `{}`    | Static `/etc/hosts` entries (`networking.hosts`) |

### `o11y` options

| Option        | Type   | Description                                                          |
| ------------- | ------ | -------------------------------------------------------------------- |
| `logsAddress` | string | Vector native address on o11y — `host:port` (e.g. `10.0.0.252:6000`) |
| `metricsUrl`  | string | Prometheus `remote_write` endpoint on o11y                           |

### `logs` options

| Option            | Type | Default | Description                                                                                      |
| ----------------- | ---- | ------- | ------------------------------------------------------------------------------------------------ |
| `extraTransforms` | list | `[]`    | Additional Vector config fragments injected into `conf.d/`. See [Annex C](#c--extra-transforms). |

Each `extraTransforms` entry:

| Field     | Type   | Description                                                                               |
| --------- | ------ | ----------------------------------------------------------------------------------------- |
| `name`    | string | Filename under `conf.d/` (e.g. `transforms.parse-nginx.yaml`). Must be unique.            |
| `content` | string | Full YAML or JSON Vector config fragment. Must expose at least one `*_to_o11y` component. |

### `metrics` options

| Option           | Type         | Default | Description                        |
| ---------------- | ------------ | ------- | ---------------------------------- |
| `enable`         | bool         | `false` | Enable Prometheus metrics scraping |
| `scrapeInterval` | positive int | `30`    | Global scrape interval in seconds  |
| `scrapeTargets`  | list         | `[]`    | Jobs to scrape                     |

Each `scrapeTargets` entry:

| Field     | Type         | Description                                                                   |
| --------- | ------------ | ----------------------------------------------------------------------------- |
| `jobName` | string       | Becomes the `job` label. Must be a valid Nix identifier (alphanumeric + `_`). |
| `targets` | `listOf str` | Endpoints as `host:port`. `/metrics` is appended automatically.               |

***

## Annexes

### A — Journald → SemConv field mapping

The `journald_to_semconv` transform discards all raw journald fields and
produces only these keys:

| Journald field                | SemConv field                         | Notes                         |
| ----------------------------- | ------------------------------------- | ----------------------------- |
| `MESSAGE`                     | `_msg`                                |                               |
| `timestamp`                   | `_time`                               | RFC 3339                      |
| `_HOSTNAME`                   | `host.name`                           | resource                      |
| `SYSLOG_IDENTIFIER` / `_COMM` | `service.name`                        | resource, `_COMM` as fallback |
| `_PID`                        | `attr.process.pid`                    | integer                       |
| `_COMM`                       | `attr.process.executable.name`        | OTel semconv                  |
| `PRIORITY`                    | `attr.syslog.severity.code` + `.text` | numeric 0–7                   |
| `SYSLOG_FACILITY`             | `attr.syslog.facility.code`           | numeric                       |
| `SYSLOG_MSGID`                | `attr.syslog.message_id`              |                               |
| `_SYSTEMD_UNIT`               | `attr.systemd.unit`                   |                               |
| `_TRANSPORT`                  | `attr.journald.transport`             |                               |
| `_TRANSPORT` (stdout/stderr)  | `attr.log.iostream`                   |                               |
| *(generated)*                 | `attr.log.record.uid`                 | UUID v4                       |
| *(reconstructed)*             | `attr.log.record.original`            | OTel semconv                  |
| *(generated)*                 | `attr.observed_timestamp`             |                               |
| *(generated)*                 | `attr.log.src`                        |                               |

SemConv **validation is not performed here** — it runs on the o11y side
(`transforms.validate_semconv` in the o11y Vector pipeline).

### B — Config directory layout

The module assembles a Vector `--config-dir` from static and generated files,
all baked into the Nix store:

```
conf.d/
├── sources.journald.yaml         static — journald source + semconv remap
├── sources.prometheus.json       generated — internal metrics + scrape targets
│                                           (only when metrics.enable = true)
├── sinks.vector.json             generated — Vector native log sink
├── sinks.prometheus.json         generated — prometheus_remote_write sink
│                                           (only when metrics.enable = true)
├── transforms.passthrough.json   generated — filter passthrough journald→o11y
│                                           (only when extraTransforms = [])
└── <name>                        generated — one file per extraTransforms entry
```

Cross-file component references (e.g. `journald_to_semconv` defined in the
static YAML, consumed by `sinks.vector.json` via the `*_to_o11y` glob) are
resolved by Vector at startup.

### C — Extra transforms

`logs.extraTransforms` is the extension point for per-LXC log processing.
When non-empty, the auto-generated `journald_to_o11y` passthrough is **not**
injected — your transform must close the pipeline by exposing a component
named `*_to_o11y`.

The upstream component is always `journald_to_semconv`.

```
journald_to_semconv
        │
        ▼
  [your transforms]
        │
        ▼
  *_to_o11y   ◄── consumed by the log sink (glob match)
```

Common patterns:

```yaml
# Drop debug-level entries
transforms:
  journald_to_o11y:
    type: filter
    inputs: [journald_to_semconv]
    condition:
      type: vrl
      source: .["attr.syslog.severity.code"] < 7
```

```yaml
# Parse a structured JSON body before forwarding
transforms:
  parse_json:
    type: remap
    inputs: [journald_to_semconv]
    source: |
      if is_string(._msg) {
        parsed, err = parse_json(._msg)
        if err == null { . = merge(., parsed) }
      }
  journald_to_o11y:
    type: filter
    inputs: [parse_json]
    condition:
      type: vrl
      source: "true"
```

### D — Testing and validation

Config validation is **baked into the config derivation itself** — `vector validate`
runs as a build step of `configDir`, which the systemd service already depends on.
Any `nixos-rebuild switch` or `nix build .#nixosConfigurations.<host>.config.system.build.toplevel`
will fail fast if the assembled config is invalid, without needing any extra wiring.

`system.build.lxc-agent-test` is an alias to `configDir` for explicit
CI or debugging use:

```sh
nix build .#nixosConfigurations.<host>.config.system.build.lxc-agent-test
```

To test the static journald transform in isolation (30+ inline unit tests):

```sh
vector test ./lib/vector/conf.d/sources.journald.yaml
```

### E — Design rationale

**Why Vector journald source directly, not a syslog forwarder?**
Vector's native `journald` source reads structured journal data for the
current boot without an intermediate daemon (no `rsyslog`, no `journalbeat`).
It preserves all metadata fields and keeps the LXC footprint minimal.

**Why Vector native protocol instead of syslog TCP to o11y?**
Sending pre-parsed SemConv events via the Vector native protocol skips the
`syslog_to_semconv` transform on the o11y side — parsing happens once, on
the source LXC. The o11y pipeline still runs `validate_semconv` and
`add_timestamps` on received events.

**Why one scrape source per job?**
Vector's `prometheus_scrape` source does not support per-endpoint labels.
Separate sources allow each job to receive its correct `job` label via a
dedicated `tag_<job>` remap transform.

**Why a disk buffer for logs but drop-newest for metrics?**
Log events are immutable and irreplaceable — every event matters, so the log
sink blocks when the buffer is full. Metric samples are point-in-time and
replaceable; dropping the newest is acceptable and prevents backpressure from
stalling the log pipeline.
