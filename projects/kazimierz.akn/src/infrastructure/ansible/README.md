# Ansible Infrastructure for Kazimierz.AKN

Deploy and manage the Kazimierz.AKN proxy/firewall/WAF cluster using Ansible with GitOps automation via `ansible-pull`.

This infrastructure uses **Docker Compose** instead of Kubernetes for simplified operation and reduced resource overhead. See [ADR-008](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md) for the architectural decision rationale.

## Architecture

Kazimierz.AKN uses a simple **GitOps pull-based deployment** where the VPS automatically pulls configuration from Git:

```text
Git Repository (github.com/chezmoidotsh/arcane)
                    |
                    | ansible-pull (every 15 min)
                    v
          Kazimierz.AKN VPS

  +--------------------------------+
  | Ansible Pull (GitOps)          |
  | - Systemd timer                |
  | - Pull & apply from Git        |
  +--------------------------------+

  +--------------------------------+
  | Pangolin Stack                 |
  | (Docker Compose)               |
  | - Pangolin application         |
  | - PostgreSQL database          |
  | - Traefik reverse proxy        |
  | - Gerbil WireGuard manager     |
  | - CrowdSec security engine     |
  +--------------------------------+
```

> **Why Docker Compose and not Kubernetes?**
> See [ADR-008](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md) for the full rationale. Summary: Pangolin is Docker Compose-first, Gerbil requires host networking, and Kubernetes adds 1GB overhead for minimal benefit on this single-app VPS.

## Directory Structure

```text
ansible/
├── README.md                          # This file
├── inventory/
│   └── hosts.yml                      # VPS configuration
├── playbooks/
│   ├── bootstrap.yml                  # System setup + Tailscale + ansible-pull
│   ├── pangolin-deploy.yml            # Pangolin Docker Compose stack
│   ├── ansible-pull-setup.yml         # GitOps configuration
│   └── site.yml                       # Main playbook (called by ansible-pull)
```

## Prerequisites

**Local machine:**

* Ansible >= 2.14
* SSH access to VPS
* Tailscale auth key (environment variable)
* Ansible Galaxy roles installed (see Installation section)

**VPS:**

* Ubuntu 22.04 LTS
* 4GB RAM minimum
* Public IP address (for initial bootstrap)

## Installation

Install required Ansible roles and collections from Ansible Galaxy:

```bash
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-galaxy install -r requirements.yml
```

This installs:

* `geerlingguy.docker` v7.6.1 - Docker installation and configuration
* `artis3n.tailscale` v4.2.1 - Tailscale VPN setup
* `community.general` >= 8.0.0 - General utilities
* `community.docker` >= 3.0.0 - Docker management

## Deployment

### Step 1: Bootstrap

Bootstrap the VPS with Tailscale and ansible-pull configuration:

```bash
# Set Tailscale auth key
export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx"

# Run bootstrap (connects via public IP initially)
ansible-playbook -i inventory/hosts.yml playbooks/bootstrap.yml
```

**What this does:**

* Updates system packages
* Installs base tools (git, ansible, python3, docker)
* Configures unattended-upgrades
* Sets hostname and timezone
* Installs and configures Tailscale
* **Sets up ansible-pull systemd timer**
* Displays Tailscale IP for future access

### Step 2: Verify ansible-pull

After bootstrap, ansible-pull is configured to run every 15 minutes. Verify it's working:

```bash
# Get Tailscale IP from bootstrap output
ssh root@<tailscale-ip>

# Check ansible-pull timer status
systemctl status ansible-pull.timer

# View recent ansible-pull logs
journalctl -u ansible-pull.service --since "1 hour ago"

# Trigger manual run
systemctl start ansible-pull.service
```

### Step 3: Configure Pangolin

ansible-pull will deploy Pangolin automatically, but you need to configure secrets:

```bash
# SSH to VPS
ssh root@<tailscale-ip>

# Edit Pangolin environment file
vim /opt/pangolin/docker-compose/.env

# Add required secrets:
# - DATABASE_PASSWORD
# - PANGOLIN_SECRET_KEY
# - CROWDSEC_BOUNCER_KEY
# etc.

# Restart Pangolin stack
cd /opt/pangolin/docker-compose
docker-compose restart
```

## GitOps Workflow

Once ansible-pull is configured, all changes are deployed via Git:

