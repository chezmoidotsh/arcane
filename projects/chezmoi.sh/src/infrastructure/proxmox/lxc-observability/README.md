# `o11y.chezmoi.sh` — VictoriaMetrics observability LXC (Proxmox)

Standalone Proxmox LXC running NixOS + the VictoriaMetrics stack. Serves
`https://o11y.chezmoi.sh` as the homelab's central, cluster-independent
observability appliance: metrics, logs, traces, and *existential* alerting.

It deliberately lives **outside** every Kubernetes cluster's failure domain.
When a cluster (or its node) goes down, the appliance keeps collecting and
keeps the existential alerts (cluster/Grafana down) firing — closing the "we had
no signal" gap that drove every recent post-mortem (see [#1013], [#1018]). Same
NixOS-as-code, GPG-signed, single-purpose-appliance philosophy as the
`lxc-oci-registry`.

> **Status** — implements the metrics + logs ingest and existential alerting of
> \#1018 (ADR-013). Per-cluster alerting + recording rules live in each cluster's
> own vmalert (`VMRule`/`PrometheusRule`); Grafana on `amiya` holds dashboards.
> Cluster-side resources are tracked separately (see
> [Known gaps](#known-gaps--follow-ups)).

## Table of contents

1. [Architecture](#architecture)
2. [What's in this directory](#whats-in-this-directory)
3. [Prerequisites](#prerequisites)
4. [Secrets](#secrets)
5. [Build & deploy](#build--deploy)
6. [Proxmox LXC creation](#proxmox-lxc-creation)
7. [Proxmox host firewall](#proxmox-host-firewall)
8. [Cluster-side integration](#cluster-side-integration)
9. [Hardening reference](#hardening-reference)
10. [Operations](#operations)
11. [Troubleshooting](#troubleshooting)
12. [Known gaps / follow-ups](#known-gaps--follow-ups)

## Architecture

```text
 SOURCES (push over TLS — LAN by source CIDR, or tailnet)     LXC APPLIANCE (Proxmox)

   VMAgent    ──/metrics──▶ ┐
   Vector     ──/logs────▶  │                ┌─▶ VictoriaMetrics :8428 (+OTLP)
   vmalert    ──/alerts──▶  ├─▶ Caddy :443 ──┼─▶ VictoriaLogs    :9428
   (VMRule)                 │   (path route, ├─▶ VictoriaTraces  :10428
   OTEL/OTLP  ──/metrics──▶ │    no auth)    └─▶ Alertmanager    :9093 ──┐
   kazimierz  ──tailnet──▶  ┘                                            │
                            LXC vmalert :8880 ──▶ Alertmanager           │  page channel
                            (cluster/Grafana down + watchdog)            ├─▶ ntfy / Slack
                            data → /var/lib/victoria (mp0)               │  deadman (TBD)
                                                                         ▼
   amiya Grafana ──query──▶ dashboards + non-paging alerts      + deadman heartbeats ─┘
                            + its own deadman heartbeat
```

The LXC vmalert evaluates only the existential page-tier (cluster absent, Grafana
down, watchdog/deadman). Per-cluster `vmalert` evaluates that cluster's
`VMRule`/`PrometheusRule` (records + page-worthy alerts) against the central VM and
notifies the central Alertmanager through Caddy; non-paging alerts are routed by
Grafana. Access control is the **Proxmox host firewall by source CIDR** (LAN) plus
the **tailnet** (off-LAN). Rendered diagram:
[`assets/architecture.svg`](./assets/architecture.svg) (source
[`architecture.d2`](./architecture.d2)).

### Design decisions (the short version — full rationale in ADR-013)

* **VictoriaMetrics, not ClickHouse** — Prometheus-compatible, resource-light,
  native `ServiceMonitor` support via the cluster-side VM Operator.
* **Centralized LXC, not per-cluster** — one store, multi-cluster correlation
  for free, independent of the failure domains it observes. Adding a cluster =
  deploying collection agents pointed here.
* **Single-node VM + `cluster` label, not multi-tenancy** — every series carries
  a `cluster` external label from the sender; one flat store, trivial correlation.
* **No ingest/query auth — Proxmox firewall by source CIDR.** For a single-owner
  homelab the subnet boundary is sufficient; the write/read separation of an auth
  proxy is not worth its operational weight. Re-introducing per-credential auth
  later is a drop-in `vmauth` in front of the backends. *(Trade-off: any host on
  the allow-listed subnet can read and write.)*
* **Clean, versioned, signal-typed paths** — no auth proxy; Caddy routes by a
  `/<signal>/*` scheme: `/metrics/*` → VictoriaMetrics, `/logs/*` →
  VictoriaLogs, `/traces/*` → VictoriaTraces, `/alerts/*` → Alertmanager.
  VM/VLogs/VTraces prefixes are stripped; Alertmanager keeps its prefix.
* **Proxmox host metrics via OTEL/OTLP** — the Proxmox OTEL metric server pushes
  to `…/metrics/opentelemetry/v1/metrics` (VictoriaMetrics' native OTLP endpoint).
* **Routing rule: if it pages → Alertmanager, otherwise → Grafana.** Alertmanager
  is reserved for the **page-tier** — the critical alerts that wake you up (loss of
  a cluster, loss of Grafana, node/disk/PVC down). Everything else (warnings, FYI,
  per-app SLOs) is evaluated and routed by **Grafana**, whose contact points /
  notification policies are far simpler to manage than Alertmanager receivers.
* **Recording rules + page-tier cluster alerts → per-cluster vmalert (VMRule).**
  Each cluster runs a vmalert (VictoriaMetrics Operator, reading `VMRule` /
  `PrometheusRule`) that evaluates that cluster's **recording rules** (Grafana
  cannot persist these) and any **page-worthy** alerts against the central VM,
  writes records back, and notifies the central Alertmanager. Rules live in the
  cluster's ArgoCD repo — no LXC rebuild. Edge cardinality reduction is `vmagent`
  stream aggregation. The LXC keeps a *minimal* set of **existential,
  cluster-independent** page rules (cluster absent, node/disk/PVC, self, Watchdog)
  so paging survives even an amiya outage.
* **Alertmanager is centralized and exposed under `/alerts`** — both the
  LXC's existential vmalert and each cluster's vmalert reach it, so paging is
  cluster-independent. Grafana never gates paging.
* **Tailscale membership via caddy-tailscale** — Tailscale is embedded directly
  in Caddy using [caddy-tailscale](https://github.com/tailscale/caddy-tailscale)
  (tsnet, userspace networking). No separate `tailscaled` daemon and no kernel
  `/dev/net/tun` device required. Off-LAN sources (the `kazimierz.akn` VPS) reach
  the appliance at `observability.<tailnet>.ts.net`; TLS for that hostname is issued
  automatically by Tailscale's ACME. The loopback backends remain unreachable over
  the tailnet — the tsnet listener runs inside the Caddy process, not via a kernel
  interface.
* **Two Dead-Man's-Switches (external service TBD)** — the LXC Alertmanager
  heartbeats an external monitor every minute (catches appliance death); a Grafana
  always-on rule heartbeats it too (catches amiya/Grafana death). If either stops,
  the external monitor pages. The external service is **not yet chosen** — candidates
  include healthchecks.io or a Cloudflare-based check; `ALERTMANAGER_DEADMAN_URL` is
  the placeholder for whatever we land on.

### Ports

| Service         | Bind              | Exposed?                                                                               |
| --------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Caddy           | `:80`, `:443`     | **Yes** — the only public surface                                                      |
| VictoriaMetrics | `127.0.0.1:8428`  | No (behind Caddy; also OTLP ingest)                                                    |
| VictoriaLogs    | `127.0.0.1:9428`  | No (behind Caddy)                                                                      |
| VictoriaTraces  | `127.0.0.1:10428` | No (behind Caddy; OTLP/Jaeger ingest)                                                  |
| vmalert         | `127.0.0.1:8880`  | No (self-scrape only)                                                                  |
| Alertmanager    | `127.0.0.1:9093`  | Via Caddy `/alerts/*` (cluster vmalert → notify); egress for notifications + heartbeat |

## What's in this directory

```text
.
├── README.md              ← you are here
├── architecture.d2        ← diagram source (→ assets/architecture.svg)
├── flake.nix              ← LXC image build (nixos-generators) + image version
├── flake.lock             ← pinned inputs
├── configuration.nix      ← site identity, shared `victoria` user, console toolbox
├── modules/
│   ├── default.nix            ← module aggregator
│   ├── victoriametrics.nix    ← metrics TSDB (+ OTLP) + self-scrape
│   ├── victorialogs.nix       ← log store
│   ├── victoriatraces.nix     ← tracing store (OTLP/Jaeger)
│   ├── vmalert.nix            ← existential rule evaluation
│   ├── alertmanager.nix       ← page-tier alerts + deadman switch
│   ├── caddy.nix              ← TLS termination + path routing + caddy-tailscale tsnet
│   └── hardening.nix          ← sysctl, firewall, login surface, journald
├── alerts/                ← LXC vmalert rule groups (baked; existential-only)
│   ├── watchdog.rules.yaml             ← Dead-Man's-Switch
│   ├── self.rules.yaml                 ← appliance self-monitoring
│   └── cluster-availability.rules.yaml ← cluster absent + Grafana down
│                                          (node/disk/PVC/crash-loop → per-cluster VMRule)
├── .mise.toml             ← mise tasks (secrets / build)
├── .mise/tasks/lxc/       ← build / push / upgrade scripts
└── secrets/
    ├── caddy.sops.env          ← SOPS: CLOUDFLARE_API_TOKEN
    └── observability.sops.env  ← SOPS: Alertmanager notify + deadman URLs
```

## Prerequisites

* `mise` with the repo's `.mise.toml` trusted (`mise trust`).
* Docker (used by `nix:build:lxc` to wrap the Nix build).
* `sops` with the repo age key loaded (`SOPS_AGE_KEY_FILE` already set by mise).
* `kubectl` configured for `amiya.akn` (only for `lxc:secrets:sync`).
* SSH key-based root access to the Proxmox node you push to.

## Secrets

Two SOPS/age-encrypted dotenv files, both baked into the image at build time and
matched by the `.sops.yaml` rule for `proxmox/*/secrets/*.sops.env`. **No
ingest/query credentials** — access control is the host firewall.

| File                             | Keys                                            | Source     |
| -------------------------------- | ----------------------------------------------- | ---------- |
| `secrets/caddy.sops.env`         | `CLOUDFLARE_API_TOKEN`, `TAILSCALE_OAUTH_KEY`   | Crossplane |
| `secrets/observability.sops.env` | `SLACK_WEBHOOK_URL`, `ALERTMANAGER_DEADMAN_URL` | operator   |

Both tokens in `caddy.sops.env` are Crossplane-provisioned and consumed exclusively
by the Caddy process — `CLOUDFLARE_API_TOKEN` for DNS-01 ACME and `TAILSCALE_OAUTH_KEY`
for caddy-tailscale's tsnet node (tag `tag:o11y`). `SLACK_WEBHOOK_URL` is the Slack
incoming webhook for the `#notifications` channel (page-tier alerts).

### First-time setup

```sh
# 1. Fill in the Slack webhook and heartbeat URL.
sops secrets/observability.sops.env
#    → SLACK_WEBHOOK_URL       (Slack incoming webhook — https://hooks.slack.com/services/…)
#    → ALERTMANAGER_DEADMAN_URL (e.g. https://hc-ping.com/<uuid>)

# 2. Cloudflare DNS-01 token + Tailscale OAuth key.
#    Once the Crossplane resources are Ready (see Known gaps):
mise run lxc:secrets:sync
#    …or set them manually until then:
printf 'CLOUDFLARE_API_TOKEN=<token>\nTAILSCALE_OAUTH_KEY=<key>\n' | \
  sops -e --input-type dotenv --output-type dotenv /dev/stdin > secrets/caddy.sops.env
```

> **Migrating from `ALERTMANAGER_NOTIFY_URL`**: if you already have an
> `observability.sops.env` with the old key, run
> `sops secrets/observability.sops.env`, rename `ALERTMANAGER_NOTIFY_URL` to
> `SLACK_WEBHOOK_URL` (paste the Slack webhook URL), and re-save.

## Build & deploy

```sh
mise run lxc:build              # build the tarball with secrets baked in
mise run lxc:push -- pve.lan    # upload to /var/lib/vz/template/cache/
```

## Proxmox LXC creation

The build emits `observability.<version>-amd64.tar.xz`. Unlike the stateless
oci-registry, **this appliance is stateful** — the `mp0` volume holds the TSDB,
logs, and Alertmanager state, so it needs a real data volume and backups.

```sh
VMID="<vmid>"   # pick an unused id — `pct list` shows used ones.
TEMPLATE=observability.<version>-amd64.tar.xz
NODE=pve.lan

# 1. Create the container — do NOT start yet.
ssh root@${NODE} pct create ${VMID} local:vztmpl/${TEMPLATE} \
    --hostname     observability \
    --description  "Observability appliance (VictoriaMetrics) — managed by chezmoidotsh/arcane" \
    --ostype       nixos \
    --arch         amd64 \
    --unprivileged 1 \
    --features     nesting=0,keyctl=0 \
    --cores        2 \
    --memory       4096 \
    --swap         0 \
    --rootfs       local-zfs:4 \
    --mp0          local-zfs:64,mp=/var/lib/victoria \
    --net0         name=eth0,bridge=vmbr0,ip=dhcp,firewall=1 \
    --onboot       1

# 2. Wire up the console device for `pct console <vmid>`.
#    caddy-tailscale uses tsnet (userspace) — no /dev/net/tun passthrough needed.
ssh root@${NODE} "cat >> /etc/pve/lxc/${VMID}.conf <<'EOF'
lxc.console.path: /dev/console
EOF"
```

> **Before starting — fix mp0 ownership (unprivileged LXC).**
> Proxmox creates the volume as host uid 0 (`nobody` inside the container). The
> shared `victoria` user is uid 980 → host uid `100000 + 980 = 100980`.
>
> ```sh
> VMID="<vmid>"
> # Verify mapping: grep ^root /etc/subuid  (expect root:100000:65536)
> pct mount ${VMID}
> chown -R 100980:100980 /var/lib/lxc/${VMID}/rootfs/var/lib/victoria
> pct unmount ${VMID}
> ```

```sh
# 3. Start.
ssh root@${NODE} pct start ${VMID}
```

### Resource sizing — starting values

| Workload            | Recommended                                         |
| ------------------- | --------------------------------------------------- |
| CPU                 | 2 vCPU                                              |
| Memory              | 4 GiB (VM `-memory.allowedPercent=60`)              |
| Root disk (OS only) | 4 GiB (stateless, rebuilt from flake)               |
| Data volume (`mp0`) | 64 GiB at `/var/lib/victoria` (raise per retention) |
| Swap                | 0                                                   |

Retention defaults: metrics **6 months**, logs **30 days**.

## Proxmox host firewall

This is the access control for the **LAN** path, so it carries real weight. :443
is opened to the homelab subnet only (not the world); every backend binds
loopback behind Caddy. Off-LAN sources (kazimierz) arrive over the **tailnet**,
not eth0 — that path is gated by Tailscale ACLs and the `tailscale0` trusted
interface, not by these PVE rules.

```sh
VMID="<vmid>"
cat <<'EOF' >/etc/pve/firewall/${VMID}.fw
[OPTIONS]
enable: 1
policy_in: DROP
policy_out: ACCEPT
ndp: 1
dhcp: 1
log_level_in: nolog
log_level_out: nolog

[RULES]
# HTTPS ingest + query from the LAN — restrict source to the homelab subnet.
IN ACCEPT -p tcp -dport 443 -source 10.0.0.0/8  -log nolog # homelab (tighten to node subnet)
IN ACCEPT -p tcp -dport 80                       -log nolog # HTTP → HTTPS redirect
IN ACCEPT -p udp -dport 41641                    -log nolog # Tailscale direct connections
IN ACCEPT -p icmp                                -log nolog # liveness
EOF
pve-firewall restart
```

> Tighten the homelab CIDR to the actual cluster-node subnet if you can — on the
> LAN path this rule *is* the security boundary. Tailnet traffic is handled entirely
> by caddy-tailscale's tsnet (userspace WireGuard inside the Caddy process) — there
> is no `tailscale0` kernel interface and no `100.64.0.0/10` eth0 rule needed. UDP
> 41641 enables direct peer connections; tsnet falls back to DERP relays if closed.
> `policy_out: ACCEPT` is required for Alertmanager notifications, the deadman
> heartbeat, ACME, and Tailscale control-plane + DERP egress.

## Cluster-side integration

The appliance only **receives**. Each source pushes to it. These resources are
NOT in this directory — they live in each cluster's project. Snippets below are
the contract. No credentials: reachability is gated by the host firewall.

Install the VictoriaMetrics Operator on each cluster, then deploy a **VMAgent**
(collection, no local storage) and a **VMAlert** (rule evaluation). Rules are
ordinary `VMRule` / `PrometheusRule` CRDs in the cluster's ArgoCD-managed repo —
adding or changing one is a normal GitOps commit, **no LXC rebuild**.

### Kubernetes clusters — metrics (VMAgent, with optional edge aggregation)

```yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMAgent
metadata: { name: o11y-shipper }
spec:
  selectAllByDefault: true            # pick up every ServiceMonitor/PodMonitor
  externalLabels:
    cluster: lungmen                  # ← the label everything routes on
  remoteWrite:
    - url: https://o11y.chezmoi.sh/metrics/api/v1/write
  # Optional: stream aggregation — reduce cardinality at the edge BEFORE
  # remote_write (windowed total/increase/rate/histogram/dedup). This is the
  # "agent does aggregations" path; it is NOT PromQL recording rules (those are
  # VMRule, evaluated by VMAlert below).
  # streamAggrConfig:
  #   rules:
  #     - match: '{__name__=~"container_.*"}'
  #       interval: 1m
  #       outputs: [total]
  #       by: [cluster, namespace, pod]
```

### Kubernetes clusters — rules (VMAlert + VMRule)

```yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMAlert
metadata: { name: o11y-rules }
spec:
  evaluationInterval: 30s
  datasource:   { url: https://o11y.chezmoi.sh/metrics }            # query central VM
  remoteWrite:  { url: https://o11y.chezmoi.sh/metrics/api/v1/write } # recording-rule results
  remoteRead:   { url: https://o11y.chezmoi.sh/metrics }            # restore alert state
  notifiers:
    - url: https://o11y.chezmoi.sh/alerts                          # central Alertmanager
---
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMRule
metadata: { name: lungmen-app-rules }
spec:
  groups:
    - name: app-records           # recording rules ("records") — stored centrally
      rules:
        - record: cluster_namespace:pod_cpu:rate5m
          expr: sum by (cluster, namespace) (rate(container_cpu_usage_seconds_total[5m]))
    - name: app-alerts            # page-worthy alerts (→ Alertmanager); the node/disk/PVC
      rules:                      # and crash-loop guards now live here, per cluster
        - alert: PodCrashLooping
          expr: max by (cluster, namespace, pod, container) (kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"}) == 1
          for: 5m
          labels: { severity: page }
        - alert: DiskSpaceCritical      # the #1013 guard — now a per-cluster VMRule
          expr: (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}) > 0.85
          for: 10m
          labels: { severity: page }
        - alert: NodeDown
          expr: up{job=~".*node.*"} == 0
          for: 5m
          labels: { severity: page }
```

> The VM Operator also converts `PrometheusRule` CRDs when prometheus-conversion
> is enabled, so community mixin rule sets work unchanged.

### Kubernetes clusters — logs (Vector DaemonSet)

```toml
[sinks.victorialogs]
type = "elasticsearch"                # VictoriaLogs ES-compatible ingest
inputs = ["kubernetes_logs"]
endpoints = ["https://o11y.chezmoi.sh/logs/insert/elasticsearch"]
[sinks.victorialogs.query]
_msg_field = "message"
_stream_fields = "cluster,namespace,pod,container"   # set cluster=<name> in a transform
```

### Kubernetes clusters — traces (OTLP)

Point any OTLP trace exporter (Vector `opentelemetry` sink, an OTEL collector, or
an app's OTLP SDK) at the VictoriaTraces ingest path:

```
https://o11y.chezmoi.sh/traces/insert/opentelemetry/v1/traces
```

Set a `cluster=<name>` resource attribute for correlation. Query from Grafana via
the Jaeger/VictoriaTraces datasource at `https://o11y.chezmoi.sh/traces`.

### Proxmox host — metrics (OTEL)

Configure the Proxmox OTEL metric server to push OTLP/HTTP to
`https://o11y.chezmoi.sh/metrics/opentelemetry/v1/metrics` with an external
label `cluster=proxmox`.

### kazimierz (VPS, Docker) — over Tailscale

The appliance joins the tailnet as `observability` (tag `tag:o11y`) via
caddy-tailscale, so kazimierz's vmagent + Vector (Docker, Ansible-managed) reach
it over the encrypted tailnet — `externalLabels: { cluster: kazimierz }`. Point
them at `https://observability.<tailnet>.ts.net` directly; TLS is valid for that
MagicDNS name without any split-DNS override.

### Grafana (amiya) — dashboards + the Grafana-side deadman

Two datasources (no auth): Prometheus-type → `https://o11y.chezmoi.sh/metrics`,
VictoriaLogs-type → `https://o11y.chezmoi.sh/logs` *(verify the query path for
the installed VictoriaLogs version — see Known gaps)*. Grafana is for
**dashboards** and **non-paging alert routing** — page-tier alerting/recording
rules live in VMRule per cluster (above). The
one alerting Grafana keeps: a single **always-firing rule wired to the external
heartbeat**, so an amiya/Grafana outage is detected independently of the LXC.

## Hardening reference

Identical model to the oci-registry (`modules/hardening.nix`, always active): no
SSH, no autologin, kernel sysctls, avahi/cups/polkit/udisks2 disabled, volatile
journald (RAM-only, 64 MiB), NixOS firewall default-deny (only 80/443, plus UDP
41641 for Tailscale direct connections — no `tailscale0` kernel interface since
caddy-tailscale uses tsnet), timesyncd on. All stack daemons run as the
unprivileged `victoria` user with the LXC-safe systemd hardening subset
(mount-namespace options omitted — they fail in an unprivileged LXC). Compensations:
loopback-only binding for every backend, and the layered PVE + NixOS firewalls +
Tailscale ACLs as the access boundary.

## Operations

### Inspecting components (from the Proxmox host)

```sh
ssh root@pve.lan pct exec <vmid> -- systemctl status \
  victoriametrics victorialogs vmalert alertmanager caddy
ssh root@pve.lan pct exec <vmid> -- journalctl -u vmalert -f
```

### Checking ingest / alerting health

```sh
# From an allow-listed homelab client (no auth):
curl -sSf 'https://o11y.chezmoi.sh/metrics/api/v1/query?query=up' | jq .

# Existential alerts (over loopback, from inside the LXC):
ssh root@pve.lan pct exec <vmid> -- curl -s 127.0.0.1:8880/api/alerts | jq .
ssh root@pve.lan pct exec <vmid> -- curl -s 127.0.0.1:9093/alerts/api/v2/alerts | jq .
```

### Editing alert rules

* **Existential rules** (this LXC): edit a `*.yaml` in [`alerts/`](./alerts/),
  bump the image `version` in `flake.nix`, then build/push/upgrade. Baked into the
  image on purpose (rare, signed, must survive an amiya outage).
* **Everything else** (per-cluster alerting + recording rules): edit the `VMRule` /
  `PrometheusRule` CRDs in that cluster's repo — ArgoCD deploys, the VM Operator
  reloads the cluster's vmalert, no LXC rebuild.

### Backups

* **Image / OS** — stateless: recreate from the flake for an identical config.
* **Data** (`/var/lib/victoria`) — **stateful, back it up.** Daily Proxmox
  snapshot of the `mp0` dataset minimum. Losing it loses history (alerting
  recovers on restart).
* **Secrets** — age-encrypted in git.

### Upgrading

Same parallel-run flow as the oci-registry — see `.mise/tasks/lxc/upgrade`.

```sh
mise run lxc:build
mise run lxc:push -- pve.lan
mise run lxc:upgrade -- pve.lan <source_id> <target_id>
# verify, then: ssh root@pve.lan pct stop <source_id>
```

## Troubleshooting

| Symptom                                     | Likely cause                                     | Fix                                                                      |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Caddy `unauthorized` from Cloudflare        | Token expired/rotated                            | `lxc:secrets:sync` + rebuild + redeploy                                  |
| remote\_write / query refused (timeout)     | Source IP not in the PVE firewall allowlist      | Add the source CIDR to `/etc/pve/firewall/<vmid>.fw`                     |
| Component `Permission denied` on start      | `mp0` not chowned to `100980` before start       | `pct mount` → `chown -R 100980:100980 …/var/lib/victoria` → unmount      |
| Existential alerts never fire               | `ALERTMANAGER_NOTIFY_URL` empty at build         | Set it in `observability.sops.env`, rebuild                              |
| External heartbeat keeps paging             | Watchdog not reaching `ALERTMANAGER_DEADMAN_URL` | Check egress (`policy_out: ACCEPT`) and the URL                          |
| Tailnet clients can't reach appliance       | tsnet auth failed or TS\_AUTHKEY missing         | Check Caddy logs (`journalctl -u caddy`); verify `TS_AUTHKEY` in secrets |
| `victoria-logs: command not found` (build)  | `pkgs.victorialogs` attr name differs            | See Known gaps — adjust `victorialogs.nix` ExecStart                     |
| `victoria-traces: command not found`(build) | `pkgs.victoriatraces` attr name / port differs   | See Known gaps — adjust `victoriatraces.nix` ExecStart                   |

## Known gaps / follow-ups

1. **nixpkgs package-name verification.** Assumes `pkgs.victoriametrics` ships
   `victoria-metrics` / `vmalert`, `pkgs.victorialogs` ships `victoria-logs`,
   `pkgs.victoriatraces` ships `victoria-traces`, and `pkgs.prometheus-alertmanager`
   ships `alertmanager` on the pinned `nixos-26.05`. Verify
   (`nix eval nixpkgs#victoriatraces.version`) before the first build; adjust
   ExecStart paths (and the `:10428` VictoriaTraces port) if they differ. If
   `victoriatraces` is absent from the channel, package the upstream release binary
   with autoPatchelfHook (same pattern as the zot LXC).

2. **Crossplane tokens — provisioned.** The Cloudflare APIToken
   (`cloudflare.iam.observability.yaml` → secret `chezmoi.sh-cloudflare-token-o11y`)
   and the Tailscale OAuth client (`tailscale.oauth.observability.yaml` →
   `observability-tailscale-oauth-client`, `tag:o11y`) live in
   `projects/chezmoi.sh/src/infrastructure/crossplane/`. After they reconcile,
   `lxc:secrets:sync` fetches both tokens into `caddy.sops.env` automatically.
   Run `scripts/dist:render` to regenerate the rendered manifests. *(Note:
   caddy-tailscale's tsnet state is stored at `/var/lib/caddy` on the stateless
   root disk, so a rebuild wipes it — use a non-ephemeral OAuth key so the node
   re-registers on the next start without manual intervention.)*

2c. **Cert validity over the tailnet — resolved.** caddy-tailscale serves the
tailnet listener at `observability.<tailnet>.ts.net` with TLS issued automatically
by Tailscale's ACME for `*.ts.net`. No split-DNS override or extra cert SAN needed
for tailnet clients — they connect to the MagicDNS name directly.

3. **VictoriaLogs query path may drift.** Validate the Grafana VictoriaLogs
   datasource path (`/logs/select/logsql/*`) against the installed version.

4. **Cluster-side resources not included.** VMAgent (+ optional streamAggr),
   VMAlert + VMRule/PrometheusRule, Vector (logs + optional trace export), the
   Proxmox OTEL push, and Grafana (datasources for metrics/logs/traces + dashboards
   * the Grafana-side deadman) live in their own projects and are tracked as
     separate phases of [#1018].

5. **No HA.** Single LXC, single Proxmox node. If the node dies, the LXC deadman
   stops and the external monitor pages; collection halts until the LXC is
   brought up elsewhere. Agents buffer on disk and backfill on reconnect.

6. **No NixOS smoke test.** A `pkgs.testers.runNixOSTest` booting the image and
   asserting every unit is `active` would catch module regressions pre-Proxmox.

7. **`assets/architecture.svg` not yet rendered.** Generate with
   `mise exec -- d2 architecture.d2 assets/architecture.svg`.

8. **No auth is a deliberate trade-off.** Any host on the allow-listed subnet can
   read and write all data. If the appliance is ever exposed beyond the trusted
   LAN/Tailnet, re-introduce `vmauth` (write/read credentials) in front of the
   backends before doing so.

<!-- Issue reference links -->

[#1013]: https://github.com/chezmoidotsh/arcane/issues/1013

[#1018]: https://github.com/chezmoidotsh/arcane/issues/1018
