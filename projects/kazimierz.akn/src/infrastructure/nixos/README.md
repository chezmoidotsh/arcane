# kazimierz.akn — NixOS OCI Gateway

Public-access gateway for the chezmoi.sh homelab. Runs on Oracle Cloud Free Tier
(Ampere A1, `aarch64-linux`) as a NixOS VM bootstrapped via nixos-infect on a
fresh Ubuntu instance.

## What runs here

| Service                                     | Role                                          | Ports                                              |
| ------------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| **Pangolin** (`pkgs.fosrl-pangolin`)        | WireGuard gateway controller + dashboard      | 3000 (UI), 3001 (API), 3002 (admin)                |
| **Gerbil** (`pkgs.fosrl-gerbil`)            | WireGuard tunnel manager                      | 3004 (mgmt, localhost); UDP 51820 / 21820 (public) |
| **Traefik** (`pkgs.traefik`)                | Reverse proxy, TLS termination, ACME DNS-01   | 80, 443                                            |
| **error-pages** (`tarampampam/error-pages`) | Branded 4xx/5xx error renderer                | 8080 (localhost)                                   |
| **comin**                                   | Pull-mode GitOps agent (nixos-rebuild switch) | —                                                  |

No CrowdSec, no Badger, no container runtime — all services are native NixOS systemd units.

### Network topology

```
Internet
  │
  ├─ :80 / :443 ──► Traefik ──► Pangolin HTTP provider (dynamic routes)
  │                              └─► NixOS file provider (static middlewares)
  │
  ├─ UDP :51820 / :21820 ──► Gerbil (WireGuard tunnels)
  │
  └─ :22 ──► sshd  (temporary — removed in Phase 6 once Tailscale is active)

Traefik ──► http://127.0.0.1:8080 ──► error-pages (error middleware)
```

### GitOps model

`comin` polls this repository every 60 s and runs `nixos-rebuild switch` on the
`main` branch, or `nixos-rebuild test` on the `testing-kazimierz` branch.
The evaluated subdirectory is `projects/kazimierz.akn/src/infrastructure/nixos/`.

***

## Installation

### Prerequisites

* A fresh OCI Ubuntu 24.04 or 26.04 instance (`Ampere A1`, `aarch64`)
* SSH access as root (or a user with `sudo -i`)
* Your workstation authenticated to OpenBao (`mise run bao:login:admin`)

> **Custom OCI image path (Phase 5):** A NixOS OCI image build + direct import
> path is planned but deferred — it requires an OCI Object Storage bucket that
> has not been provisioned yet. Until then, nixos-infect is the only supported
> installation path.

### Step 1a — Bootstrap NixOS on the Ubuntu instance

Run the install script on the OCI instance as root:

```sh
curl -fsSL \
  https://raw.githubusercontent.com/chezmoidotsh/arcane/main/projects/kazimierz.akn/src/infrastructure/nixos/install.sh \
  | bash
```

The script sets up swap, then runs `nixos-infect` which installs a minimal
NixOS from the `nixos-unstable` channel. The instance **reboots** into NixOS
at the end. `nixos-infect` master does not support flakes — the full
kazimierz.akn configuration is applied in the next step.

### Step 1b — Apply the kazimierz.akn flake

After the reboot, SSH back in as root and apply the full configuration:

```sh
nixos-rebuild switch \
  --flake "github:chezmoidotsh/arcane/main?dir=projects/kazimierz.akn/src/infrastructure/nixos#kazimierz" \
  --extra-experimental-features "nix-command flakes"
```

> To test a branch before merging, replace `main` with the branch name.

The system switches to the kazimierz.akn config live (no reboot needed).

### Step 2 — Provision secrets

> **Why from your workstation:** The OCI instance has no access to
> `vault.chezmoi.sh` — OpenBao is only reachable from within the homelab
> network (Tailscale). Secrets are piped directly from your workstation to the
> instance over SSH; they never touch your local disk.

On your workstation, with `bao` authenticated and the instance IP at hand:

```sh
export VAULT_ADDR="https://vault.chezmoi.sh"
INSTANCE="root@<public-ip>"

# Create the secrets directory on the instance
ssh "$INSTANCE" 'install -d -m 0700 /run/secrets/nix'

# Pipe each secret directly over SSH (no local disk write)
bao kv get -field=value kazimierz.akn/pangolin/auth/server-secret \
  | ssh "$INSTANCE" 'cat > /run/secrets/nix/pangolin-secret'

bao kv get -field=value kazimierz.akn/comin/auth/slack-cli-token \
  | ssh "$INSTANCE" 'cat > /run/secrets/nix/slack-cli-token'

bao kv get -field=smtp_user kazimierz.akn/pangolin/config/smtp \
  | ssh "$INSTANCE" 'cat > /run/secrets/nix/smtp-user'

bao kv get -field=smtp_pass kazimierz.akn/pangolin/config/smtp \
  | ssh "$INSTANCE" 'cat > /run/secrets/nix/smtp-pass'

# Cloudflare token — EnvironmentFile format required by systemd
printf 'CLOUDFLARE_DNS_API_TOKEN=%s\n' \
  "$(bao kv get -field=value shared/third-parties/cloudflare/iam/kazimierz.akn/traefik-dns-rw)" \
  | ssh "$INSTANCE" 'cat > /run/secrets/nix/cloudflare-api-token'

# Lock down permissions
ssh "$INSTANCE" 'chmod 0600 /run/secrets/nix/*'
```

### Step 3 — Start services

