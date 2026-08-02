# Ansible Infrastructure for Kazimierz.AKN

Deploy and manage the Kazimierz.AKN gateway VPS using Ansible with GitOps automation via `ansible-pull`.

This infrastructure uses **Docker Compose** instead of Kubernetes for simplified operation and reduced resource
overhead. See [ADR-008](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md) for the architectural
decision rationale.

## Architecture

The VPS pulls its own configuration from Git on a timer -- there's no push from a developer machine except for the very
first bootstrap run.

```text
Git Repository (github.com/chezmoidotsh/arcane)
                    |
                    | ansible-pull (every 15 min, systemd timer)
                    v
              Kazimierz.AKN VPS (OCI, eu-paris-1)

  system_setup        -- OS baseline: DNS, Docker, Tailscale, UFW, sshd/fail2ban/sysctl hardening, unattended-upgrades
  gitops_automation    -- installs Ansible + the ansible-pull systemd service/timer, vault secret setup
  ara_server           -- ARA (Ansible Run Analysis) API, exposed over Tailscale Serve
  pangolin              -- Pangolin + Gerbil + Traefik stack (Docker Compose)
```

Provisioning of the OCI infrastructure itself (compartment, VCN, instance, DNS) is a separate Pulumi stack -- see
`../pulumi/`.

## Directory Structure

```text
ansible/
├── README.md
├── requirements.yml            # Ansible Galaxy roles/collections
├── site.yml                    # Orchestrator playbook (the one ansible-pull runs)
├── inventory/
│   ├── local.yml                # Used by ansible-pull itself (ansible_connection: local)
│   ├── remote.yml                # For a manual run from an operator's machine (SSH)
│   └── host_vars/kazimierz.yml   # Host-specific secrets and config (ansible-vault encrypted values)
└── roles/
    ├── system_setup/            # Base OS, hardening
    ├── gitops_automation/        # ansible-pull systemd wiring
    ├── ara_server/                # Run tracking
    └── pangolin/                  # See roles/pangolin/README.md
```

## Prerequisites

- Ansible >= 2.14, and the roles/collections in `requirements.yml`:
  ```bash
  ansible-galaxy install -r requirements.yml
  ```
- An `ANSIBLE_VAULT_PASSWORD` to decrypt the `!vault`-encrypted values in `inventory/host_vars/kazimierz.yml` (Tailscale
  auth key, Pangolin server secret, SMTP credentials, Slack webhook token).

## Initial Bootstrap

The OCI instance boots from a stock Ubuntu image with only an SSH key injected (via Pulumi's `ssh_authorized_keys`
config, cloud-init metadata) -- nothing else is pre-installed. The first `site.yml` run has to happen manually, over
SSH, before `ansible-pull`'s own timer can take over:

```bash
export ANSIBLE_VAULT_PASSWORD="..."
ansible-pull \
  --url https://github.com/chezmoidotsh/arcane \
  --checkout main \
  --directory /opt/chezmoidotsh/arcane \
  --inventory projects/kazimierz.akn/src/infrastructure/ansible/inventory/local.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD") \
  projects/kazimierz.akn/src/infrastructure/ansible/site.yml
```

Run this as `root` on the instance itself (`inventory/remote.yml` lets you trigger it over SSH from elsewhere, see
below). Public SSH reachability is controlled at the OCI network security group level -- the `unsecure` Pulumi config
toggle in `../pulumi/stack/oci/network.ts` -- not by this role; UFW always allows port 22 so SSH works whenever the NSG
lets traffic through. Tailscale SSH (enrolled during this same run, `--ssh`) is available as an additional path
regardless of the NSG state.

From then on, `gitops_automation`'s systemd timer re-runs `site.yml` automatically every 15 minutes.

### Running it from your own machine instead

```bash
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-playbook -i inventory/remote.yml site.yml --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

## GitOps Workflow

```bash
# 1. Edit a role, template, or host_vars value
vim projects/kazimierz.akn/src/infrastructure/ansible/roles/pangolin/templates/docker-compose.yml.j2

# 2. Commit and push to main (see .agents/skills/git-commit/SKILL.md for this repo's commit convention)
git push origin main

# 3. Within 15 minutes, ansible-pull applies it -- or trigger it immediately over Tailscale SSH:
ssh root@kazimierz-akn.<tailnet>.ts.net "systemctl start ansible-pull.service"
```

## Monitoring and Debugging

```bash
# ansible-pull
systemctl status ansible-pull.timer
journalctl -u ansible-pull.service -f

# Pangolin stack
docker compose -f /opt/pangolin/docker-compose.yml ps
docker compose -f /opt/pangolin/docker-compose.yml logs -f

# ARA (run history/analysis) -- native ara-server package, not a container
systemctl status ara-server.service
# Web UI: the Tailscale Serve URL configured in roles/ara_server
```

## Security

- **SSH exposure**: controlled at the OCI network security group level (`unsecure` Pulumi config toggle), not by
  Ansible/UFW -- see `../pulumi/stack/oci/network.ts`. `sshd` itself is hardened regardless (key-only, no root password
  auth, no TCP forwarding) as defense in depth, and Tailscale SSH (`--ssh` in `system_setup`) is available as an
  additional access path independent of the NSG state.
- **fail2ban**: local-only bans on `sshd` brute-force attempts. Deliberately not a shared-threat-intel bouncer like
  CrowdSec was -- see `roles/pangolin/README.md` for why that got dropped.
- **UFW**: default-deny incoming, explicit allow list (`ufw_allowed_ports` in `host_vars/kazimierz.yml`), including SSH
  -- UFW is not the SSH access-control layer, the NSG is.
- **Kernel/sysctl**: ICMP redirects and source routing rejected, SYN cookies, reverse-path filtering -- see
  `roles/system_setup/templates/99-sysctl-hardening.conf.j2`.
- **Unattended upgrades**: security-origin packages only, auto-reboot at 03:00 only if required (checks
  `/var/run/reboot-required`, doesn't reboot unconditionally). A daily timer at 03:15 posts to Slack (reusing
  `arnos_slack_token`/`arnos_slack_channel`) when packages were actually installed that day -- silent no-op otherwise.
- **Secrets**: `ansible-vault` for values that live in Git (`inventory/host_vars/kazimierz.yml`); the vault password
  itself is never committed -- it's supplied via `ANSIBLE_VAULT_PASSWORD` at runtime.

## References

- [ADR-008: Kazimierz Ansible over Kubernetes](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md)
- [Ansible Pull documentation](https://docs.ansible.com/ansible/latest/cli/ansible-pull.html)
- [Pangolin documentation](https://digpangolin.com/)
