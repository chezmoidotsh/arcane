# Ansible Role: Pangolin

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Installs and configures [Pangolin](https://docs.digpangolin.com/), a modern WireGuard VPN management platform, using Docker Compose.

Pangolin provides a beautiful web interface for managing WireGuard VPN configurations, complete with user management, device provisioning, and network organization features. This role deploys Pangolin with Traefik as a reverse proxy and Gerbil for WireGuard tunnel management.

## Requirements

- **Docker**: This role requires Docker and Docker Compose to be installed on the target host. Use `geerlingguy.docker` role to install Docker.
- **Ansible**: Version 2.15 or higher
- **Collections**: `community.docker` collection must be installed
- **Domain**: A valid domain name pointing to the server's IP address
- **Ports**: Ensure ports 80, 443, 51820/UDP, and 21820/UDP are available

## Role Variables

All variables are defined in `defaults/main.yml` with sensible defaults. Here's a comprehensive list organized by category:

### Installation Paths

```yaml
# Base directory for Pangolin installation
pangolin_install_dir: /opt/pangolin

# Configuration directory (relative to install_dir)
pangolin_config_dir: "{{ pangolin_install_dir }}/config"
```

### Docker Images and Versions

```yaml
# Pangolin application image and tag
pangolin_image: fosrl/pangolin
pangolin_version: latest

# Gerbil networking service image and tag
pangolin_gerbil_image: fosrl/gerbil
pangolin_gerbil_version: latest

# Traefik reverse proxy image and tag
pangolin_traefik_image: traefik
pangolin_traefik_version: v3.5
```

### Domain and SSL Configuration

```yaml
# Domain name for Pangolin dashboard (REQUIRED - change this!)
pangolin_domain: pangolin.example.com

# Email address for Let's Encrypt SSL certificates (REQUIRED - change this!)
pangolin_letsencrypt_email: admin@example.com

# Let's Encrypt ACME server URL
# Production: https://acme-v02.api.letsencrypt.org/directory
# Staging (for testing): https://acme-staging-v02.api.letsencrypt.org/directory
pangolin_letsencrypt_server: https://acme-v02.api.letsencrypt.org/directory
```

### Pangolin Application Configuration

```yaml
# Application settings
pangolin_config_app:
  dashboard_url: "https://{{ pangolin_domain }}"
  log_level: info  # Options: debug, info, warn, error

# Domain configuration
pangolin_config_domains:
  domain1:
    base_domain: "{{ pangolin_domain }}"

# Server configuration
pangolin_config_server:
  # IMPORTANT: Change this to a random string in production!
  secret: changeme_random_secret_key_min_8_chars

# Gerbil tunnel controller configuration
pangolin_config_gerbil:
  base_endpoint: "{{ pangolin_domain }}"

# Organization network configuration
pangolin_config_orgs:
  block_size: 24
  subnet_group: 100.90.137.0/20

# Feature flags
pangolin_config_flags:
  require_email_verification: false
  disable_signup_without_invite: true
  disable_user_create_org: true
  allow_raw_resources: true
  enable_integration_api: true
  enable_clients: true
```

### Traefik Configuration

```yaml
# Traefik log level (DEBUG, INFO, WARN, ERROR)
pangolin_traefik_log_level: INFO

# Traefik API dashboard settings
pangolin_traefik_api_insecure: true
pangolin_traefik_api_dashboard: true

# Traefik ports
pangolin_traefik_http_port: 80
pangolin_traefik_https_port: 443

# Traefik read timeout for websockets and long-running requests
pangolin_traefik_read_timeout: 30m

# Badger plugin version (Pangolin's auth middleware)
pangolin_traefik_badger_version: v1.2.0
```

### WireGuard Configuration

```yaml
# WireGuard VPN port (UDP)
pangolin_gerbil_wireguard_port: 51820

# Gerbil management port (UDP)
pangolin_gerbil_management_port: 21820
```

### Docker Compose Settings

```yaml
# Docker network name
pangolin_network_name: pangolin

# Container restart policy
pangolin_restart_policy: unless-stopped

# Health check configuration
pangolin_healthcheck_interval: 3s
pangolin_healthcheck_timeout: 3s
pangolin_healthcheck_retries: 15

# Docker Compose project name
pangolin_compose_project_name: pangolin
```

## Dependencies

This role has no Ansible role dependencies, but it requires:

- Docker and Docker Compose to be installed (recommended: `geerlingguy.docker`)
- The `community.docker` Ansible collection

Install the required collection:

```bash
ansible-galaxy collection install community.docker
```

## Example Playbook

### Basic Installation

```yaml
- hosts: vpn_servers
  become: true

  roles:
    - role: geerlingguy.docker
    - role: pangolin
      vars:
        pangolin_domain: vpn.example.com
        pangolin_letsencrypt_email: admin@example.com
        pangolin_config_server:
          secret: "your-very-secure-random-secret-key-here"
```

### Advanced Configuration with Custom Settings

```yaml
- hosts: vpn_servers
  become: true

  roles:
    - role: geerlingguy.docker

    - role: pangolin
      vars:
        # Domain and SSL
        pangolin_domain: vpn.mycompany.com
        pangolin_letsencrypt_email: sysadmin@mycompany.com

        # Use specific versions instead of latest
        pangolin_version: "v1.0.0"
        pangolin_gerbil_version: "v1.0.0"
        pangolin_traefik_version: "v3.5"

        # Custom installation path
        pangolin_install_dir: /srv/pangolin

        # Security settings
        pangolin_config_server:
          secret: "{{ vault_pangolin_secret }}"  # Store in Ansible Vault

        pangolin_config_flags:
          require_email_verification: true
          disable_signup_without_invite: true
          disable_user_create_org: false
          enable_integration_api: false

        # Custom network ranges
        pangolin_config_orgs:
          block_size: 24
          subnet_group: 10.100.0.0/16

        # Debug mode for troubleshooting
        pangolin_config_app:
          log_level: debug
        pangolin_traefik_log_level: DEBUG
```

### Using Let's Encrypt Staging (for Testing)

```yaml
- hosts: test_servers
  become: true

  roles:
    - role: geerlingguy.docker
    - role: pangolin
      vars:
        pangolin_domain: test-vpn.example.com
        pangolin_letsencrypt_email: test@example.com
        # Use staging server to avoid rate limits during testing
        pangolin_letsencrypt_server: https://acme-staging-v02.api.letsencrypt.org/directory
        pangolin_config_server:
          secret: test-secret-key
```

## Post-Installation

After running the playbook, you can:

1. **Access the dashboard**: Navigate to `https://your-domain.com/auth/initial-setup` to complete the initial setup
2. **Check service status**: `docker compose -f /opt/pangolin/docker-compose.yml ps`
3. **View logs**: `docker compose -f /opt/pangolin/docker-compose.yml logs -f`
4. **Restart services**: `docker compose -f /opt/pangolin/docker-compose.yml restart`

## Security Considerations

### Critical Settings to Change

⚠️ **Before deploying to production, ensure you change these values:**

1. **Secret Key**: `pangolin_config_server.secret` - Use a strong random string (minimum 8 characters)
2. **Domain**: `pangolin_domain` - Set to your actual domain
3. **Email**: `pangolin_letsencrypt_email` - Use a valid email address
4. **Feature Flags**: Review and adjust based on your security requirements

### Recommended Practices

- Store sensitive variables in Ansible Vault:
  ```bash
  ansible-vault create group_vars/vpn_servers/vault.yml
  ```

- Use strong, randomly generated secrets:
  ```bash
  openssl rand -base64 32
  ```

- Enable email verification in production:
  ```yaml
  pangolin_config_flags:
    require_email_verification: true
    disable_signup_without_invite: true
  ```

- Review firewall rules to ensure only necessary ports are exposed

## Troubleshooting

### Services Won't Start

Check Docker logs:
```bash
docker compose -f /opt/pangolin/docker-compose.yml logs
```

### SSL Certificate Issues

1. Verify your domain points to the correct IP
2. Check Let's Encrypt rate limits (use staging server for testing)
3. Ensure ports 80 and 443 are accessible from the internet

### WireGuard Connection Problems

1. Verify UDP ports 51820 and 21820 are not blocked by firewall
2. Check Gerbil logs: `docker logs gerbil`
3. Ensure the base endpoint is correctly configured

## Documentation

For more information about Pangolin:

- [Official Documentation](https://docs.digpangolin.com/)
- [Self-Hosting Guide](https://docs.digpangolin.com/self-host/quick-install)
- [Configuration Reference](https://docs.digpangolin.com/self-host/advanced/config-file)
- [GitHub Repository](https://github.com/fosrl/pangolin)

## License

MIT

## Author Information

This role was created by Alexandre Nicolaie Dit Clairville as part of the [Arcane](https://github.com/chezmoidotsh/arcane) homelab infrastructure project.

Inspired by the excellent work of [Jeff Geerling](https://www.jeffgeerling.com/) and the Ansible community.
