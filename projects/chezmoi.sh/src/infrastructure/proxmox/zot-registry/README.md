# `oci.chezmoi.sh` — Zot OCI Registry LXC (Proxmox)

Standalone Proxmox LXC running NixOS + Zot + Caddy. Serves
`https://oci.chezmoi.sh` as a pull-through cache for every public OCI
registry the homelab clusters depend on, plus first-party
`ghcr.io/chezmoidotsh/**` images.

This replaces the legacy `zot-registry` Kubernetes StatefulSet on
`amiya.akn` and breaks the circular bootstrap dependency that forced
namespace exceptions in `SEC001:kubernetes.rego`.

> **Status** — replacement for `projects/amiya.akn/src/apps/zot-registry/`.
> The K8s StatefulSet removal is tracked in PR #1027. Until that PR is merged
> and ArgoCD has pruned the resources, the LXC is the live registry.

## Table of contents

1. [Architecture](#architecture)
2. [What's in this directory](#whats-in-this-directory)
3. [Prerequisites](#prerequisites)
4. [Secrets — Cloudflare DNS-01 token](#secrets--cloudflare-dns-01-token)
5. [Build & deploy](#build--deploy)
6. [Proxmox LXC creation](#proxmox-lxc-creation)
7. [Proxmox host firewall](#proxmox-host-firewall)
8. [Hardening reference](#hardening-reference)
9. [Operations](#operations)
10. [Troubleshooting](#troubleshooting)
11. [Known gaps / follow-ups](#known-gaps--follow-ups)

## Architecture

```text
                          Internet  /  homelab
                              │
                              │  TCP 80 (redirect) / 443 (TLS)
                              ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  Proxmox host                                                  │
   │                                                                │
   │  PVE firewall  ─────────────────┐                              │
   │                                 ▼                              │
   │                ┌─────────────────────────────────────────────┐ │
   │                │  LXC (unprivileged)   nixos / oci-registry  │ │
   │                │                                             │ │
   │                │   Caddy   :80 → 301 → :443                  │ │
   │                │   Caddy   :443  ACME DNS-01 (Cloudflare)    │ │
   │                │           │                                 │ │
   │                │           │   reverse_proxy localhost:5000  │ │
   │                │           ▼                                 │ │
   │                │   Zot     127.0.0.1:5000                    │ │
   │                │           │                                 │ │
   │                │           ▼                                 │ │
   │                │   /var/lib/zot  (blobs + metadata)          │ │
   │                │                                             │ │
   │                └─────────────────────────────────────────────┘ │
   └────────────────────────────────────────────────────────────────┘
```

* **Caddy** terminates TLS, redirects HTTP, sets HSTS, reverse-proxies to
  Zot. ACME uses DNS-01 via Cloudflare (no inbound :80 challenge required).
* **Zot** binds to 127.0.0.1:5000 only — never exposed on the network.
  Anonymous read everywhere; mgmt API enabled (read-only).
* **No SSH.** Console access goes through `pct enter <vmid>` on the
  Proxmox host. The LXC has no `getty` autologin, no `sshd`, no shell user.

## What's in this directory

```text
.
├── README.md              ← you are here
├── flake.nix              ← LXC image build (nixos-generators)
├── flake.lock             ← pinned inputs
├── configuration.nix      ← site identity, locale, console toolbox (modules own service config)
├── upstreams.nix          ← 11 pull-through cache definitions
├── .mise.toml             ← mise tasks (build / push / secrets)
└── secrets/
    └── caddy.sops.env     ← SOPS-encrypted Cloudflare API token
```

## Prerequisites

* `mise` with the repo's `.mise.toml` trusted (`mise trust`).
* Docker (used by `nix:build:lxc` to wrap the Nix build).
* `kubectl` configured for `amiya.akn` (only for the initial token sync).
* `sops` with the repo age key loaded (`SOPS_AGE_KEY_FILE` already set by mise).
* SSH key-based root access to the Proxmox node you intend to push to.

## Secrets — Cloudflare DNS-01 token

The Cloudflare API token is managed by Crossplane
([`cloudflare.iam.zot-registry.yaml`](../../crossplane/cloudflare.iam.zot-registry.yaml)).
Crossplane provisions the token at Cloudflare and writes it into the
`crossplane-secrets` namespace on `amiya.akn`. We then fetch it once and
encrypt it into the repository, so we can bake it into the LXC image
without relying on a Kubernetes API connection at build time.

### First-time sync (or rotation)

```sh
mise run lxc:secrets:sync       # requires kubectl access to amiya.akn
```

This writes `secrets/caddy.sops.env` (SOPS / age-encrypted). The plaintext
token never touches disk.

### Rotation

```sh
# 1. Delete the Crossplane APIToken — ArgoCD recreates it, Crossplane
#    rotates the secret, the old token is invalidated.
kubectl delete apitoken chezmoi-sh-caddy-dns01-zot -n crossplane

# 2. Wait for the new secret to land
kubectl wait --for=condition=Ready apitoken/chezmoi-sh-caddy-dns01-zot -n crossplane --timeout=2m

# 3. Re-sync into the repo
mise run lxc:secrets:sync

# 4. Rebuild and redeploy the LXC
mise run lxc:build
mise run lxc:push -- pve.lan local
```

## Build & deploy

```sh
# 1. Build the LXC tarball with the Cloudflare token baked in
mise run lxc:build

# 2. Upload to Proxmox (creates /var/lib/vz/template/cache/oci-proxy.<v>-amd64.tar.xz)
mise run lxc:push -- pve.lan local
```

The `lxc:push` task prints a sample `pct create` invocation when it
finishes. The fully documented one is in the next section.

### Task reference

| Task                                                         | What it does                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `mise run lxc:secrets:sync`                                  | Fetch Cloudflare token from cluster → `secrets/caddy.sops.env`    |
| `mise run lxc:build`                                         | Build with the token baked in (requires `secrets/caddy.sops.env`) |
| `mise run lxc:push -- <pve-host> [storage]`                  | scp the tarball to Proxmox                                        |
| `mise run lxc:upgrade -- <pve-host> <source_id> <target_id>` | Upgrade a running LXC to a new image while preserving config      |

## Proxmox LXC creation

The build emits `oci-proxy.<version>-amd64.tar.xz`. After `lxc:push`
uploads it to `/var/lib/vz/template/cache/`, create the container with:

```sh
# Pick an unused VMID (Proxmox prints used ones with `pct list`).
VMID="<vmid>"   # e.g. 100 — replace before running, pct will reject the placeholder.
TEMPLATE=oci-proxy.<version>-amd64.tar.xz
NODE=pve.lan

# 1. Create the container — do NOT start yet (console config comes next).
ssh root@${NODE} pct create ${VMID} local:vztmpl/${TEMPLATE} \
    --hostname     oci-registry \
    --description  "OCI registry (Zot + Caddy) — managed by chezmoidotsh/arcane" \
    --ostype       nixos \
    --arch         amd64 \
    --unprivileged 1 \
    --features     nesting=0,keyctl=0 \
    --cores        1 \
    --memory       512 \
    --swap         0 \
    --rootfs       local-zfs:2 \
    --mp0          local-zfs:100,mp=/var/lib/zot \
    --net0         name=eth0,bridge=vmbr0,ip=dhcp,firewall=1 \
    --onboot       1

# 2. Wire up the console device so `pct console <vmid>` connects to the
#    NixOS console-getty.
ssh root@${NODE} "echo 'lxc.console.path: /dev/console' >> /etc/pve/lxc/${VMID}.conf"

# 3. Start the container.
ssh root@${NODE} pct start ${VMID}
```

> **Before step 3 — fix mp0 ownership (unprivileged LXC).**
> Proxmox creates the ZFS subvolume with host uid 0, which falls outside
> the container's uid map and appears as `nobody` (65534) inside the LXC.
>
> Run the following **on the Proxmox node** (`ssh root@${NODE}`):
>
> ```sh
> VMID="<vmid>"   # replace with the VMID from `pct create` above
> # Default Proxmox mapping: container uid N → host uid 100000+N.
> # zot uid is fixed at 994 in zot.nix → host uid = 100000 + 994 = 100994.
> # Verify: grep ^root /etc/subuid   (expect root:100000:65536)
> pct mount ${VMID}
> chown 100994:100994 /var/lib/lxc/${VMID}/rootfs/var/lib/zot
> pct unmount ${VMID}
> ```
>
> `/var/lib/zot` is already owned by `zot:zot` (uid 994) inside the
> container before first start — `StateDirectory` is a no-op.
> See [Troubleshooting](#zot-does-not-start) if you missed this step.

Adjust `local-zfs` to your storage backend (`local-lvm`, `nas`, …).
The `--mp0` volume is provisioned automatically at `pct create` time
(a ZFS dataset for `local-zfs`, a directory for `dir` storage) and
mounted at `/var/lib/zot` inside the LXC.

### Resource sizing — tested values

| Workload            | Recommended                         |
| ------------------- | ----------------------------------- |
| CPU                 | 1 vCPU                              |
| Memory              | 512 MiB                             |
| Root disk (OS only) | 2 GiB                               |
| Zot data volume     | 100 GiB (mounted at `/var/lib/zot`) |
| Swap                | 0 (let OOM kill on overrun)         |

The 2 GiB root is intentionally minimal — the LXC is stateless (rebuilt
from the flake) and carries no user data. The Nix closure for the image
typically lands under 1.5 GiB. The trivy vulnerability database is stored
inside Zot's storage root (`/var/lib/zot`, on the `mp0` data volume) and
never touches the root disk. If a future rebuild exceeds the limit,
bump with `pct resize <vmid> rootfs +2G` before rebuilding.

If you push first-party images aggressively, raise `mostRecentlyPushedCount`
in `modules/zot.nix` (the Zot data volume will absorb the extra blobs).

### `pct.conf` features explained

* `unprivileged 1` — root-in-LXC is mapped to a high uid on the host.
  Mandatory; do not relax.
* `nesting=0` — we don't run containers inside this LXC.
* `keyctl=0` — Zot does not use the kernel keyring.
* `firewall=1` on the NIC — enables the Proxmox per-VM firewall (rules
  in the next section).
* `--mp0 storage:100,mp=/var/lib/zot` — dedicated 100 GiB volume for Zot
  blobs and metadata, completely isolated from the 1 GiB OS root disk.
  Resize or replace the data volume independently of the system image.
* `lxc.console.path: /dev/console` (raw LXC config, step 2 above) —
  routes `pct console <vmid>` to the NixOS `console-getty` unit listening
  on `/dev/console`. Without this line the Proxmox console widget stays
  blank after boot.

## Proxmox host firewall

The Proxmox firewall layers in front of the in-LXC `iptables` rules from
`hardening.nix`. Even if a future change accidentally opens a port in
NixOS, the PVE firewall will still drop it.

> Settings live in `/etc/pve/firewall/<vmid>.fw` on the Proxmox host and
> are replicated automatically across the cluster.

### Datacentre-level setup (one-time)

Make sure the cluster-wide firewall is enabled:

```sh
# On the Proxmox node:
pve-firewall status

# Enable the cluster firewall (idempotent):
pvesh set /cluster/firewall/options --enable 1
```

### Per-LXC rules

Create the firewall config for `<vmid>`:

```sh
VMID="<vmid>"   # same VMID as the LXC created above

# 1. Enable the LXC firewall, default-deny inbound, allow outbound, ICMPv6 ND
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
# HTTP/HTTPS from anywhere
IN ACCEPT -p tcp -dport 80  -log nolog # HTTP → HTTPS redirect
IN ACCEPT -p tcp -dport 443 -log nolog # HTTPS (Caddy)

# Allow Prometheus scraping from the homelab subnet (adjust CIDR)
# IN ACCEPT -p tcp -dport 5000 -source 10.0.0.0/8 -log nolog

# Allow ICMP (ping) for liveness checks
IN ACCEPT -p icmp -log nolog
EOF

# 2. Reload the firewall
pve-firewall restart

# 3. Verify rules are loaded
pve-firewall localnet
iptables -L -nv | grep -E "tap${VMID}|veth${VMID}"
```

> The `dport 5000` line is commented because Zot binds to 127.0.0.1 only.
> Uncomment **and** rebuild the LXC with Zot bound to `0.0.0.0` if you
> need to scrape Prometheus metrics from outside the LXC. The
> recommended pattern is to scrape from inside the LXC over `localhost`
> (e.g. a sidecar `node_exporter` doesn't have this constraint).

### Quick verification

```sh
# From a homelab host:
curl -sSf https://oci.chezmoi.sh/v2/                              # → 200 {}
curl -sSf https://oci.chezmoi.sh/v2/_zot/ext/mgmt | jq .          # → running config
docker pull oci.chezmoi.sh/docker.io/library/alpine:3.20          # → success
```

## Hardening reference

The hardening module (`modules/hardening.nix`) is always active — imported
unconditionally by `modules/default.nix`. Concretely:

| Layer                | What we change                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Login surface**    | No `sshd`. No autologin getty. No console user by default.                                                                                                                                                                                                                                                                                                                                   |
| **Sudo**             | `wheelNeedsPassword = true`. No-op because there are no normal users.                                                                                                                                                                                                                                                                                                                        |
| **Kernel sysctls**   | IP forwarding off, source-routing off, ICMP redirects off, SYN cookies on, reverse-path filter on, ptrace YAMA = children-only, magic SysRq off, SUID coredumps off.                                                                                                                                                                                                                         |
| **Services**         | Avahi, CUPS, Polkit, UDisks2 disabled with `mkForce` (some of these are pulled in by other modules and would otherwise sneak in).                                                                                                                                                                                                                                                            |
| **Docs**             | man-db / info / nixos-docs disabled. Smaller image, no setuid `man`.                                                                                                                                                                                                                                                                                                                         |
| **Journald**         | `Storage=volatile`, `RuntimeMaxUse=64M` — logs live in `/run/log/journal` (tmpfs), never touch the root disk, disappear on reboot. `ForwardToConsole=yes` so `pct console <vmid>` still shows boot messages. See [Log management](#log-management-on-a-1-gib-root-disk) for options if persistence is needed.                                                                                |
| **Firewall (NixOS)** | Default-deny inbound. Only TCP/80 and TCP/443 allowed.                                                                                                                                                                                                                                                                                                                                       |
| **Firewall (PVE)**   | Layered on top — see previous section.                                                                                                                                                                                                                                                                                                                                                       |
| **Zot systemd**      | `NoNewPrivileges`, `RestrictSUIDSGID`, `RestrictRealtime`, `LockPersonality`, `MemoryDenyWriteExecute`, `SystemCallArchitectures=native`, `LimitNOFILE=65536`. Mount-namespace options (`PrivateTmp`, `ProtectSystem`, `ProtectHome`, `ProtectControlGroups`, `ProtectKernelLogs`, `ProtectClock`) are omitted — they fail with "step NAMESPACE … Permission denied" in an unprivileged LXC. |
| **Caddy systemd**    | Same hardening flags applied via `mkDefault` (nixpkgs already sets some).                                                                                                                                                                                                                                                                                                                    |

### What we explicitly do **not** harden

* `PrivateTmp`, `ProtectSystem`, `ProtectHome`, `ProtectControlGroups`,
  `ProtectKernelLogs`, `ProtectClock`, `PrivateDevices`,
  `ProtectKernelModules`, `RestrictNamespaces` — all require creating a
  mount namespace, which fails in an unprivileged LXC with
  "Failed at step NAMESPACE … /proc: Permission denied".
  The PVE + NixOS layered firewalls and Zot's loopback-only binding
  compensate for the missing filesystem isolation.
* AppArmor / SELinux — Proxmox uses AppArmor at the host level; we don't
  ship a per-service profile.

## Operations

### Inspecting the running config

```sh
ssh root@pve.lan pct exec <vmid> -- curl -s http://127.0.0.1:5000/v2/_zot/ext/mgmt | jq .
```

Or from a homelab client:

```sh
curl -s https://oci.chezmoi.sh/v2/_zot/ext/mgmt?resource=config | jq .
```

The response includes upstream registries, retention policies, version,
distSpec version, log level — everything minus secrets.

### Inspecting live logs

```sh
# Boot + service logs (host-side, via Proxmox console)
ssh root@pve.lan pct console <vmid>

# Live tail of the Zot service
ssh root@pve.lan pct exec <vmid> -- journalctl -u zot -f

# Caddy access + ACME logs
ssh root@pve.lan pct exec <vmid> -- journalctl -u caddy -f
```

### Forcing a GC run

The retention worker runs every 24 h. To trigger an out-of-band run
(after bumping retention policies, for example):

```sh
ssh root@pve.lan pct exec <vmid> -- systemctl restart zot
# GC runs as part of startup; allow ~30s for completion.
```

### Log management on a 1 GiB root disk

The root volume has no space to spare. By default `modules/hardening.nix`
configures journald with `Storage=volatile` + `RuntimeMaxUse=64M`: logs
live in `/run/log/journal` (tmpfs), are capped at 64 MiB in RAM, and
disappear on container stop. That is the right default for a stateless
pull-through cache.

```nix
# modules/hardening.nix — always active
services.journald = {
  console = "/dev/console";   # ForwardToConsole target for pct console
  extraConfig = ''
    Storage=volatile
    RuntimeMaxUse=64M
    ForwardToConsole=yes
  '';
};
```

| Scenario                      | What to do                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live log access (current)** | `pct exec <vmid> -- journalctl -u zot -f` — works fine for the running session.                                                                                                        |
| **Post-crash diagnosis**      | Rebuild with `Storage=persistent` + `SystemMaxUse=200M` temporarily, redeploy, reproduce, collect, then revert.                                                                        |
| **Permanent persistent logs** | Add a second extra volume: `--mp1 local-zfs:5,mp=/var/log/journal` at creation time and switch to `Storage=auto` in journald config. NixOS detects the persistent store automatically. |
| **Zot data saturation**       | `/var/lib/zot` is on its own 100 GiB volume — logs can never reach it. Monitor via Proxmox storage alerts on the `mp0` dataset.                                                        |

> **Root disk headroom check:**
>
> ```sh
> pct exec <vmid> -- df -h /
> ```
>
> If `/` is above 80 % after a fresh deploy, resize with `pct resize <vmid> rootfs +2G`
> before the next rebuild.

### Backups

* **Image** — the LXC is *stateless*: deleting and recreating it from the
  same flake produces an identical configuration.
* **Cache** (`/var/lib/zot`) — losing this means the next pulls hit
  upstream registries again (slower, no other consequence). A weekly
  Proxmox snapshot is enough; full backups are unnecessary.
* **Secrets** — `secrets/caddy.sops.env` is age-encrypted and committed
  to git. No separate backup needed.

### Upgrading to a new version

Upgrading replaces the rootfs with a freshly built image while keeping the
Proxmox config and the `/var/lib/zot` data volume intact. The source
container stays running throughout; the cut-over is a single `pct stop`.

```sh
# 1. Build the new image and upload it to the Proxmox host
mise run lxc:build
mise run lxc:push -- <pve-host>

# 2. Create the new container, copy config, fix ownership, and start it
mise run lxc:upgrade -- <pve-host> <source_id> <target_id>
#    Template is auto-detected from the zot flake version.
#    Override: mise run lxc:upgrade -- pve.lan 100 101 oci-proxy.X.Y.Z-amd64.tar.xz

# 3. Wait for Caddy to obtain a fresh TLS certificate (allow 30–60 s)
ssh root@<pve-host> pct exec <target_id> -- journalctl -u caddy -f
curl -sSf https://oci.chezmoi.sh/v2/   # → 200 {} or 401

# 4. Cut over
ssh root@<pve-host> pct stop <source_id>
```

#### What to expect

| Aspect          | Detail                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TLS certificate | Caddy requests a new certificate on first boot — the old one is not carried over.                                                                                                                         |
| Data volume     | The `mp0` volume (`/var/lib/zot`) config is copied from source; blobs and metadata are preserved without any sync.                                                                                        |
| Parallel run    | Both containers are alive between steps 2 and 4. Use this window to verify before cutting over.                                                                                                           |
| Cold cache risk | The data volume references the source's LVM volume — both containers share the same underlying storage. If you want a clean break, provision a new `mp0` and let the cache rebuild on demand (see below). |

#### Syncing blobs to a fresh data volume

If the new container gets a fresh `mp0` (different storage or explicit
resize), sync blobs before starting it. Zot's index (BoltDB) cannot be
copied safely while the source is running, so stop it first.

```sh
# After lxc:upgrade creates the container but before pct start <dest>
pct stop <source>
pct mount <source>
pct mount <dest>

rsync -a --delete \
  /var/lib/lxc/<source>/rootfs/var/lib/zot/ \
  /var/lib/lxc/<dest>/rootfs/var/lib/zot/

pct unmount <source>
pct unmount <dest>
pct start <dest>
# Source is already stopped — skip pct stop once verified.
```

> **Trade-off:** syncing causes a brief outage (`pct stop <source>` before
> the new container is serving). Skip it if uptime matters more than a warm
> cache — the pull-through proxy rebuilds on demand.

## Troubleshooting

### Caddy fails to obtain a certificate

```sh
ssh root@pve.lan pct exec <vmid> -- journalctl -u caddy --since '5 minutes ago' | grep -Ei 'acme|cert|cloudflare'
```

Common causes:

| Symptom                                | Likely cause                               | Fix                                                               |
| -------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `unauthorized` from Cloudflare         | Token expired or rotated.                  | Re-run `mise run lxc:secrets:sync` + rebuild + redeploy.          |
| `connection refused` to Cloudflare     | LXC has no egress (PVE firewall blocked).  | Check `policy_out: ACCEPT` in `/etc/pve/firewall/<vmid>.fw`.      |
| `tls handshake error` on first request | First-boot ACME challenge still in flight. | Wait 30–60s; verify with `journalctl -u caddy`.                   |
| `dial tcp: lookup ... no such host`    | DNS misconfigured in LXC.                  | `pct exec <vmid> -- resolvectl status` — expect Cloudflare/quad9. |

### Zot does not start

```sh
ssh root@pve.lan pct exec <vmid> -- journalctl -u zot --since '5 minutes ago'
```

* `config.json` syntax error → check `/etc/zot/config.json` on the host.
* `Failed at step STATE_DIRECTORY … Permission denied` → the mp0 pre-chown
  was not done before first start. Fix from the Proxmox host:

  ```sh
  VMID="<vmid>"
  pct stop ${VMID}
  pct mount ${VMID}
  chown 100994:100994 /var/lib/lxc/${VMID}/rootfs/var/lib/zot
  pct unmount ${VMID}
  pct start ${VMID}
  ```

### Pulls fail with `503` after a brief outage

Zot retries upstream on demand with no backoff; under flapping network
conditions the request can fail. Retries on the client side resolve it.
Adding Caddy-side fallback routing is tracked in issue #1022 comments.

## Known gaps / follow-ups

The current setup is functional but the items below are worth tracking:

1. **No Prometheus scraping.** The `metrics` extension is implicitly off
   (we only enable `search`/`ui`/`mgmt`). When we want SLOs, enable
   `extensions.metrics` plus an htpasswd-protected `metrics` user. Note
   the firewall section already includes the (commented) PVE rule to let
   the scraper in.

2. **No alert on certificate expiry.** Caddy renews silently; if ACME
   breaks we won't know until the cert expires. A blackbox-exporter
   probe from `amiya.akn` would close that gap.

3. **K8s StatefulSet still present on amiya.akn.** The removal is tracked
   in PR #1027. Until merged and ArgoCD-synced, the old `zot-registry`
   namespace and its resources remain on the cluster (harmless but noisy
   in `kubectl get ns`). No data migration is needed — the cache rebuilds
   on demand; first-party images live on GHCR, not in Zot.

4. **No HA.** Single LXC, single Proxmox node. If the node dies, pulls
   that aren't in the upstream-resolver cache will fail until the LXC is
   brought up elsewhere. Acceptable trade-off for a homelab.

5. **No log aggregation.** Logs stay on the LXC. Adding Vector / Promtail
   would mean a sidecar service; today `journalctl` over `pct exec` is
   enough.

6. **No alert on disk-full.** A runaway sync could fill the 100 GiB
   `/var/lib/zot` volume. The retention window mitigates this, but a
   Proxmox storage alert on the `mp0` dataset is a cheap safety net.
   The root disk (1 GiB) is protected by `Storage=volatile` journald —
   no log accumulation possible there.

7. **No automated OPA-test for the rego rules.** PR 2 (post-validation
   cleanup) removes namespace exceptions from `SEC001:kubernetes.rego`.
   The migration plan assumes that the cluster confirms `oci.chezmoi.sh`
   is reachable from inside the cluster before we land the OPA change.

8. **No second source of trust for the Cloudflare token.** If
   `amiya.akn` is unreachable, we can't `mise run lxc:secrets:sync`.
   Documented here so an operator knows to rotate the token via the
   Cloudflare dashboard in an emergency and update the SOPS file
   manually.

9. **Caddy plugin hash drift.** Bumping the Cloudflare DNS plugin
   version means recomputing the hash in `modules/caddy.nix`. The
   command is in the old README — preserved here for posterity:

   ```sh
   nix build --impure --expr '
     (import <nixpkgs> {}).caddy.withPlugins {
       plugins = ["github.com/caddy-dns/cloudflare@<new-version>"];
       hash = (import <nixpkgs> {}).lib.fakeHash;
     }
   '
   # Read the correct hash from the error message; update modules/caddy.nix.
   ```

10. **No NixOS test (`pkgs.testers.runNixOSTest`).** A smoke test that
    boots the LXC, curls `/v2/`, and asserts a 200 would catch
    regressions in the module library before they reach Proxmox.
