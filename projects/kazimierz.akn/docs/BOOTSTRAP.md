# Bootstrap Kazimierz.AKN VPS

This document describes how to bootstrap the Kazimierz.AKN VPS from a freshly provisioned OCI instance into a fully
configured node, using Ansible run remotely over SSH.

## Overview

The OCI instance and network (compartment, VCN/NSG, instance, DNS records) are provisioned by the Pulumi stack in
`src/infrastructure/pulumi/`. That instance boots from a stock Ubuntu image with only an SSH key injected via cloud-init
(Pulumi's `ssh_authorized_keys` config) -- nothing else is pre-installed. The first `site.yml` run has to happen
manually, over SSH, from a machine running Ansible.

**Key Components** (installed by `site.yml`, see
[src/infrastructure/ansible/README.md](../src/infrastructure/ansible/README.md) for the full role breakdown):

- **system_setup**: OS baseline (DNS, Docker, Tailscale with SSH, UFW, sshd/fail2ban/sysctl hardening,
  unattended-upgrades)
- **pangolin**: Pangolin + Gerbil + Traefik stack via Docker Compose

## Prerequisites

1. **OCI instance**: provisioned via the Pulumi stack (`pulumi up` in `src/infrastructure/pulumi/`) -- an Always Free
   `VM.Standard.A1.Flex` ARM instance in `eu-paris-1`, running Ubuntu.
2. **Public SSH reachability**: controlled at the OCI network security group level, not by Ansible/UFW -- see the
   `unsecure` Pulumi config toggle in `src/infrastructure/pulumi/stack/oci/network.ts`. Flip it on temporarily for the
   initial bootstrap if the instance isn't otherwise reachable.
3. **Ansible Vault password**: `ANSIBLE_VAULT_PASSWORD`, to decrypt the `!vault`-encrypted values in
   `src/infrastructure/ansible/inventory/host_vars/kazimierz.yml` (Tailscale auth key, Pangolin server secret, SMTP
   credentials, Slack webhook token). It is stored sops-encrypted in `src/infrastructure/ansible/.vault-password.sops`
   (`sops --decrypt` it).
4. **Ansible** (`ansible-core`) on your own machine, with SSH access to the instance (login as `ubuntu`, privilege
   escalation via `become`).

## Bootstrap Procedure

### 1. Run `site.yml` over SSH

```bash
export ANSIBLE_VAULT_PASSWORD="$(sops --decrypt projects/kazimierz.akn/src/infrastructure/ansible/.vault-password.sops)"
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-playbook -i inventory/remote.yml site.yml --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

This single run installs Tailscale (enrolled with `--ssh`, so Tailscale SSH becomes available as an additional access
path), and the Pangolin stack.

### 2. Verify Deployment

1. **Check Tailscale**: the VPS should appear in your Tailscale console under the hostname set by `tailscale_hostname`
   in `host_vars/kazimierz.yml`.
2. **SSH via Tailscale**: `ssh root@<tailscale-hostname>.<tailnet>.ts.net`
3. **Check the Pangolin stack**:
   ```bash
   docker compose -f /opt/pangolin/docker-compose.yml ps
   ```

## Post-Bootstrap Configuration

Configuration and secrets both live in Git (`host_vars/kazimierz.yml`, ansible-vault encrypted); there is nothing to
edit by hand on the host itself, and no automatic sync: changes are applied by re-running the playbook. To change
something:

```bash
# 1. Edit a role, template, or host_vars value
vim projects/kazimierz.akn/src/infrastructure/ansible/roles/pangolin/templates/docker-compose.yml.j2

# 2. Commit the change

# 3. Re-run the playbook
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-playbook -i inventory/remote.yml site.yml --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

On first deployment, visit `{{ pangolin_dashboard_url }}/auth/initial-setup` to create the Pangolin admin account -- the
setup token is printed by the playbook run (extracted from the `pangolin` container logs) and only appears once.

For full details, see the [Ansible Infrastructure README](../src/infrastructure/ansible/README.md) and the
[Pangolin role README](../src/infrastructure/ansible/roles/pangolin/README.md).
