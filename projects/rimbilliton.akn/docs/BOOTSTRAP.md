# Bootstrap Rimbilliton.AKN Minecraft Server

This document describes how to bootstrap the Rimbilliton.AKN server from nothing into a NixOS host running Pelican
(Panel and Wings), with Pocket-ID SSO and backups to Backblaze B2.

## Overview

The OCI resources (compartment, VCN/subnet/NSG, instance), the DNS records, the B2 bucket and the Tailscale key are
provisioned by the Pulumi stack in `src/infrastructure/pulumi/`. The Pocket-ID group and OIDC client are created by hand
(see step 2): the Pulumi Pocket-ID provider is no longer functional, so that part of the stack is disabled (see
`stack/pocket-id.ts`). The instance boots from a stock Ubuntu image with only an SSH key injected via cloud-init
(Pulumi's `ssh_authorized_keys` config). NixOS is then installed over it with `nixos-anywhere`, which is the only manual
step.

**Key Components** (defined in `src/infrastructure/nixos/`):

- **configuration.nix**: Boot, network, SSH (Tailscale only), Tailscale, sops-nix
- **modules/pelican.nix**: Pelican Panel and Wings as Docker containers (pinned beta releases)
- **modules/caddy.nix**: Caddy (TLS) in front of the Panel (`minecraft.chezmoi.sh`) and Wings
  (`main.minecraft.chezmoi.sh`)
- **modules/backup.nix**: restic backups to Backblaze B2

## Prerequisites

1. **Tooling**: `mise install` (provides `sops`), plus Docker. Nix is not installed locally: every Nix command goes
   through `nonix` (`scripts/nonix`, on the `PATH` after `mise install`), which runs it in a container. That includes
   `ssh-to-age` (`nonix run nixpkgs#ssh-to-age`).
2. **Credentials**: OCI as `TF_VAR_tenancy_ocid` / `TF_VAR_user_ocid` / `TF_VAR_fingerprint` / `TF_VAR_private_key` /
   `TF_VAR_region` (same as kazimierz.akn), and the Backblaze, Cloudflare and Tailscale provider credentials.
3. **Tailnet ACL**: `tag:minecraft` declared in `tagOwners`.
4. **Pulumi stack**: `kazimierz_akn.live` (parent compartment) already applied.
5. **Pocket-ID**: admin access to create a group and an OIDC client (no Pulumi involved, see step 2).

## Bootstrap Procedure

### 1. Provision the infrastructure

```bash
cd projects/rimbilliton.akn/src/infrastructure/pulumi
pnpm install
pulumi stack init rimbilliton_akn.live   # then set the configuration below
mise run pulumi:diff && mise run pulumi:apply
```

Pulumi configuration (`pulumi config set <key> <value>`, add `--secret` for the secret ones):

| Key                                           | Secret | Value                                    |
| --------------------------------------------- | ------ | ---------------------------------------- |
| `oci:region`                                  | no     | `eu-paris-1`                             |
| `ssh_authorized_keys`                         | no     | public key used for the first SSH access |
| `cloudflare_account_id`, `cloudflare_zone_id` | yes    | from the Cloudflare dashboard            |
| `tailscale:tailnet`                           | yes    | tailnet name                             |

If OCI answers `Out of host capacity`, retry later (known Always Free A1 issue).

### 2. Create the Pocket-ID group and OIDC client by hand

Pelican signs users in with Pocket-ID itself through a plugin that NixOS installs (step 6). Only the client has to be
created by hand, and its ID and secret go into the SOPS file (step 3). In the Pocket-ID UI (`https://auth.chezmoi.sh`),
as an admin:

1. Create the user group `minecraft` (friendly name `Minecraft`). Members can sign in to Pelican.
2. Create an OIDC client named `Minecraft` with:
   - launch URL `https://minecraft.chezmoi.sh/`
   - callback URL `https://minecraft.chezmoi.sh/auth/oauth/callback/pocketid` (Pelican builds it as
     `/auth/oauth/callback/<provider id>`; the exact URL is also shown in Settings > OAuth once the plugin is active)
   - confidential client (not public), consent skipped, **PKCE disabled**: Pelican's Pocket ID plugin sends no
     `code_challenge`, so a client that requires PKCE answers `invalid_request ... requires PKCE`
   - group restriction enabled, allowed groups `admin` and `minecraft`
3. Keep the client ID and the client secret: they go in the SOPS file as `oauth_pocketid_client_id` and
   `oauth_pocketid_client_secret` (step 3).

### 3. Prepare the host key and secrets

sops-nix decrypts secrets with the host SSH key, which must therefore exist before the first boot:

```bash
cd ../nixos
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
nonix run nixpkgs#ssh-to-age -- -i extra/etc/ssh/ssh_host_ed25519_key.pub   # host age key, already in the rule of the nested .sops.yaml
cp secrets/rimbilliton.example.yaml secrets/rimbilliton.sops.yaml   # fill from `pulumi stack output --show-secrets`
sops --encrypt --in-place secrets/rimbilliton.sops.yaml
```

Fill `tailscale_authkey`, `restic_*` and the Pocket-ID client (`oauth_pocketid_client_id`,
`oauth_pocketid_client_secret`); the three `wings_*` values only exist once the node is created in the Panel (step 6),
so add them then.

The file must be named `rimbilliton.sops.yaml`: that is the name matched by the creation rule of
`src/infrastructure/nixos/.sops.yaml` (admin key + host key as recipients), and the one `configuration.nix` reads. That
nested config shadows the root `.sops.yaml` (SOPS uses the nearest one and never merges), so any new rule for this
directory goes in it and must keep the admin key. `secrets/*.yaml` is
git-ignored except `*.example.yaml` and `*.sops.yaml`, so a plaintext copy cannot be committed by accident.

`flake.lock` is committed so every build uses the same input revisions (refresh it with `nonix flake update`). Then set
`bucket` (`modules/backup.nix`), check the Pelican image tags (`modules/pelican.nix`, Panel and Wings are betas bumped
together) and add your SSH public key (`configuration.nix`). Do not commit `extra/`.

### 4. Install NixOS

SSH is closed on the OCI network security group: temporarily run `pulumi config set unsecure true && pulumi up`, then
set it back to `false` (and apply again) once NixOS is installed.

The instance still runs the stock Ubuntu image, which lacks `cpio`; nixos-anywhere needs it to build the kexec initrd
(`aborted: no cpio command found`). Install it first, from a shell that can reach your SSH agent:

```bash
IP=$(pulumi -C ../pulumi stack output publicIp)
ssh ubuntu@"$IP" 'sudo apt-get update -qq && sudo apt-get install -y cpio'
```

nixos-anywhere runs inside the `nonix` container, so the SSH client doing the install is the container's, not yours. It
needs your SSH agent (see [Reaching your SSH agent from the container](#reaching-your-ssh-agent-from-the-container)),
and that agent must hold the private key matching `ssh_authorized_keys` in the Pulumi config, which cloud-init installs
for the `ubuntu` user:

```bash
nonix --docker '-v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent' \
  run github:nix-community/nixos-anywhere -- --flake .#rimbilliton-akn \
  --extra-files extra --kexec-extra-flags '--kexec-syscall' --target-host ubuntu@"$IP"
```

`--kexec-extra-flags '--kexec-syscall'` forces the legacy `kexec_load` syscall: with the default `kexec_file_load`, the
Oracle arm64 kernel fails with `kexec_file_load failed: Address not available`.

If the run fails after the kexec step, the instance is no longer Ubuntu: it already runs the NixOS installer, where only
`root` exists (`ubuntu@` then answers `Permission denied` or prompts for a password). Do not start over, resume from the
disk step, as `root`:

```bash
nonix --docker '-v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent' \
  run github:nix-community/nixos-anywhere -- --flake .#rimbilliton-akn \
  --extra-files extra --phases disko,install,reboot --target-host root@"$IP"
```

A flake only sees files known to git: run `git add -N flake.lock secrets/rimbilliton.sops.yaml` if the build complains
about an untracked path.

The `--docker` value above is for Docker Desktop or OrbStack on macOS; use the matching row of the table below
otherwise.

#### Reaching your SSH agent from the container

`nonix` accepts extra `docker run` arguments before the Nix command:

| Flag                    | Effect                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `--docker '<args>'`     | Extra `docker run` arguments, split on whitespace, repeatable (`--docker '-v a:b'`) |
| `-e`, `--env KEY=VALUE` | Set an environment variable in the container (`-e KEY` forwards the host's value)   |

Which arguments expose an agent depends on where Docker runs:

| Docker runs on                   | `--docker` value                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux (native Docker)            | `'-v "$SSH_AUTH_SOCK:/ssh-agent" -e SSH_AUTH_SOCK=/ssh-agent'` (the socket is mounted directly; it must be readable by the container's root) |
| macOS (Docker Desktop, OrbStack) | `'-v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent'`                                                               |
| Any, no agent (key file on disk) | `'-v "$HOME/.ssh/id_ed25519:/root/.ssh/id_ed25519:ro"'`, then pass `-i /root/.ssh/id_ed25519` to nixos-anywhere                              |

On macOS the host's agent socket cannot be bind-mounted into the Linux VM that runs the containers: the file appears,
but connecting to it fails with `Connection refused`. The runtime instead offers a relay at
`/run/host-services/ssh-auth.sock`, which forwards the agent exposed by the macOS login session (the `SSH_AUTH_SOCK`
known to `launchd`), not the one of your current shell. With the default macOS agent nothing more is needed. With a
custom agent (Bitwarden, Secretive, 1Password, ...), point `launchd` at its socket and restart the runtime:

```bash
launchctl getenv SSH_AUTH_SOCK                                  # what the relay will forward
launchctl setenv SSH_AUTH_SOCK "<path of your agent's socket>"  # e.g. $HOME/.bitwarden-ssh-agent.sock
orb stop && orb start                                           # OrbStack; restart Docker Desktop otherwise
```

`launchctl setenv` does not survive a reboot. Check what the container sees before running the install: your key must be
listed.

```bash
docker run --rm -v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent nixos/nix ssh-add -l
```

#### Troubleshooting the install

| Symptom                                                             | Cause and fix                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Permission denied (publickey)`, `Identity file ... not accessible` | The container has no agent, or the agent lacks the key from `ssh_authorized_keys`. Check with `ssh-add -l` above     |
| `Connection closed by <ip> port 22`                                 | sshd throttles after repeated failures. Fix the cause, wait a minute or two, retry                                   |
| `no cpio command found, but required to build the new initrd`       | Install `cpio` on the instance (see above)                                                                           |
| `kexec_file_load failed: Address not available`                     | Add `--kexec-extra-flags '--kexec-syscall'` (see above)                                                              |
| `ubuntu@...` asks for a password after a failed run                 | The kexec already happened: the host is the NixOS installer. Resume with `root@` and `--phases disko,install,reboot` |
| `Connection refused` from `ssh-add -l` in the container             | The agent socket was bind-mounted from macOS. Use the relay row of the table instead                                 |
| `ssh-add -l` lists another agent's keys or "no identities"          | `launchd` points at a different agent: see `launchctl getenv SSH_AUTH_SOCK` above                                    |

### 5. Verify Deployment

```bash
tailscale status | grep rimbilliton-akn                    # the host joined the tailnet
ssh root@rimbilliton-akn systemctl status docker-pelican-panel docker-pelican-wings caddy
```

Open `https://minecraft.chezmoi.sh`: the Pelican installer must appear. Wings stays down (restarting) until step 6 gives
it a configuration.

### 6. Configure Pelican

1. **Panel**: finish the web installer at `https://minecraft.chezmoi.sh/installer` and create the admin account. The
   database is SQLite in `/var/lib/pelican-panel/data` (back it up, it holds the `APP_KEY`).
2. **Pocket-ID sign-in** (declared in `modules/pelican.nix`): the community plugin
   [Pocket ID Provider](https://hub.pelican.dev/plugins/pocketid-provider) (by Ebnater) is fetched by Nix at a pinned
   release, copied into the Panel's plugin directory and registered by the `pelican-plugins` unit, which also installs
   its PHP dependency and restarts the Panel once. The provider settings (`OAUTH_POCKETID_*`) are container environment
   variables, the client ID and secret coming from SOPS, so Settings > OAuth only reflects them. Because the plugin can
   only be registered once the web installer has run, start the unit after step 1 (then check Settings > OAuth and your
   profile's OAuth tab, link your own account there):

   ```bash
   ssh root@rimbilliton-akn 'systemctl restart pelican-plugins; journalctl -u pelican-plugins --no-pager -n 20'
   ```

   The log must say `Plugin installed and enabled.` the first time, and `Plugin is already installed!` afterwards. To
   update the plugin, bump the release URL and hash in `modules/pelican.nix`.

3. **Roles** (declared in `modules/pelican.nix`): the `pelican-roles` unit creates the role `Full Admin` (every
   permission the Panel knows). Assign it to users in the admin area (Users, then the Roles field); `Root Admin` stays
   built in and is not managed by NixOS. Users who only create their own servers need no role (see below). Like the
   plugin, it needs the web installer first:

   ```bash
   ssh root@rimbilliton-akn 'systemctl restart pelican-roles; journalctl -u pelican-roles --no-pager -n 10'
   ```

   **User-created servers**: the first-party plugin `user-creatable-servers` is installed the same way (pinned commit of
   the plugins repository, `pelican-plugins` unit). It adds a "create server" action to the users' own server list.
   Nodes used for it must carry the tag `user_creatable_servers` (node Tags field), and an admin sets each user's CPU,
   memory, disk and server limits in the admin area (Users, then the resource limits of the user, or its own menu). Per
   server, the module caps allocations at 1 and backups at 2 (`UCS_DEFAULT_*` in `modules/pelican.nix`).

4. **Node**: in the admin area create a node for this host.
   - FQDN `main.minecraft.chezmoi.sh`, port 443, "Behind Proxy" enabled (Caddy terminates TLS)
   - memory and disk limited (about 4096 MiB and 30000 MiB), CPU 100 %, daemon base directory `/var/lib/pelican/volumes`
   - tag `user_creatable_servers` (Advanced Settings, Tags) so that users can create servers on it
   - from the node's Configuration tab, copy only `uuid`, `token_id` and `token` into the SOPS file: the rest of Wings'
     `config.yml` is declared in `modules/pelican.nix` and rendered by sops-nix

   ```bash
   cd src/infrastructure/nixos
   sops secrets/rimbilliton.sops.yaml   # add wings_uuid, wings_token_id, wings_token (see secrets/rimbilliton.example.yaml)
   nonix --docker '...' run nixpkgs#nixos-rebuild -- switch --flake .#rimbilliton-akn --target-host root@rimbilliton-akn
   ```

   The node must turn green. To rotate the token, reset it in the Panel and update the three values.

5. **Allocations**: declared in `modules/pelican.nix` (`allocations`: the 16 game ports `25565-25580` on `0.0.0.0`,
   aliased to `minecraft.chezmoi.sh` so the Panel shows players the DNS name). Once the node exists, apply them with
   `systemctl restart pelican-allocations; journalctl -u pelican-allocations --no-pager -n 10`. Idempotent: it only
   creates the missing ports, and prints a message if the node (matched on its FQDN) is not found. The same range is
   open in the OCI network security group and the host firewall; keep the three in sync. Each server takes one
   allocation.

Wings' `config.yml` is rendered at boot from the SOPS secrets (it is mounted from `/run/secrets/rendered`, never written
to the disk in clear text). The node token lives in the SOPS file, not in the backups of the Panel data.

## Post-Bootstrap Configuration

1. **First server**: create a Minecraft server (Paper, Fabric, ...) from the Panel on one allocation, set its memory
   limit (the VM has 1 OCPU and 6 GB: about 4 GB of Java heap in total, which suits a few players, not heavy modpacks),
   and schedule a backup every 6 hours (keep 3) so restic ships consistent archives.
2. **Give someone their own server**: add the user to the `minecraft` group in the Pocket-ID UI, let them sign in once
   (Pelican creates their account), then give them a role that allows creating and managing servers. At most 16 servers
   can run at once, one per allocation.
3. **Backups**: run `systemctl start restic-backups-minecraft`, then check the snapshot with `restic snapshots` against
   the B2 repository. To restore from these backups, see
   [BKP-20261005-00](../../../docs/procedures/backups/BKP-20261005-00.rimbilliton-minecraft-restore-from-restic.md).

Later changes are deployed over Tailscale:

```bash
nixos-rebuild switch --flake .#rimbilliton-akn --target-host root@rimbilliton-akn
```
