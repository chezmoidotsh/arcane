# `talosnet-dns` — talosnet split-horizon DNS LXC (Proxmox)

Standalone Proxmox LXC running NixOS + BIND + Vector. It is the DNS server of the `talosnet` Proxmox SDN subnet
(`10.128.0.0/24`): talosnet DHCP advertises it (`10.128.0.3`, `dns.talosnet.chezmoi.sh`) as the resolver for every
Talos node. See [`docs/network/gateway-dns-split.md`](../../../../../../docs/network/gateway-dns-split.md) for how it
fits in the internal/external Gateway split.

## Architecture

- **Listening interface** — BIND listens on `10.128.0.3` (`eth1`, the talosnet NIC) and `127.0.0.1` (the container's own
  resolver stub). Queries arriving on `eth0` (VLAN 5, `10.0.0.26/22`) are never answered. Only `:53` (TCP + UDP) is open
  (`modules/hardening.nix`); no SSH, console access goes through `pct enter <vmid>`. Allowed clients (`cacheNetworks`):
  `10.128.0.0/24` and loopback.
- **Record sources** — one authoritative zone, `chezmoi.sh`, stored in `/var/lib/bind/chezmoi.sh.zone` (persistent
  volume `mp0`):
  1. **Static records** seeded from the image on first start only (`seedZone` in `modules/bind.nix`): `ns`,
     `dns.talosnet`, `pve-01.pve`, `omni`, `api.omni`, `oci`, `data.o11y`, `s3`, `nas`. They exist so talosnet clients
     reach these hosts through their talosnet IP instead of crossing the SNAT/conntrack zones. Redeploys never overwrite
     the file, so editing `seedZone` only affects a fresh volume.
  2. **Dynamic records** pushed by `external-dns` (RFC2136, TSIG key `external-dns.`) from the cluster Gateways: same
     `*.chezmoi.sh` hostname as the external one, pointed at the internal Gateway's talosnet IP. The key may update `A`
     and `TXT` records anywhere in the zone and may AXFR it, nothing else.
- **Forwarding** — everything else goes to `10.10.10.10`, then `1.1.1.1` / `1.0.0.1`.
- **Observability** — Vector (`catalog.lxcAgent`) ships journald logs and node metrics to `data.o11y.chezmoi.sh`,
  pinned to `10.128.0.5` in `/etc/hosts` so shipping does not depend on this very resolver being up.

## What's in this directory

```text
.
├── README.md              ← you are here
├── flake.nix              ← LXC image build, CalVer version
├── flake.lock             ← pinned inputs
├── configuration.nix      ← hostname, static IPs (eth0 + eth1)
├── .mise.toml             ← mise tasks documentation
├── .mise/tasks/lxc/       ← build / push / upgrade scripts
├── modules/
│   ├── default.nix        ← module aggregator
│   ├── bind.nix           ← BIND, seed zone, TSIG / update policy
│   ├── o11y.nix           ← catalog.lxcAgent (logs + metrics → o11y)
│   └── hardening.nix      ← sysctl, firewall (:53 only), login surface
└── secrets/
    └── bind.sops.env      ← SOPS: BIND_TSIG_SECRET
```

## Secrets

`secrets/bind.sops.env` (SOPS/age) holds `BIND_TSIG_SECRET`, baked into the image at build time. The same value is used
by `external-dns-bind` on `rhodes.akn`
(`projects/rhodes.akn/src/infrastructure/kubernetes/external-dns/sops/bind.secret.yaml`): rotating it means updating
both, otherwise RFC2136 updates fail with `NOTAUTH`. Without the secret (`nix build` alone), the image builds but
rejects dynamic updates.

## Build & upgrade

Prerequisites: `mise` (trusted), Docker (Nix build wrapper), `sops` with the repo age key, SSH key access to the Proxmox
node.

Bump `version` (CalVer `YYYY.MM.DD`, `-N` suffix for several builds a day) in `flake.nix`, then:

```sh
mise run lxc:build                                    # build the template with BIND_TSIG_SECRET baked in
mise run lxc:push -- <pve-host>                       # upload to Proxmox
mise run lxc:upgrade -- <pve-host> [--vmid <vmid>]    # in-place upgrade of the running LXC
```

The upgrade keeps the `mp0` volume mounted on `/var/lib/bind` (owner uid `100993`, i.e. the `named` user, uid 993, with
Proxmox's default unprivileged mapping), so dynamically added records survive. The script restarts `bind` and
`lxc-agent` and suggests `dig @10.128.0.3 oci.chezmoi.sh` as the end-to-end check.

The container needs two NICs: `eth0` on VLAN 5 (`10.0.0.26/22`) and `eth1` on the `talosnet` bridge (`10.128.0.3/24`,
`firewall=0`), plus the `mp0` volume. No Pulumi code in this repository creates the LXC.
