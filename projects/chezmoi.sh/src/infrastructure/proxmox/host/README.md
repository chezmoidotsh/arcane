# Proxmox VE host files

Files installed on the Proxmox VE nodes themselves, which are configured by hand (see
[`docs/reference/Infrastructure-Manuelle-Reference.md`](../../../../../../docs/reference/Infrastructure-Manuelle-Reference.md)).
They live under `fs/` with a dot-encoded target directory, like the LXC appliances: `fs/etc.otelcol-contrib/config.yaml`
is installed as `/etc/otelcol-contrib/config.yaml`.

## OpenTelemetry Collector

Each node runs `otelcol-contrib` (official Debian package, version and checksum pinned in [`.mise.toml`](./.mise.toml)).
It ships the node to the o11y appliance (`data.o11y.chezmoi.sh:4318`, OTLP/HTTP):

- **Logs**: the systemd journal (`journald` receiver, cursor kept in `/var/lib/otelcol-contrib`), mapped like the LXC
  agents (`catalog/nix/modules/o11y-agent`): `MESSAGE` as the body, `SYSLOG_IDENTIFIER` as `service.name`, `PRIORITY` as
  the severity.
- **Metrics**: `hostmetrics` (CPU, load, memory, paging, processes, system, physical disks, filesystems, physical NICs
  and bridges), `service.name=hostmetrics`.

`host.name` is the node hostname (`pve-01`). The Proxmox VE API metrics (nodes, guests, storage) do not come from here:
the PVE OpenTelemetry metric server pushes them (`/etc/pve/status.cfg`).

This replaces `prometheus-node-exporter` and the rsyslog forwarding to the former `pve-exporter` LXC.

| File                                                            | Installed as                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `fs/etc.otelcol-contrib/config.yaml`                            | `/etc/otelcol-contrib/config.yaml`                            |
| `fs/etc.systemd.system.otelcol-contrib.service.d/override.conf` | `/etc/systemd/system/otelcol-contrib.service.d/override.conf` |

```sh
mise run host:otelcol:install -- pve-01.pve.chezmoi.sh   # package (first time, or after a version bump)
mise run host:otelcol:deploy  -- pve-01.pve.chezmoi.sh   # config + drop-in, validated on the node, then restart
```

Procedure:
[`INF-20261111-00-Installer-le-Collecteur-OpenTelemetry-sur-Proxmox.md`](../../../../../../docs/procedures/infrastructure/INF-20261111-00-Installer-le-Collecteur-OpenTelemetry-sur-Proxmox.md).
