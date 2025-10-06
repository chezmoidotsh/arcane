# Kazimierz Infrastructure Deployment

Ansible automation for deploying the complete Kazimierz proxy/firewall/WAF infrastructure stack.

## Overview

This playbook deploys:

* **Docker** and Docker Compose (geerlingguy.docker)
* **Pangolin** WireGuard VPN management platform
* **Tailscale** mesh networking with SSH enabled
* **UFW Firewall** with restrictive rules (HTTP/HTTPS only, SSH disabled)

All secrets are retrieved automatically from OpenBao vault at `https://vault.chezmoi.sh`.

## Prerequisites

### Required Tools

```bash
# Install with mise (recommended)
mise install

# Or install manually
apt install ansible jq
```

### Required Ansible Collections and Roles

```bash
ansible-galaxy install -r requirements.yml
```

### OpenBao Authentication

Authenticate with OpenBao before running the playbook:

```bash
export VAULT_ADDR=https://vault.chezmoi.sh
bao login -method=oidc
export VAULT_TOKEN=$(bao token lookup -format=json | jq -r .data.id)
```

### Required Secrets in OpenBao

Ensure the following secrets exist in OpenBao:

| Path | Field | Description |
|------|-------|-------------|
| `shared/data/pangolin/config` | `secret` | Pangolin server secret key (min 8 chars) |
| `shared/data/pangolin/letsencrypt` | `email` | Email for Let's Encrypt SSL certificates |
| `shared/data/third-parties/tailscale/authkeys/kazimierz` | `authkey` | Tailscale authentication key |

## Quick Start

```bash
# 1. Authenticate with OpenBao
export VAULT_ADDR=https://vault.chezmoi.sh
bao login -method=oidc
export VAULT_TOKEN=$(bao token lookup -format=json | jq -r .data.id)

# 2. Install requirements
ansible-galaxy install -r requirements.yml

# 3. Deploy infrastructure
ansible-playbook -i inventory/production.yml deploy.yml
```

## Usage

### Full Deployment

```bash
ansible-playbook -i inventory/production.yml deploy.yml
```

### Selective Deployment with Tags

```bash
# Deploy only Docker
ansible-playbook -i inventory/production.yml deploy.yml --tags docker

# Deploy Docker and Pangolin
ansible-playbook -i inventory/production.yml deploy.yml --tags docker,pangolin

# Deploy Tailscale and firewall
ansible-playbook -i inventory/production.yml deploy.yml --tags tailscale,firewall
```

### Dry-run Mode

```bash
ansible-playbook -i inventory/production.yml deploy.yml --check --diff
```

### Skip Specific Tags

```bash
# Skip firewall configuration
ansible-playbook -i inventory/production.yml deploy.yml --skip-tags firewall
```

## Available Tags

| Tag | Description |
|-----|-------------|
| `docker` | Docker and Docker Compose installation |
| `pangolin` | Pangolin VPN platform deployment |
| `tailscale` | Tailscale mesh networking with SSH |
| `firewall` | UFW firewall configuration |

## Configuration

### Inventory

Edit `inventory/production.yml` to configure target hosts:

```yaml
all:
  children:
    kazimierz:
      hosts:
        kazimierz.akn:
          ansible_host: kubernetes.kazimierz.akn.chezmoi.sh
          ansible_user: root
```

### Variables

Global variables are defined in `group_vars/all.yml`. Key variables:

```yaml
# Vault configuration
vault_addr: https://vault.chezmoi.sh

# Pangolin configuration
pangolin_domain: chezmoi.sh
pangolin_config_app:
  log_level: info

# Tailscale configuration
tailscale_args: "--ssh --accept-routes --advertise-tags=tag:infra,tag:kazimierz"

# Firewall rules
ufw_rules:
  - { rule: allow, port: 80, proto: tcp, comment: "HTTP - Pangolin" }
  - { rule: allow, port: 443, proto: tcp, comment: "HTTPS - Pangolin" }
  - { rule: allow, port: 51820, proto: udp, comment: "WireGuard - Pangolin VPN" }
  - { rule: allow, port: 41641, proto: udp, comment: "Tailscale" }
```

Override variables by creating host-specific files in `host_vars/`.

## Post-Deployment

### Access Pangolin

1. Navigate to: `https://chezmoi.sh/auth/initial-setup`
2. Complete the initial setup wizard
3. Configure WireGuard networks and clients

### SSH Access via Tailscale

Public SSH (port 22) is **disabled** after deployment. Access the server via Tailscale:

```bash
tailscale ssh kubernetes.kazimierz.akn.chezmoi.sh
```

### Manage Services

```bash
# Via Tailscale SSH
tailscale ssh kubernetes.kazimierz.akn.chezmoi.sh

# Check Pangolin status
cd /opt/pangolin
docker compose ps
docker compose logs -f

# Restart Pangolin
docker compose restart

# Check firewall status
ufw status verbose
```

## Firewall Configuration

After deployment, the firewall is configured with the following rules:

| Port | Protocol | Service | Status |
|------|----------|---------|--------|
| 80 | TCP | HTTP (Pangolin) | ✅ OPEN |
| 443 | TCP | HTTPS (Pangolin) | ✅ OPEN |
| 51820 | UDP | WireGuard (Pangolin) | ✅ OPEN |
| 41641 | UDP | Tailscale | ✅ OPEN |
| 22 | TCP | SSH | ❌ CLOSED |

**Important**: SSH access is restricted to Tailscale only for enhanced security.

## Troubleshooting

### Authentication Issues

```bash
# Check vault token validity
bao token lookup

# Re-authenticate if token expired
bao login -method=oidc
export VAULT_TOKEN=$(bao token lookup -format=json | jq -r .data.id)
```

### Secret Retrieval Failures

```bash
# Verify secrets exist in OpenBao
bao kv get shared/pangolin/config
bao kv get shared/pangolin/letsencrypt
bao kv get shared/third-parties/tailscale/authkeys/kazimierz

# Check secret paths in group_vars/all.yml match OpenBao structure
```

### Connection Issues

```bash
# Test SSH connectivity
ssh root@kubernetes.kazimierz.akn.chezmoi.sh

# Check if host is reachable
ping kubernetes.kazimierz.akn.chezmoi.sh

# Verify DNS resolution
dig kubernetes.kazimierz.akn.chezmoi.sh
```

### Pangolin Not Starting

```bash
# Via Tailscale SSH
tailscale ssh kubernetes.kazimierz.akn.chezmoi.sh

# Check container logs
cd /opt/pangolin
docker compose logs

# Verify configuration
cat config/config.yml
cat config/traefik/traefik_config.yml

# Restart services
docker compose restart
```

## Directory Structure

```
.
├── README.md                   # This file
├── ansible.cfg                 # Ansible configuration
├── deploy.yml                  # Main playbook
├── requirements.yml            # External roles and collections
├── inventory/
│   └── production.yml          # Production inventory
├── group_vars/
│   └── all.yml                 # Global variables
└── host_vars/                  # Host-specific variables (optional)
```

## Security Considerations

* All secrets are retrieved from OpenBao vault at runtime
* SSH access is disabled from public internet
* Firewall allows only HTTP/HTTPS and VPN traffic
* Tailscale provides secure mesh networking for management
* Let's Encrypt SSL certificates for Pangolin

## References

* [Pangolin Documentation](https://docs.digpangolin.com/)
* [Tailscale Documentation](https://tailscale.com/kb/)
* [OpenBao Documentation](https://openbao.org/docs/)
* [Ansible Vault Lookup](https://docs.ansible.com/ansible/latest/collections/community/hashi_vault/hashi_vault_lookup.html)
