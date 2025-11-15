# Ansible Role: Pangolin

Deploy the [Pangolin](https://github.com/fosrl/pangolin) tunneled reverse proxy stack with Docker Compose. Pangolin provides a self-hosted, identity-aware alternative to Cloudflare Tunnels and Tailscale Funnel, using WireGuard for secure tunneling.

## Features

* **Complete Stack Deployment** - Automatically deploys Pangolin, Gerbil (WireGuard manager), and Traefik (reverse proxy)
* **Secure by Default** - Automatic Let's Encrypt SSL certificates with secure file permissions (acme.json at mode 0600)
* **Idempotent Operations** - Safe to run repeatedly without unnecessary changes
* **Configuration Validation** - Validates required variables before deployment
* **Health Checks** - Waits for Pangolin to become healthy before completing
* **Templated Configuration** - Jinja2 templates for all configuration files
* **Network Isolation** - Optional public IP binding to prevent Tailscale conflicts

## Requirements

### Control Node (where Ansible runs)

* Ansible >= 2.14
* `community.docker` Ansible collection >= 4.0.0

### Managed Node (target server)

* Ubuntu 22.04 LTS or Debian 11+ (other distros may work but untested)
* Docker Engine with Docker Compose v2 plugin
* Domain name with DNS A record pointing to server public IP
* Firewall rules allowing:
  * TCP 80 (HTTP - Let's Encrypt validation and redirect to HTTPS)
  * TCP 443 (HTTPS - Pangolin dashboard and API)
  * UDP 51820 (WireGuard - Newt site tunnels)
  * UDP 21820 (WireGuard - Newt client tunnels)

## Role Variables

### Required Variables

```yaml
# Dashboard URL - REQUIRED: Replace with your actual domain
pangolin_dashboard_url: "https://pangolin.example.com"

# Server secret - REQUIRED: Minimum 8 characters, recommend 32+ with mixed types
pangolin_server_secret: "your-very-secure-random-secret-here"

# ACME email for Let's Encrypt - REQUIRED
pangolin_acme_email: "your-email@example.com"

# Domain configuration - REQUIRED
pangolin_domains:
  domain1:
    base_domain: "pangolin.example.com"
    cert_resolver: "letsencrypt"
```

### Directory Configuration

```yaml
# Base directory for Pangolin data (default: /var/lib/pangolin)
pangolin_data_dir: "/var/lib/pangolin"

# Docker Compose project directory (default: /opt/pangolin)
pangolin_compose_dir: "/opt/pangolin"
```

### Application Configuration

```yaml
# Gerbil tunnel base endpoint (default: pangolin.example.com)
pangolin_gerbil_base_endpoint: "pangolin.example.com"

# Feature flags
pangolin_require_email_verification: false
pangolin_disable_signup_without_invite: true
pangolin_disable_user_create_org: true

# Log level: debug, info, warn, error (default: info)
pangolin_log_level: "info"

# Telemetry settings
pangolin_telemetry_enabled: true
pangolin_telemetry_notifications: true
```

### Docker Image Versions

```yaml
# Pangolin image version (default: latest)
pangolin_image_version: "latest"

# Gerbil image version (default: latest)
pangolin_gerbil_image_version: "latest"

# Traefik image version (default: v3.4.0)
pangolin_traefik_image_version: "v3.4.0"
```

### Network Ports

```yaml
# WireGuard tunnel ports
pangolin_wireguard_site_port: 51820
pangolin_wireguard_client_port: 21820

# HTTP/HTTPS ports
pangolin_http_port: 80
pangolin_https_port: 443
```

### Network Configuration

```yaml
# Bind IP address for HTTP/HTTPS (default: empty = all interfaces)
# Set to public IP to avoid conflicts with Tailscale or other services
# Example: pangolin_bind_ip: "203.0.113.42"
pangolin_bind_ip: ""

# Network ports
pangolin_wireguard_site_port: 51820
pangolin_wireguard_client_port: 21820
pangolin_http_port: 80
pangolin_https_port: 443
```

**Important for Tailscale users**: If you're running Tailscale with `tailscale serve` on port 443, you must set `pangolin_bind_ip` to your public IP address to avoid port conflicts. The playbook includes a pre\_task to automatically detect your public IP.

### Advanced Configuration

```yaml
# PostgreSQL connection string (optional, defaults to SQLite)
pangolin_postgres_connection_string: ""

# SMTP configuration (optional)
pangolin_smtp_host: "smtp.example.com"
pangolin_smtp_port: 587
pangolin_smtp_user: "user@example.com"
pangolin_smtp_pass: "smtp-password"
pangolin_smtp_from: "noreply@example.com"

# Let's Encrypt server (set to staging for testing)
pangolin_acme_ca_server: "https://acme-v02.api.letsencrypt.org/directory"
# Staging: https://acme-staging-v02.api.letsencrypt.org/directory
```

### Docker Configuration

```yaml
# Pull images before deploying (default: true)
pangolin_docker_pull: true

# Restart policy (default: unless-stopped)
pangolin_docker_restart_policy: "unless-stopped"

# Container names
pangolin_container_name: "pangolin"
pangolin_gerbil_container_name: "gerbil"
pangolin_traefik_container_name: "traefik"

# Network name
pangolin_network_name: "pangolin"
```

## Dependencies

This role requires the `community.docker` Ansible collection. Install with:

```bash
ansible-galaxy collection install community.docker:>=4.0.0
```

**Important**: This role uses the `docker_compose_v2` module, which requires:

* Docker Compose v2 installed on the managed node
* `community.docker` collection >= 4.0.0

The older `docker_compose` module (v1) reached End of Life in July 2022 and is no longer supported.

## Example Playbook

### Minimal Configuration

```yaml
- hosts: servers
  become: true

  roles:
    - role: chezmoidotsh.pangolin
      vars:
        pangolin_dashboard_url: "https://pangolin.yourdomain.com"
        pangolin_server_secret: "{{ vault_pangolin_server_secret }}"
        pangolin_acme_email: "admin@yourdomain.com"
        pangolin_domains:
          domain1:
            base_domain: "pangolin.yourdomain.com"
            cert_resolver: "letsencrypt"
        pangolin_gerbil_base_endpoint: "pangolin.yourdomain.com"
```

### Advanced Configuration with SMTP

```yaml
- hosts: servers
  become: true

  roles:
    - role: chezmoidotsh.pangolin
      vars:
        pangolin_dashboard_url: "https://pangolin.yourdomain.com"
        pangolin_server_secret: "{{ vault_pangolin_server_secret }}"
        pangolin_acme_email: "admin@yourdomain.com"
        pangolin_domains:
          domain1:
            base_domain: "pangolin.yourdomain.com"
            cert_resolver: "letsencrypt"
        pangolin_gerbil_base_endpoint: "pangolin.yourdomain.com"

        # Enable email notifications
        pangolin_require_email_verification: true
        pangolin_smtp_host: "smtp.yourdomain.com"
        pangolin_smtp_port: 587
        pangolin_smtp_user: "{{ vault_smtp_user }}"
        pangolin_smtp_pass: "{{ vault_smtp_pass }}"
        pangolin_smtp_from: "noreply@yourdomain.com"
```

### Using PostgreSQL Instead of SQLite

```yaml
- hosts: servers
  become: true

  roles:
    - role: chezmoidotsh.pangolin
      vars:
        pangolin_dashboard_url: "https://pangolin.yourdomain.com"
        pangolin_server_secret: "{{ vault_pangolin_server_secret }}"
        pangolin_acme_email: "admin@yourdomain.com"
        pangolin_domains:
          domain1:
            base_domain: "pangolin.yourdomain.com"
            cert_resolver: "letsencrypt"
        pangolin_gerbil_base_endpoint: "pangolin.yourdomain.com"

        # Use PostgreSQL
        pangolin_postgres_connection_string: "postgresql://user:pass@localhost:5432/pangolin"
```

### Testing with Let's Encrypt Staging

```yaml
- hosts: servers
  become: true

  roles:
    - role: chezmoidotsh.pangolin
      vars:
        pangolin_dashboard_url: "https://pangolin.test.yourdomain.com"
        pangolin_server_secret: "test-secret-for-staging"
        pangolin_acme_email: "admin@yourdomain.com"
        pangolin_domains:
          domain1:
            base_domain: "pangolin.test.yourdomain.com"
            cert_resolver: "letsencrypt"
        pangolin_gerbil_base_endpoint: "pangolin.test.yourdomain.com"

        # Use Let's Encrypt staging to avoid rate limits
        pangolin_acme_ca_server: "https://acme-staging-v02.api.letsencrypt.org/directory"
```

## Directory Structure

After deployment, the following directory structure is created:

```text
/opt/pangolin/                      # Compose directory
├── docker-compose.yml              # Main Docker Compose file
└── config/
    ├── config.yml                  # Pangolin configuration
    ├── key                         # Gerbil WireGuard key (auto-generated)
    ├── db/                         # SQLite database (if not using PostgreSQL)
    │   └── db.sqlite
    ├── traefik/
    │   ├── traefik_config.yml      # Traefik static configuration
    │   └── dynamic_config.yml      # Traefik dynamic configuration
    ├── letsencrypt/
    │   └── acme.json               # Let's Encrypt certificates
    └── logs/                       # Application logs

/var/lib/pangolin/                  # Data directory
```

## Post-Deployment

After successful deployment:

1. Navigate to `https://your-domain.com/auth/initial-setup` to complete the initial setup
2. Create your admin account
3. Configure organizations and tunnels
4. Install the Newt client on devices that need to connect: <https://github.com/fosrl/newt>

## Managing the Stack

```bash
# View running containers
docker compose -f /opt/pangolin/docker-compose.yml ps

# View logs
docker compose -f /opt/pangolin/docker-compose.yml logs -f

# View specific service logs
docker compose -f /opt/pangolin/docker-compose.yml logs -f pangolin
docker compose -f /opt/pangolin/docker-compose.yml logs -f gerbil
docker compose -f /opt/pangolin/docker-compose.yml logs -f traefik

# Restart services
docker compose -f /opt/pangolin/docker-compose.yml restart

# Stop services
docker compose -f /opt/pangolin/docker-compose.yml down

# Update to latest images
docker compose -f /opt/pangolin/docker-compose.yml pull
docker compose -f /opt/pangolin/docker-compose.yml up -d
```

## Troubleshooting

### SSL Certificate Issues

If SSL certificates are not being generated:

1. Check that ports 80 and 443 are accessible from the internet
2. Verify DNS records point to your server
3. Check Traefik logs: `docker compose -f /opt/pangolin/docker-compose.yml logs traefik`
4. Verify ACME email is correct
5. Check acme.json permissions are 600

### Pangolin Not Starting

1. Check if the server secret is at least 8 characters
2. Verify all required configuration variables are set
3. Check Pangolin logs: `docker compose -f /opt/pangolin/docker-compose.yml logs pangolin`
4. Ensure config.yml is valid YAML

### Gerbil Connection Issues

1. Verify WireGuard ports (51820/udp, 21820/udp) are open in firewall
2. Check Gerbil logs: `docker compose -f /opt/pangolin/docker-compose.yml logs gerbil`
3. Verify the WireGuard key was generated: `ls -la /opt/pangolin/config/key`

### Traefik Dashboard

Access the Traefik dashboard (if enabled) at: `http://your-server-ip:8080/dashboard/`

Note: The dashboard is configured in insecure mode for development. For production, configure authentication.

## Security Considerations

* **Server Secret**: Use a strong, randomly generated secret (32+ characters recommended)
* **ACME Email**: Use a valid email for Let's Encrypt notifications
* **File Permissions**: The role sets secure permissions on sensitive files (acme.json, config files)
* **Firewall**: Ensure only necessary ports are exposed
* **Regular Updates**: Keep Docker images updated for security patches
* **Production Mode**: Disable Traefik insecure dashboard in production

## Tags

Run specific subsets of tasks using tags:

| Tag             | Description                        |
| --------------- | ---------------------------------- |
| `pangolin`      | All Pangolin tasks (default)       |
| `directories`   | Directory creation only            |
| `configuration` | Configuration file deployment only |
| `traefik`       | Traefik configuration only         |
| `docker`        | Docker-related tasks only          |
| `security`      | Security-related tasks only        |
| `health-check`  | Health check verification only     |

Example usage:

```bash
# Deploy only configuration files
ansible-playbook playbook.yml --tags configuration

# Skip health checks (faster testing)
ansible-playbook playbook.yml --skip-tags health-check

# Run multiple specific tasks
ansible-playbook playbook.yml --tags directories,configuration,docker
```

## CrowdSec Integration

This role automatically integrates CrowdSec for WAF (Web Application Firewall) and IPS (Intrusion Prevention System) capabilities with Traefik.

### Bouncer API Key Management

The role uses a **persistent file-based approach** for storing the CrowdSec Traefik bouncer API key:

* **Key File Location**: `/opt/pangolin/config/crowdsec/bouncer_key`
* **Permissions**: `0600` (root read/write only)
* **Idempotency**: Key is generated once and persisted across playbook runs

### How It Works

1. **First Deployment**:
   * Role checks if bouncer key file exists
   * If missing, generates new API key via CrowdSec CLI
   * Saves key to persistent file with secure permissions
   * Templates Traefik dynamic configuration with the key

2. **Subsequent Deployments**:
   * Role detects existing key file
   * Reads key from file
   * Uses existing key for configuration (no regeneration)

### Manual Key Rotation

To rotate the bouncer API key manually:

```bash
# 1. Delete the key file
rm /opt/pangolin/config/crowdsec/bouncer_key

# 2. Re-run the Ansible playbook
ansible-playbook playbook.yml

# The role will automatically:
# - Detect missing key file
# - Generate new bouncer API key
# - Save new key to file
# - Update Traefik configuration
# - Restart the stack
```

### Disaster Recovery

The bouncer key file can be backed up and restored:

```bash
# Backup
cp /opt/pangolin/config/crowdsec/bouncer_key ~/backups/

# Restore
cp ~/backups/bouncer_key /opt/pangolin/config/crowdsec/
chmod 600 /opt/pangolin/config/crowdsec/bouncer_key
chown root:root /opt/pangolin/config/crowdsec/bouncer_key
```

### CrowdSec Configuration Variables

```yaml
# CrowdSec collections to install (default)
pangolin_crowdsec_collections:
  - crowdsecurity/traefik
  - crowdsecurity/appsec-virtual-patching
  - crowdsecurity/appsec-generic-rules
  - crowdsecurity/appsec-crs-inband

# CrowdSec parsers to install (default)
pangolin_crowdsec_parsers:
  - crowdsecurity/whitelists

# Bouncer key file path (default)
pangolin_crowdsec_bouncer_key_file: "{{ pangolin_compose_dir }}/config/crowdsec/bouncer_key"
```

### CrowdSec Troubleshooting

**Problem**: Traefik logs show "crowdsec: failed to authenticate"

**Solution**: Key file might be missing or corrupted. Regenerate it:

```bash
rm /opt/pangolin/config/crowdsec/bouncer_key
ansible-playbook playbook.yml
```

**Problem**: CrowdSec container not starting

**Solution**: Check CrowdSec logs and verify container health:

```bash
docker compose -f /opt/pangolin/docker-compose.yml logs crowdsec
docker exec crowdsec cscli capi status
```

## Best Practices

### Production Deployment

1. **Use Ansible Vault for Secrets**

   ```bash
   # Create encrypted variable file
   ansible-vault create group_vars/all/vault.yml

   # Add sensitive variables
   vault_pangolin_server_secret: "your-very-secure-32-character-secret"
   vault_smtp_pass: "smtp-password"
   ```

   Reference in playbook:

   ```yaml
   pangolin_server_secret: "{{ vault_pangolin_server_secret }}"
   ```

2. **Test with Let's Encrypt Staging**

   Start with staging environment to avoid rate limits:

   ```yaml
   pangolin_acme_ca_server: "https://acme-staging-v02.api.letsencrypt.org/directory"
   ```

   After verifying everything works, switch to production:

   ```yaml
   pangolin_acme_ca_server: "https://acme-v02.api.letsencrypt.org/directory"
   ```

3. **Verify DNS Before Deployment**

   ```bash
   # Check A record points to your server
   dig +short pangolin.yourdomain.com

   # Should return your server's public IP
   ```

4. **Bind to Public IP on Multi-Interface Servers**

   If running Tailscale or other services on port 443:

   ```yaml
   pangolin_bind_ip: "{{ ansible_default_ipv4.address }}"
   ```

### Monitoring and Maintenance

* **View Logs**

  ```bash
  docker compose -f /opt/pangolin/docker-compose.yml logs -f pangolin
  docker compose -f /opt/pangolin/docker-compose.yml logs -f traefik
  ```

* **Check Service Health**

  ```bash
  docker compose -f /opt/pangolin/docker-compose.yml ps
  curl -I https://pangolin.yourdomain.com
  ```

* **Update to Latest Images**

  ```bash
  cd /opt/pangolin
  docker compose pull
  docker compose up -d
  ```

## License

MIT / BSD

## Author Information

This role was created as part of the [Arcane](https://github.com/chezmoidotsh/arcane) homelab infrastructure project.

## References

* [Pangolin GitHub Repository](https://github.com/fosrl/pangolin)
* [Pangolin Documentation](https://docs.pangolin.net)
* [Gerbil GitHub Repository](https://github.com/fosrl/gerbil)
* [Newt Client](https://github.com/fosrl/newt)
* [Traefik Documentation](https://doc.traefik.io/traefik/)
