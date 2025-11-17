# Bootstrap Kazimierz.AKN VPS

This document describes how to bootstrap the Kazimierz.AKN VPS using Ansible.

## Overview

The bootstrap process transforms a fresh Ubuntu VPS into a managed node that automatically pulls its configuration from Git.

**Key Components**:

* **Tailscale**: Secure VPN access (SSH port 22 is disabled after bootstrap)
* **Ansible Pull**: GitOps automation running every 15 minutes
* **Docker Compose**: Container orchestration for Pangolin stack

## Prerequisites

1. **VPS**: Ubuntu 22.04 LTS (fresh install)
2. **Public IP**: For initial SSH connection
3. **Tailscale Auth Key**: Reusable key from Tailscale admin console
4. **Ansible**: Installed on your local machine

## Bootstrap Procedure

### 1. Prepare Local Environment

```bash
# Install required Ansible roles locally
cd projects/kazimierz.akn/src/infrastructure/ansible
ansible-galaxy install -r requirements.yml
```

### 2. Run Bootstrap Playbook

```bash
# Set Tailscale auth key
export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx"

# Run playbook (replace <vps-ip> with actual IP)
ansible-playbook -i inventory/hosts.yml playbooks/bootstrap.yml \
  --extra-vars "ansible_host=<vps-ip> ansible_user=root"
```

### 3. Verify Deployment

After the playbook completes:

1. **Check Tailscale**: The VPS should appear in your Tailscale console.
2. **SSH via Tailscale**: `ssh root@<tailscale-ip>`
3. **Check ansible-pull**:
   ```bash
   systemctl status ansible-pull.timer
   ```

## Post-Bootstrap Configuration

Once the VPS is bootstrapped, it will automatically pull the `site.yml` playbook. However, you need to configure secrets manually on the host.

1. **SSH into VPS**: `ssh root@<tailscale-ip>`
2. **Edit Environment File**:
   ```bash
   vim /opt/pangolin/docker-compose/.env
   ```
3. **Restart Stack**:
   ```bash
   cd /opt/pangolin/docker-compose
   docker compose up -d
   ```

For full details, see the [Ansible Infrastructure README](../src/infrastructure/ansible/README.md).
