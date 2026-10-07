# Ansible Infrastructure for Kazimierz.AKN

Deploy and manage the Kazimierz.AKN gateway VPS using Ansible, run remotely over SSH from an operator machine.

This infrastructure uses **Docker Compose** instead of Kubernetes for simplified operation and reduced resource
overhead. See [ADR-008](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md) for the architectural
decision rationale.

## Architecture

The playbook is run remotely from a machine with SSH access to the VPS. There is no automatic sync: configuration
changes are applied by re-running the playbook by hand.

```text
Operator machine (this repository)
                    |
                    | ansible-playbook (SSH, login as ubuntu + become)
                    v
              Kazimierz.AKN VPS (OCI, eu-paris-1)

  system_setup        -- OS baseline: DNS, Docker, Tailscale, UFW, sshd/fail2ban/sysctl hardening, unattended-upgrades
  pangolin              -- Pangolin + Gerbil + Traefik stack (Docker Compose)
```

Provisioning of the OCI infrastructure itself (compartment, VCN, instance, DNS) is a separate Pulumi stack -- see
`../pulumi/`.

## Directory Structure

```text
ansible/
├── README.md
├── requirements.yml            # Ansible Galaxy roles/collections
├── site.yml                    # Orchestrator playbook
├── inventory/
│   ├── local.yml                # To run the playbook locally on the host (ansible_connection: local)
│   ├── remote.yml                # Run from an operator's machine (SSH)
│   └── host_vars/kazimierz.yml   # Host-specific secrets and config (ansible-vault encrypted values)
└── roles/
    ├── system_setup/            # Base OS, hardening
    └── pangolin/                  # See roles/pangolin/README.md
```

## Prerequisites

- Ansible >= 2.14, and the roles/collections in `requirements.yml`:
  ```bash
  ansible-galaxy install -r requirements.yml
  ```
- An `ANSIBLE_VAULT_PASSWORD` to decrypt the `!vault`-encrypted values in `inventory/host_vars/kazimierz.yml` (Tailscale
  auth key, Pangolin server secret, SMTP credentials, Slack webhook token). It is stored sops-encrypted in
  `.vault-password.sops` (next to `site.yml`):
  ```bash
  export ANSIBLE_VAULT_PASSWORD="$(sops --decrypt .vault-password.sops)"
  ```

## Running the Playbook

The OCI instance boots from a stock Ubuntu image with only an SSH key injected (via Pulumi's `ssh_authorized_keys`
config, cloud-init metadata) -- nothing else is pre-installed. The first run is the same as every later one, from a
machine with SSH access to the instance (login as `ubuntu`, privilege escalation via `become`):

```bash
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-playbook -i inventory/remote.yml site.yml --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

Public SSH reachability is controlled at the OCI network security group level -- the `unsecure` Pulumi config toggle in
`../pulumi/stack/oci/network.ts` -- not by this role; UFW always allows port 22 so SSH works whenever the NSG lets
traffic through. Tailscale SSH (enrolled during the first run, `--ssh`) is available as an additional path regardless of
the NSG state.

`inventory/local.yml` can be used to run the playbook locally on the host itself (`ansible_connection: local`).

## Configuration Workflow

```bash
# 1. Edit a role, template, or host_vars value
vim projects/kazimierz.akn/src/infrastructure/ansible/roles/pangolin/templates/docker-compose.yml.j2

# 2. Commit (see .agents/skills/git-commit/SKILL.md for this repo's commit convention)

# 3. Re-run the playbook to apply it
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-playbook -i inventory/remote.yml site.yml --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

## Monitoring and Debugging

```bash
# Pangolin stack
docker compose -f /opt/pangolin/docker-compose.yml ps
docker compose -f /opt/pangolin/docker-compose.yml logs -f
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
  itself is never committed in clear -- it's stored sops-encrypted in `.vault-password.sops` and supplied via
  `ANSIBLE_VAULT_PASSWORD` at runtime.

## References

- [ADR-008: Kazimierz Ansible over Kubernetes](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md)
- [Pangolin documentation](https://digpangolin.com/)