```sh
ssh "$INSTANCE" 'systemctl start pangolin gerbil traefik error-pages'
```

### Step 4 — Complete Pangolin initial setup

```sh
ssh "$INSTANCE" 'journalctl -u pangolin --no-pager | grep -i token'
# Then visit: https://pangolin.chezmoi.sh/auth/initial-setup
```

> **Note:** `/run` is a tmpfs — secrets are lost on reboot. Re-run step 2 after
> each reboot until Phase 4 implements an on-boot secrets fetcher.

***

## Secrets management

### OpenBao paths

Paths follow [ADR-002](../../../../../../docs/decisions/002-openbao-secrets-topology.md)
(mount-per-project topology) and [ADR-003](../../../../../../docs/decisions/003-openbao-path-naming-conventions.md)
(`/{cluster}/{app}/{category}/{name}` convention).

| Secret file on instance | OpenBao path                                                       | Format      | Notes                                                                                                           |
| ----------------------- | ------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `pangolin-secret`       | `kazimierz.akn/pangolin/auth/server-secret`                        | plain value | Pangolin shared server secret                                                                                   |
| `slack-cli-token`       | `kazimierz.akn/comin/auth/slack-cli-token`                         | plain value | Slack Bot token for comin notifications                                                                         |
| `smtp-user`             | `kazimierz.akn/pangolin/config/smtp` field `smtp_user`             | plain value | SMTP relay username                                                                                             |
| `smtp-pass`             | `kazimierz.akn/pangolin/config/smtp` field `smtp_pass`             | plain value | SMTP relay password                                                                                             |
| `cloudflare-api-token`  | `shared/third-parties/cloudflare/iam/kazimierz.akn/traefik-dns-rw` | `KEY=value` | `CLOUDFLARE_DNS_API_TOKEN=<token>` — systemd EnvironmentFile; in `shared/` per ADR-003 (third-party credential) |
| `tailscale-auth-key`    | `kazimierz.akn/tailscale/auth/auth-key`                            | plain value | Phase 6 — not needed until Tailscale rollout                                                                    |

### Storing secrets in OpenBao (first time only)

KV v2 requires two commands per secret: `bao kv put` for the data,
`bao kv metadata put` for custom annotations.

Run once from your workstation with `bao` authenticated (`mise run bao:login`):

```sh
export VAULT_ADDR="https://vault.chezmoi.sh"

# Pangolin server secret
bao kv put kazimierz.akn/pangolin/auth/server-secret \
  value="$(openssl rand -hex 32)"
bao kv metadata put \
  -custom-metadata=origin=manual \
  -custom-metadata=description="Pangolin shared server secret" \
  -custom-metadata=owner="kazimierz.akn/pangolin" \
  kazimierz.akn/pangolin/auth/server-secret

# Slack Bot token for comin notifications
bao kv put kazimierz.akn/comin/auth/slack-cli-token \
  value="xoxb-..."
bao kv metadata put \
  -custom-metadata=origin=manual \
  -custom-metadata=description="Slack Bot token for comin deploy notifications" \
  -custom-metadata=owner="kazimierz.akn/comin" \
  kazimierz.akn/comin/auth/slack-cli-token

# SMTP relay credentials (Mailjet)
bao kv put kazimierz.akn/pangolin/config/smtp \
  smtp_user="..." \
  smtp_pass="..."
bao kv metadata put \
  -custom-metadata=origin=manual \
  -custom-metadata=description="Mailjet SMTP relay credentials for Pangolin" \
  -custom-metadata=owner="kazimierz.akn/pangolin" \
  kazimierz.akn/pangolin/config/smtp

# Cloudflare DNS API token (in shared/ per ADR-003 — third-party credential)
bao kv put shared/third-parties/cloudflare/iam/kazimierz.akn/traefik-dns-rw \
  value="..."
bao kv metadata put \
  -custom-metadata=origin=manual \
  -custom-metadata=description="Cloudflare DNS API token for Traefik ACME DNS-01" \
  -custom-metadata=owner="kazimierz.akn/traefik" \
  -custom-metadata=x-apps="traefik" \
  shared/third-parties/cloudflare/iam/kazimierz.akn/traefik-dns-rw

# Tailscale auth key (Phase 6)
bao kv put kazimierz.akn/tailscale/auth/auth-key \
  value="tskey-auth-..."
bao kv metadata put \
  -custom-metadata=origin=manual \
  -custom-metadata=description="Tailscale ephemeral auth key for kazimierz.akn" \
  -custom-metadata=owner="kazimierz.akn/tailscale" \
  kazimierz.akn/tailscale/auth/auth-key
```

***

## Updating

`comin` handles updates automatically. After merging a change to `main`, the
instance picks it up within 60 seconds and runs `nixos-rebuild switch`.

To test a change before merging:

```sh
git push origin HEAD:testing-kazimierz
# comin runs nixos-rebuild test on the instance — rollback on reboot if it breaks
```

Check comin status:

```sh
ssh root@<instance-ip> 'journalctl -u comin -f'
```

***

## Troubleshooting

```sh
# Service logs
journalctl -u pangolin -n 100
journalctl -u gerbil   -n 100
journalctl -u traefik  -n 100

# Traefik ACME certificate state
cat /var/lib/traefik/acme.json | jq '.letsencrypt.Certificates[].domain'

# Firewall
nft list ruleset

# WireGuard interfaces (created by Gerbil)
wg show
ip link show type wireguard

# Pangolin config (generated at startup by ExecStartPre)
cat /var/lib/pangolin/config/config.yml
```