```bash
# 1. Make changes to playbooks or docker-compose files
vim projects/kazimierz.akn/src/infrastructure/ansible/roles/pangolin/templates/docker-compose.yml.j2

# 2. Commit and push
git add .
git commit -m ":wrench:(project:kazimierz.akn): Update Pangolin configuration"
git push origin main

# 3. Wait up to 15 minutes (or trigger manually)
ssh root@<tailscale-ip> "systemctl start ansible-pull.service"

# 4. Monitor deployment
ssh root@<tailscale-ip> "journalctl -u ansible-pull.service -f"
```

## Playbook Details

### bootstrap.yml

Initial VPS setup playbook.

**Tasks:**

* System package updates
* Install base packages (ansible, git, docker, python3)
* Configure unattended-upgrades
* Set hostname and timezone
* Install Tailscale
* Configure ansible-pull systemd timer

**Run once:** Yes (during initial setup)
**Idempotent:** Yes (safe to re-run)

### pangolin-deploy.yml

Deploys and manages the Pangolin Docker Compose stack.

**Tasks:**

* Install Docker Engine and Docker Compose
* Create Pangolin directories
* Clone Arcane repository
* Copy docker-compose.yml and configuration
* Create .env template if not exists
* Deploy Pangolin stack with docker-compose

**Run frequency:** Every ansible-pull (15 min)
**Idempotent:** Yes

### ansible-pull-setup.yml

Configures GitOps pull-based deployment.

**Tasks:**

* Install Ansible collections (community.docker, etc.)
* Create ansible-pull systemd service
* Create ansible-pull systemd timer (15 min interval)
* Enable and start timer
* Run initial test

**Run once:** Yes (during bootstrap)
**Idempotent:** Yes

### site.yml

**FINAL VERSION**: All-in-one playbook using `ansible-pull` for GitOps automation.

**Execution order (4 phases):**

1. **Setup ansible-pull systemd timer** (GitOps automation)
   * Install Ansible and required collections
   * Create systemd service for ansible-pull
   * Create systemd timer (runs every 15 minutes)
   * Repository cloned/updated automatically by ansible-pull to `/opt/chezmoidotsh/arcane`

2. **System Installation**
   * APT update and full system upgrade
   * Install base packages (git, curl, gnupg)
   * **Docker**: Install via `geerlingguy.docker` role with Compose v2.24.5
   * **Tailscale VPN**: Install via `artis3n.tailscale` role with SSH enabled
   * **UFW Firewall**:
     * Default deny-all policy
     * Allow HTTP (80), HTTPS (443)
     * Allow Newt Site Tunnels (51820/udp), Client Tunnels (21820/udp)
     * **SSH port 22 DISABLED** (Tailscale SSH only)
     * Enabled via notify handler (prevents SSH connection loss)
   * **Unattended Upgrades**: Automatic security updates with 03:00 reboot

3. **Ansible + ARA Installation**
   * Install Ansible core and collections (community.general, community.docker)
   * Deploy ARA Records Ansible via custom role (`roles/ara/`)
   * ARA runs as systemd service with Docker container
   * Tailscale Serve automatically configured for HTTPS access
   * Service management: `systemctl status ara.service`

4. **Pangolin Deployment**
   * Execute Pangolin Docker Compose deployment
   * Uses files from ansible-pull directory (`/opt/chezmoidotsh/arcane`)
   * Configure data directories and environment files

**Key Features:**

* ✅ **ansible-pull GitOps** - Automatic pulls every 15 minutes
* ✅ **No manual git operations** - ansible-pull handles everything
* ✅ **Self-contained** - One playbook does everything
* ✅ **UFW handler** - Firewall enabled safely via notify
* ✅ **ARA systemd service** - Managed lifecycle with Docker
* ✅ **SSH disabled** - Tailscale SSH only (port 22 blocked)

**Run frequency:**

* **Initial setup**: Run once manually
* **Automatic**: ansible-pull systemd timer (every 15 minutes)

**Idempotent:** Yes (safe to re-run)

**Usage:**

```bash
# Initial setup (manual, first time only)
ansible-pull \
  --url https://github.com/chezmoidotsh/arcane \
  --checkout issue-458/prepare-kazimierz-pangolin-ansible \
  --directory /opt/chezmoidotsh/arcane \
  --inventory projects/kazimierz.akn/src/infrastructure/ansible/inventory/hosts.yml \
  projects/kazimierz.akn/src/infrastructure/ansible/playbooks/site.yml

# After initial setup, ansible-pull runs automatically every 15 minutes via systemd timer

# Monitor ansible-pull
systemctl status ansible-pull.timer
journalctl -u ansible-pull.service -f

# Trigger manual run
systemctl start ansible-pull.service
```

