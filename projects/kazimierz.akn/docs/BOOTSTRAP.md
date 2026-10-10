# Bootstrap Kazimierz.AKN VPS

This document describes how to bootstrap the Kazimierz.AKN VPS from a freshly provisioned OCI instance into a fully
configured node: a stock Ubuntu image on which NixOS is installed with `nixos-anywhere`, the way `rimbilliton.akn` is
(see [its bootstrap](../../rimbilliton.akn/docs/BOOTSTRAP.md)). The host was migrated from Ubuntu + Ansible + Docker
Compose to NixOS on 2026-10-10 (see [MIGRATION_NIXOS.md](./MIGRATION_NIXOS.md) for that record, and
[ADR-016](../../../docs/decisions/016-kazimierz-nixos-over-ansible.md) for the decision).

> [!WARNING] `mise run nixos:oci:install` **repartitions the boot volume**, which is where Pangolin's state lives
> (`/var/lib/pangolin/config`). On a host that is already running, see
> [Reinstalling](#reinstalling-and-restoring-the-state) first.

## Overview

The OCI instance and network (compartment, VCN/NSG, instance, DNS records) are provisioned by the Pulumi stack in
`src/infrastructure/pulumi/`. That instance boots from a stock Ubuntu image with only an SSH key injected via cloud-init
(Pulumi's `ssh_authorized_keys` config). NixOS is then installed over it with `nixos-anywhere`, the only manual step,
and managed with `nixos-rebuild` from then on. The Pulumi stack also exports what the install needs: `tailscaleAuthKey`
(single-use pre-authorized key for the first boot), `bindingIp` (instance private address), `traefikDns01TokenValue`.

**Key Components** (`src/infrastructure/nixos/`):

- **flake.nix**: one output per platform, `kazimierz-akn-aarch64` (OCI A1, production) and `kazimierz-akn-x86_64`
  (Proxmox KVM test VM, see `mise run nixos:e2e`)
- **configuration.nix**: boot-independent base: network, SSH, hardening (sshd, sysctl, fail2ban), Tailscale, sops-nix
- **platforms/**: boot loader, disk layout and console per platform (`oci.a1.nix`, `proxmox.kvm.nix`)
- **modules/pangolin.nix**: Pangolin + Gerbil + Traefik + error-pages as containers, configuration rendered from Nix and
  secrets rendered on tmpfs by sops-nix; **modules/geoip.nix**: GeoLite2 database refresh

## Prerequisites

1. **Tooling**: `mise install`, Docker (OrbStack or Docker Desktop on macOS), and every Nix command through `nonix`
   (`scripts/nonix`, on the `PATH` after `mise install`), which runs it in a container.
2. **OCI instance**: provisioned via the Pulumi stack (`mise run pulumi:diff && mise run pulumi:apply` in
   `src/infrastructure/pulumi/`) -- an Always Free `VM.Standard.A1.Flex` ARM instance in `eu-paris-1`, running Ubuntu.
3. **Public SSH reachability**: closed at the OCI network security group level. Flip the `unsecure` Pulumi toggle on
   temporarily for the install (`pulumi config set unsecure true && pulumi up`, and back to `false` afterwards).
4. **Tailnet**: `tag:svc-pangolin` must exist in the ACL `tagOwners`, and no machine named `kazimierz-akn` must remain
   in the Tailscale admin console (otherwise the new one registers as `kazimierz-akn-1`, and the Pulumi stacks'
   `pangolin:url` is built from that name).
5. **SSH key**: the private key matching `ssh_authorized_keys` of the Pulumi config must be in your SSH agent.

## Bootstrap Procedure

### 1. Prepare the host key and the SOPS file

```bash
cd projects/kazimierz.akn/src/infrastructure/nixos
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
nonix run nixpkgs#ssh-to-age -- -i extra/etc/ssh/ssh_host_ed25519_key.pub   # host age key
```

Add that age key as a second recipient of the `kazimierz.akn` rule in `src/infrastructure/nixos/.sops.yaml`
(comma-separated after the admin key), then fill the secrets file:

```bash
cp secrets/kazimierz.example.yaml secrets/kazimierz.sops.yaml   # fill it, see the comments in the file
sops --encrypt --in-place secrets/kazimierz.sops.yaml
```

- `tailscale_authkey`: `pulumi stack output tailscaleAuthKey --show-secrets` (in `src/infrastructure/pulumi/`)
- `cloudflare_dns_api_token`: `pulumi stack output traefikDns01TokenValue --show-secrets`
- `pangolin_server_secret`: a new random value on a fresh install (`openssl rand -hex 32`); it signs Pangolin's sessions
  and encrypts data in its database, so it must never change afterwards (and must be reused when restoring existing
  state)
- `pangolin_smtp_user` / `pangolin_smtp_pass`: the Mailjet API and secret keys

Set your public key in `configuration.nix` if it is not already. `secrets/kazimierz.sops.yaml` is committed (encrypted);
`extra/` is git-ignored and must never be committed. If the build complains about an untracked path, `git add -N
flake.lock` (a flake only sees files known to git).

The **binding IP**, which Docker publishes ports 80/443 on (`pangolin.bindIp`), is the instance's private (VCN) address,
the only one its network interface has: the public IP is NAT-ed by OCI and never shows up on the host. It lives in
`extra/etc/pangolin/binding-ip` (git-ignored, copied onto the host by `nixos-anywhere`) and is written from the Pulumi
output by `mise run nixos:binding-ip`, which `nixos:oci:install` and `nixos:oci:update` run first. The build refuses a
missing or empty file.

### 2. Install NixOS

The instance still runs the stock Ubuntu image, which lacks `cpio`; nixos-anywhere needs it to build the kexec initrd:

```bash
IP=<public IP of kazimierz-pangolin>   # OCI console; the Pulumi stack does not export it
ssh ubuntu@"$IP" 'sudo apt-get update -qq && sudo apt-get install -y cpio'
mise run nixos:oci:install ubuntu@"$IP"
```

The task refreshes the binding IP, then runs `nixos-anywhere` (pinned by commit) through `nonix` with
`--flake .#kazimierz-akn-aarch64 --extra-files extra --kexec-extra-flags --kexec-syscall` (the Oracle arm64 kernel needs
the legacy `kexec_load` syscall). `nonix` forwards your SSH agent to the container, which must hold the key matching
`ssh_authorized_keys`:

> [!IMPORTANT] **macOS (OrbStack, Docker Desktop): the containers run in a Linux VM**, so `nonix` cannot mount your
> agent's socket directly (the file shows up, but connecting to it fails with `Connection refused`). It uses the relay
> the runtime offers instead, `/run/host-services/ssh-auth.sock`, which forwards the agent of the **macOS login
> session** (the `SSH_AUTH_SOCK` known to `launchd`), not the one of your current shell. With the default macOS agent
> nothing is needed. With a custom agent (Bitwarden, Secretive, 1Password, ...), point `launchd` at its socket and
> restart the runtime:
>
> ```bash
> launchctl getenv SSH_AUTH_SOCK                                  # what the relay will forward
> launchctl setenv SSH_AUTH_SOCK "<path of your agent's socket>"  # e.g. $HOME/.bitwarden-ssh-agent.sock
> orb stop && orb start                                           # OrbStack; restart Docker Desktop otherwise
> ```
>
> `launchctl setenv` does not survive a reboot. Check what the container sees before an install: your key must be listed
> (`docker run --rm -v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent nixos/nix ssh-add -l`).
> On Linux the socket is mounted directly from `$SSH_AUTH_SOCK`.

`nixos-anywhere` cannot detect the target architecture, so there is no un-suffixed flake output: always pass the
architecture. If the run fails after the kexec step, the instance already runs the NixOS installer where only `root`
exists: resume from the disk step, as `root`:

```bash
cd projects/kazimierz.akn/src/infrastructure/nixos
nonix run github:nix-community/nixos-anywhere -- --flake .#kazimierz-akn-aarch64 \
  --extra-files extra --phases disko,install,reboot --target-host root@"$IP"
```

The troubleshooting table of the
[rimbilliton bootstrap](../../rimbilliton.akn/docs/BOOTSTRAP.md#troubleshooting-the-install) applies as is. To rehearse
the whole procedure on a Proxmox KVM test VM first:

```bash
mise run nixos:e2e <user@host>   # the target is mandatory; its address (IP, DNS name or ssh_config alias) becomes the binding IP
```

### 3. Verify Deployment

```bash
tailscale status | grep kazimierz-akn
ssh root@kazimierz-akn 'systemctl status docker-pangolin docker-gerbil docker-traefik docker-error-pages \
  pangolin-prepare pangolin-tailscale-serve; docker ps; tailscale serve status'
curl -sI https://pangolin.chezmoi.sh | head -n1
```

- The dashboard answers with a valid certificate. On a fresh install, visit
  `https://pangolin.chezmoi.sh/auth/initial-setup` to create the Pangolin admin account (the setup token is printed in
  the `pangolin` container logs and only appears once: `docker logs pangolin`).
- The sites (Newt on `lungmen.akn` and `rhodes.akn`) show as online in the dashboard.
- The Pulumi stacks still reach the Integration API: `pulumi preview` in `rhodes.akn`/`lungmen.akn` shows no diff on the
  `pangolin` resources.
- Close SSH again: `pulumi config set unsecure false && pulumi up`.

## Reinstalling and Restoring the State

Pangolin's state (users, sites, resources, API keys, Gerbil's WireGuard key, certificates) lives in
`/var/lib/pangolin/config` **on the boot volume**: there is no separate data volume. A reinstall wipes it unless it is
restored, so:

1. `mise run nixos:backup` takes a hot backup (SQLite backup API, no downtime) into `$KAZIMIERZ_BACKUP_DIR` (default
   `~/.local/share/kazimierz.akn/backups`). The tarball holds secrets in clear text: keep it encrypted at rest.
   `nixos:oci:install` shows the latest backup and its age, offers to take one if it is missing or older than 24h, and
   asks `y/N` before wiping.
2. Extract it where `nixos-anywhere --extra-files` will put it on the new root:

   ```bash
   cd projects/kazimierz.akn/src/infrastructure/nixos
   mkdir -p extra/var/lib/pangolin/config
   tar -C extra/var/lib/pangolin/config -xzf <backup>.tgz
   ```

3. Reuse the current `pangolin_server_secret` in the SOPS file (Pangolin's data is bound to it) and install as in step 2.
   The new host key must replace the old one as SOPS recipient (`sops updatekeys`).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Please login as the user ubuntu` when connecting as `root` | Ubuntu OCI images prefix `/root/.ssh/authorized_keys` with a `command="echo 'Please login as the user ubuntu'..."` restriction. Copy the `ubuntu` user's `authorized_keys` to root before `nixos-anywhere`, or install as `ubuntu@<ip>`. |
| `Too many authentication failures` | The host's sshd has `MaxAuthTries 3` and an agent offering several keys exhausts it. Use `IdentitiesOnly yes` (with `-i <key>`) or a dedicated agent holding only the right key. |
| `Connection refused` on the agent socket from `nonix` (macOS) | The container only sees the `launchd`-session agent: `launchctl setenv SSH_AUTH_SOCK ...` then restart OrbStack (see the macOS note in step 2). |
| Tailscale does not register, or the node is `kazimierz-akn-1` | The `tailscaleAuthKey` (Pulumi `TailnetKey`, single use, 7 days) is consumed by a first boot, so a redone install or an old key needs a new one: `pulumi up --replace <urn of kazimierz-tailscale-key>`, then update `tailscale_authkey` in the SOPS file. Delete the stale node from the Tailscale admin console **before** the first boot, or it becomes `kazimierz-akn-1`. |
| `pulumi stack output` fails or targets the wrong stack | The live stack is `kazimierz_akn.live`: pass `--stack kazimierz_akn.live` (the `nixos:*` tasks already do). |

## Post-Bootstrap Configuration

Configuration and secrets both live in Git (the flake and the SOPS file); there is nothing to edit by hand on the host.
Changes are applied from your machine over the tailnet:

```bash
# 1. Edit modules/pangolin.nix, configuration.nix, ... (image tags and digests are bumped together in pangolin.nix)
# 2. Commit the change
# 3. Apply it
mise run nixos:oci:update
```

The task refreshes the binding IP, then runs
`nixos-rebuild switch --flake .#kazimierz-akn-aarch64 --target-host root@kazimierz-akn` (taken from the nixpkgs revision
locked in `flake.lock`). `nixos-rebuild --rollback` on the host goes back to the previous generation. There is no
automatic update, on purpose: the instance is not supervised yet and a rollback is hard to do cleanly (see
[ADR-008](../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md)).
Refresh the inputs with `nonix flake update`, then deploy.
