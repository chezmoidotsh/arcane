# `signoz.chezmoi.sh` — SigNoz LXC (Proxmox)

Standalone Proxmox LXC running NixOS + SigNoz + ClickHouse + Caddy. Serves `https://signoz.chezmoi.sh` (UI/API and
OTLP/HTTP ingestion) and accepts OTLP/gRPC on `10.0.0.27:4317`.

> **Authentication** — SigNoz' own login only, **no SSO yet**. The first visitor to the UI creates the admin account, so
> open it right after the first boot. The LXC is only reachable on VLAN 5 (no Pangolin exposure).

## Architecture

```text
 OTLP/gRPC :4317 ───────────────────────────────┐
 HTTPS :443 ── Caddy ─┬─ /v1/{traces,metrics,logs} ─> collector :4318
                      └─ everything else ──────────> signoz :8080 (UI + API)

 clickhouse-keeper :9181 ─> clickhouse :9000 <── signoz-migrator (schema) / collector / signoz
```

Everything except Caddy and OTLP/gRPC listens on `127.0.0.1`. Units mirror SigNoz's own `systemd/binary` install
([Foundry](https://github.com/SigNoz/foundry/tree/main/docs/examples/systemd/binary)); SigNoz metadata lives in SQLite
instead of PostgreSQL.

| Unit                | Role                                                    |
| ------------------- | ------------------------------------------------------- |
| `signoz-keeper`     | ClickHouse Keeper (embedded in the `clickhouse` binary) |
| `signoz-clickhouse` | Telemetry store                                         |
| `signoz-migrator`   | Creates/updates the `signoz_*` schemas on every boot    |
| `signoz-collector`  | OTel collector (OTLP gRPC `:4317`, HTTP `:4318`)        |
| `signoz`            | Query service + UI                                      |
| `caddy`             | TLS (DNS-01 via Cloudflare)                             |

## Packaging

SigNoz is not in nixpkgs. Both packages are built from source and live in `catalog/nix/pkgs/by-name/si/` using the
nixpkgs layout (plain `callPackage` files, no flake-specific code) so they can be upstreamed as-is:

- `signoz` — Go backend (`cmd/community`), web UI (pnpm/vite, `web.nix`) and the `histogramQuantile` ClickHouse helper;
- `signoz-otel-collector` — collector + schema migrator (`migrate` subcommands).

ClickHouse comes from nixpkgs.

## Persistent storage

`mp0` mounted on `/persistent` (size it for the retention you want; ClickHouse is the only big consumer):

| Path                     | Owner (CT uid → host uid) |
| ------------------------ | ------------------------- |
| `/persistent/clickhouse` | `clickhouse` 990 → 100990 |
| `/persistent/keeper`     | `clickhouse` 990 → 100990 |
| `/persistent/signoz`     | `signoz` 991 → 100991     |
| `/persistent/caddy`      | `caddy` 997 → 100997      |

## Build & deploy

```sh
cd projects/chezmoi.sh && mise run pulumi:cloudflare-token:signoz   # after `pulumi up` in src/infrastructure/pulumi
cd src/infrastructure/proxmox/lxc/signoz
mise run lxc:build
mise run lxc:push -- <pve-host>
```

First deployment is manual (same as the other appliances, see
[oci-registry](../oci-registry/README.md#proxmox-lxc-creation)): create an unprivileged CT with `nesting=1`, `net0` =
`ip=10.0.0.27/22,gw=10.0.0.1` (VLAN 5), a `mp0` data volume, **at least 4 cores / 8 GiB RAM**, tag `_signoz`, then add
the `signoz.chezmoi.sh` DNS record. Later upgrades: `mise run lxc:upgrade -- <pve-host>`.

## Sending data

- OTLP/gRPC: `10.0.0.27:4317` (plaintext, LAN only).
- OTLP/HTTP: `https://signoz.chezmoi.sh/v1/{traces,metrics,logs}`.

## Known gaps

- No SSO for now (not configured; whether the community edition supports it has not been checked).
- No retention policy configured: set it from the UI (Settings → Retention) after the first login.
- The LXC is not monitored by SigNoz itself; its journald logs and node metrics go to the Victoria stack.
