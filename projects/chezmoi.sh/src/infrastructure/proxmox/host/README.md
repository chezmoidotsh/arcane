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

## QEMU guest agent ping

`qemu-ga` (the `siderolabs/qemu-guest-agent` extension of the Talos VMs, 11.1.1 as of 2026-11) busy-loops at 100% of a
CPU when a reply stays stuck in its virtio-serial port: the host client went away before reading it, every `write()`
returns `EAGAIN` and the agent retries without waiting. It lasts until something reads the port again, which Proxmox
only does on demand (shutdown, backup, IP display). On 2026-11-14, 6 of the 7 Talos VMs had been spinning for weeks,
~6 cores of the host lost (signature: millions of `syscw` for a few KB of `wchar` in `/proc/<pid>/io`, fd on
`/dev/vportNpN`).

A `qm agent <vmid> ping` reads the pending data and stops the loop. `qga-ping` does the same every minute (systemd
timer) for every running VM with the agent enabled, so an occurrence costs at most a minute of CPU. It sends a
`guest-sync` straight to `/var/run/qemu-server/<vmid>.qga` and reads until its reply: `qm` starts a Perl interpreter per
call, ~50 s of CPU per run for ten VMs, against ~0.1 s this way. Only failures are logged (journal, then VictoriaLogs).

Remove it once the fix is in the extension: unmerged qemu-devel patch "qga: don't busy-loop writing to virtio-serial
when host disconnected" (2026-07), which waits for `POLLOUT` instead of retrying.

| File                                     | Installed as                                |
| ---------------------------------------- | ------------------------------------------- |
| `fs/usr.local.sbin/qga-ping`             | `/usr/local/sbin/qga-ping`                  |
| `fs/etc.systemd.system/qga-ping.service` | `/etc/systemd/system/qga-ping.service`      |
| `fs/etc.systemd.system/qga-ping.timer`   | `/etc/systemd/system/qga-ping.timer`        |

```sh
mise run host:qga-ping:deploy -- pve-01.pve.chezmoi.sh   # script + units, one run, timer enabled
```