## Inventory Variables

Key variables in `inventory/hosts.yml`:

| Variable                        | Description              | Default                                  |
| ------------------------------- | ------------------------ | ---------------------------------------- |
| `ansible_host`                  | VPS hostname or IP       | `ubuntu-4gb-hel1-2`                      |
| `vps_hostname`                  | System hostname          | `kazimierz`                              |
| `timezone`                      | System timezone          | `Europe/Paris`                           |
| `tailscale_auth_key`            | Tailscale auth key       | From `TAILSCALE_AUTH_KEY` env var        |
| `pangolin_data_dir`             | Pangolin data directory  | `/opt/pangolin`                          |
| `pangolin_compose_dir`          | Docker Compose directory | `/opt/pangolin/docker-compose`           |
| `ansible_pull_repo`             | Git repository URL       | `https://github.com/chezmoidotsh/arcane` |
| `ansible_pull_playbook`         | Playbook path            | `projects/kazimierz.akn/.../site.yml`    |
| `ansible_pull_interval_minutes` | Pull interval            | `15`                                     |

## Monitoring and Debugging

### Check ansible-pull Status

```bash
# Timer status
systemctl status ansible-pull.timer

# Last run status
systemctl status ansible-pull.service

# View logs
journalctl -u ansible-pull.service --since today

# Follow live logs
journalctl -u ansible-pull.service -f
```

### Check Pangolin Stack

```bash
# View running containers
docker-compose -f /opt/pangolin/docker-compose/docker-compose.yml ps

# View logs
docker-compose -f /opt/pangolin/docker-compose/docker-compose.yml logs -f

# Restart stack
docker-compose -f /opt/pangolin/docker-compose/docker-compose.yml restart

# Check specific service
docker-compose -f /opt/pangolin/docker-compose/docker-compose.yml logs pangolin
```

### Troubleshooting

**ansible-pull not running:**

```bash
# Check timer is enabled
systemctl is-enabled ansible-pull.timer

# Check timer schedule
systemctl list-timers ansible-pull.timer

# Manually trigger
systemctl start ansible-pull.service
```

**Docker Compose issues:**

```bash
# Validate compose file
docker-compose -f /opt/pangolin/docker-compose/docker-compose.yml config

# Check Docker daemon
systemctl status docker

# View Docker logs
journalctl -u docker -f
```

**Tailscale connection issues:**

```bash
# Check Tailscale status
tailscale status

# Re-authenticate
tailscale up --auth-key=$TAILSCALE_AUTH_KEY

# View Tailscale logs
journalctl -u tailscaled -f
```

## Security Considerations

### SSH Access

* Initial bootstrap via public IP/SSH
* After bootstrap, **all access via Tailscale only**
* Public SSH should be disabled after Tailscale is configured

### Secrets Management

* Tailscale auth key: Environment variable (not committed to Git)
* Pangolin secrets: Manual configuration in `/opt/pangolin/docker-compose/.env`
* .env file is excluded from Git (never pulled by ansible-pull)

### GitOps Security

* VPS pulls from **public Git repository** (read-only)
* No SSH keys on developer machines
* No inbound SSH required (Tailscale only)
* Systemd service runs with standard privileges

## Complete Deployment Example

Full deployment from scratch:

```bash
# 1. Set Tailscale auth key
export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx"

# 2. Bootstrap VPS (via public IP)
ansible-playbook -i inventory/hosts.yml playbooks/bootstrap.yml

# Output shows Tailscale IP, e.g., 100.x.y.z

# 3. Verify ansible-pull is running
ssh root@100.x.y.z "systemctl status ansible-pull.timer"

# 4. Wait for first ansible-pull run (or trigger manually)
ssh root@100.x.y.z "systemctl start ansible-pull.service"

# 5. Configure Pangolin secrets
ssh root@100.x.y.z
vim /opt/pangolin/docker-compose/.env
# ... add secrets ...

# 6. Restart Pangolin
cd /opt/pangolin/docker-compose
docker-compose restart

# Done! From now on, push to Git and changes deploy automatically.
```

## References

* [ADR-008: Kazimierz Ansible over Kubernetes](../../../../../docs/decisions/008-kazimierz-ansible-over-kubernetes.md)
* [Ansible Pull Documentation](https://docs.ansible.com/ansible/latest/cli/ansible-pull.html)
* [Pangolin Documentation](https://digpangolin.com/)
