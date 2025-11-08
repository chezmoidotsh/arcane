## Bootstrap VPS with Pangolin and CrowdSec

This procedure details the complete bootstrap process for deploying a VPS with Pangolin (Wireguard VPN solution) and CrowdSec (security monitoring) using Tailscale for secure remote access. This setup provides a secure foundation for hosting services with VPN access, automated security monitoring, and proper firewall configuration.

### TLDR - Quick Command Reference

```bash
# 1. Update system and install basics
apt update && apt upgrade -y
apt install -y curl wget git htop nano ufw

# 2. Install and configure Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --auth-key=tskey-auth-xxxxx-CNTRL-xxxxx --ssh

# 3. Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow from 100.64.0.0/10
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 51820/udp
ufw allow 21820/udp
ufw enable

# 6. Install Pangolin (includes Docker, CrowdSec, and Traefik bouncer)
curl -fsSL https://pangolin.net/get-installer.sh | bash
./installer
docker logs pangolin | grep -A3 "SETUP TOKEN"

# 7. Configure CrowdSec collections
docker exec crowdsec cscli collections install crowdsecurity/traefik
docker exec crowdsec cscli collections install crowdsecurity/appsec-virtual-patching
docker exec crowdsec cscli collections install crowdsecurity/appsec-generic-rules
docker exec crowdsec cscli collections install crowdsecurity/appsec-crs-inband
docker restart crowdsec

# 8. Enroll CrowdSec with Console
docker exec -it crowdsec cscli console enroll xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Technical framework and conventions

This procedure is a one-shot bootstrap process. All credentials are generated and used immediately during setup - no need for centralized secret management.

Key conventions applied:

* **Tailscale Authentication**: Uses reusable auth keys with infinite retention
* **Security First**: CrowdSec and Traefik bouncer are included with Pangolin for real-time security monitoring
* **All-in-One**: Pangolin installer handles Docker, CrowdSec, and Traefik bouncer installation

### Prerequisites

Before starting this procedure, ensure you have:

**Cloud Provider Access:**

* Access to a cloud provider account (Hetzner Cloud, DigitalOcean, etc.)
* Sufficient credits/balance to create a VPS instance
* Ability to create and manage SSH keys

**Local Tools:**

* `ssh` - For remote server access

**Required Accounts and Services:**

* **Tailscale account** with admin access ([Sign up](https://login.tailscale.com/start))
* **CrowdSec account** with enrollment key generation capability ([Sign up](https://app.crowdsec.net/signup))
* **Pangolin account** (if using hosted version) or self-hosted instance

**Permissions:**

* `sudo` access on the target VPS

### Required inputs

To execute this procedure, you will need:

* `VPS_HOSTNAME`: The hostname for your VPS (e.g., `pangolin-1.kazimierz.akn`)
* `VPS_IP`: The public IP address of your VPS
* `TAILSCALE_AUTH_KEY`: Tailscale authentication key (generated in Part 1)
* `CROWDSEC_ENROLL_KEY`: CrowdSec enrollment key (generated in Part 1)
* `PANGOLIN_TOKEN`: The setup token from Pangolin (generated during installation)
* `BACKUP_RETENTION_DAYS`: Number of days to keep backups (default: 7)

***

## Part 1 — Prepare credentials

### Step 1.1 — Generate Tailscale auth key

Generate a Tailscale auth key with infinite retention. This key should NOT be created from your personal account.

> **\[!IMPORTANT]**
> **Tailscale Auth Key Configuration**
>
> * Use a **reusable** auth key to avoid generating a new one for each server
> * Set **no expiration** (infinite retention) for infrastructure servers
> * Use **tags** to automatically apply ACL rules (e.g., `tag:server`, `tag:vps`)
> * Enable **pre-authorized** to skip manual approval in the admin console
>
> Documentation: [Tailscale Auth Keys](https://tailscale.com/kb/1085/auth-keys/)

1. Navigate to the Tailscale admin console: <https://login.tailscale.com/admin/settings/keys>
2. Click "Generate auth key"
3. Configure the auth key:
   * **Description**: `VPS Infrastructure - Pangolin Servers`
   * **Reusable**: ✅ Enabled
   * **Ephemeral**: ❌ Disabled (we want persistent nodes)
   * **Pre-authorized**: ✅ Enabled
   * **Tags**: Add tags that match your ACL policy (e.g., `tag:server`, `tag:vps`, `tag:pangolin`)
   * **Expiration**: Set to infinite/no expiration
4. Copy the generated auth key (it will look like `tskey-auth-xxxxx-CNTRL-xxxxx`)
5. Save it temporarily - you'll need it in Part 3

### Step 1.2 — Generate CrowdSec enrollment key

Generate a CrowdSec enrollment key for registering the VPS security monitoring.

> **\[!NOTE]**
> CrowdSec enrollment keys allow your local CrowdSec agent to communicate with the CrowdSec Console for centralized monitoring and threat intelligence sharing.
>
> Documentation: [CrowdSec Console](https://docs.crowdsec.net/docs/console/enrollment)

1. Navigate to CrowdSec Console: <https://app.crowdsec.net/>
2. Go to "Engines" → "Add Security Engine"
3. Copy the enrollment key (format: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` or similar)
4. Save it temporarily - you'll need it in Part 6

***

## Part 2 — Create and prepare the VPS instance

### Step 2.1 — Create the VPS instance

Create a new VPS instance with your preferred cloud provider. This example uses Hetzner Cloud, but the process is similar for other providers.

> **\[!TIP]**
> **Recommended VPS Specifications**
>
> * **CPU**: 1-2 vCPU (sufficient for Pangolin + CrowdSec)
> * **RAM**: 2-4 GB (minimum 2 GB for Docker containers)
> * **Storage**: 20-40 GB SSD
> * **OS**: Ubuntu 24.04 LTS or Debian 12
> * **Network**: Public IPv4 address
>
> For Hetzner Cloud, the CPX11 (2 vCPU, 2 GB RAM, 40 GB SSD) instance is recommended.

**Hetzner Cloud Instructions:**

1. Navigate to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Select your project or create a new one
3. Click "Add Server"
4. Configure the server:
   * **Location**: Choose the closest to your users (e.g., `nbg1` for Nuremberg)
   * **Image**: Ubuntu 24.04 LTS
   * **Type**: Shared vCPU → CPX11 or similar
   * **SSH Key**: Add your SSH public key
   * **Name**: Use your chosen hostname (e.g., `pangolin-1`)
5. Click "Create & Buy now"
6. Note the public IP address assigned

### Step 2.2 — Initial system update

Connect to your VPS and perform initial system updates.

```bash
# Connect to the VPS
ssh root@<VPS_IP>

# Update system packages
apt update && apt upgrade -y

# Install basic utilities
apt install -y curl wget git htop nano ufw

# Optional: Set the hostname
hostnamectl set-hostname <VPS_HOSTNAME>

# Optional: Configure timezone
timedatectl set-timezone Europe/Paris
```

***

## Part 3 — Install and configure Tailscale

This section configures Tailscale for secure remote access to the VPS. After this step, you'll be able to access the VPS via its Tailscale IP instead of the public IP, which is more secure.

> **\[!IMPORTANT]**
> Tailscale provides zero-trust network access to your VPS. Once configured, you should only access the VPS via Tailscale and block SSH access from the public internet using the firewall rules in Part 3.
>
> Documentation: [Tailscale Installation](https://tailscale.com/kb/1031/install-linux/)

### Step 3.1 — Install Tailscale

```bash
# Install Tailscale using the official script
curl -fsSL https://tailscale.com/install.sh | sh
```

### Step 3.2 — Authenticate Tailscale

Authenticate Tailscale using the auth key generated in Part 1:

```bash
# Authenticate with Tailscale (replace with your actual key from Step 1.1)
tailscale up --auth-key=tskey-auth-xxxxx-CNTRL-xxxxx --accept-routes --ssh
```

**Parameters explained:**

* `--auth-key`: The Tailscale authentication key
* `--accept-routes`: Accept subnet routes advertised by other nodes
* `--ssh`: Enable Tailscale SSH for secure remote access ([Tailscale SSH docs](https://tailscale.com/kb/1193/tailscale-ssh/))

### Step 3.3 — Verify Tailscale connection

```bash
# Check Tailscale status
tailscale status

# Get the Tailscale IP address
tailscale ip -4

# Test connectivity from your local machine
# From your local machine (with Tailscale connected):
ping <tailscale-ip-from-above>
ssh root@<tailscale-ip-from-above>
```

***

## Part 4 — Configure firewall rules

Configure UFW (Uncomplicated Firewall) to allow only necessary traffic. This follows a zero-trust approach where we deny all incoming traffic except from Tailscale and essential public services.

> **\[!WARNING]**
> **Firewall Configuration Order Matters**
>
> 1. Set default policies FIRST
> 2. Add allow rules BEFORE enabling UFW
> 3. Test SSH access via Tailscale BEFORE enabling the firewall
> 4. Keep a backup connection open when enabling UFW for the first time
>
> If you get locked out, use your cloud provider's console/VNC access to disable UFW.

```bash
# Set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow Tailscale subnet (100.64.0.0/10 is the CGNAT range used by Tailscale)
ufw allow from 100.64.0.0/10
ufw comment "Allow all traffic from Tailscale network" last

# Allow HTTP and HTTPS (for Pangolin and public services)
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# Allow Pangolin VPN ports (Wireguard)
ufw allow 51820/udp comment "Pangolin primary VPN"
ufw allow 21820/udp comment "Pangolin secondary VPN"

# Enable the firewall
ufw enable

# Verify the configuration
ufw status verbose
```

Expected output:

```
Status: active

To                         Action      From
--                         ------      ----
Anywhere                   ALLOW       100.64.0.0/10    # Allow all traffic from Tailscale network
80/tcp                     ALLOW       Anywhere         # HTTP
443/tcp                    ALLOW       Anywhere         # HTTPS
51820/udp                  ALLOW       Anywhere         # Pangolin primary VPN
21820/udp                  ALLOW       Anywhere         # Pangolin secondary VPN
```

***

## Part 5 — Install and configure Docker

Docker Engine and related components are automatically installed by the Pangolin installer. This section is for reference only.

> **\[!NOTE]**
> **Docker is installed automatically by Pangolin**
>
> The Pangolin installer checks for Docker and installs it if not present. You typically don't need to manually install Docker. This section is included for:
>
> * Understanding what Pangolin installs
> * Troubleshooting Docker issues
> * Manual Docker configuration (advanced users)
>
> **Skip to Part 6** if you're following the standard installation.

### Step 5.1 — Verify Docker installation (after Pangolin install)

After installing Pangolin (Part 6), verify Docker is properly configured:

```bash
# Check Docker version
docker --version
docker compose version

# Verify Docker daemon is running
systemctl status docker

# Check Docker daemon configuration
cat /etc/docker/daemon.json
```

Expected daemon.json (configured by Pangolin):

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
```

### Step 5.2 — Manual Docker installation (only if needed)

If you need to install Docker manually before Pangolin:

```bash
# Remove any old Docker packages
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  apt remove -y $pkg
done

# Install Docker using the official convenience script
curl -fsSL https://get.docker.com | sh

# Enable Docker to start on boot
systemctl enable docker

# Verify installation
docker run hello-world
```

***

## Part 6 — Install Pangolin

Pangolin is a Wireguard VPN solution that provides secure remote access. The installer is an all-in-one solution that automatically handles the installation of Docker, CrowdSec, and Traefik bouncer.

> **\[!IMPORTANT]**
> **Pangolin Installer includes:**
>
> * **Docker Engine**: Automatically installed if not present
> * **Pangolin Server**: The main VPN server (Wireguard-based)
> * **Pangolin Web UI**: Web interface for management
> * **CrowdSec**: Security monitoring and IP blocking
> * **Traefik Bouncer**: CrowdSec integration with Traefik
>
> Documentation: [Pangolin Documentation](https://docs.pangolin.net/)

### Step 6.1 — Install Pangolin via official installer

```bash
# Download and run the Pangolin installer
curl -fsSL https://pangolin.net/get-installer.sh | bash
./installer
```

The installer will:

1. Check for Docker and install it if missing
2. Download required Docker images (Pangolin, CrowdSec, Traefik)
3. Create necessary Docker networks and volumes
4. Start all containers via docker-compose
5. Generate a setup token for web configuration

> **\[!NOTE]**
> The Pangolin installer creates a `docker-compose.yml` file (typically in `/opt/pangolin` or the installation directory) that includes all services.

### Step 6.2 — Retrieve Pangolin setup token

```bash
# Get the setup token from Pangolin logs
docker logs pangolin | grep -A3 "SETUP TOKEN"

# Or search for the token pattern
docker logs pangolin 2>&1 | grep -E "token|TOKEN|setup"
```

The output will look like:

```
SETUP TOKEN EXISTS: abc123def456ghi789
Please visit https://<VPS_IP> to complete setup
```

### Step 6.3 — Complete Pangolin web setup

1. Navigate to `https://<VPS_IP>` or `https://<TAILSCALE_IP>` in your browser
2. Enter the setup token from the previous step
3. Create an admin account
4. Configure basic settings:
   * **Organization Name**: Your organization name
   * **Domain**: Your Pangolin domain (e.g., `pangolin.chezmoi.sh`)
   * **Network Settings**: Configure VPN subnet (default: `10.10.0.0/24`)

### Step 6.4 — Configure SSO with PocketID (optional)

If you have PocketID or another OIDC provider, you can configure SSO:

1. Navigate to **Settings** → **Identity Providers** → **Add Provider**
2. Select **PocketID** or **Generic OIDC**
3. Configure the provider settings:
   * **Issuer URL**: Your OIDC issuer (e.g., `https://auth.chezmoi.sh`)
   * **Client ID**: From your OIDC provider
   * **Client Secret**: From your OIDC provider
4. Configure organization rules:
   * **Role Mapping**: `contains(groups, 'admin') && 'Admin' || 'Member'`
   * **Organization Mapping**: `true == true`

> **\[!NOTE]**
> For detailed SSO configuration, refer to: [Pangolin Identity Providers](https://docs.pangolin.net/manage/identity-providers/pocket-id)

***

## Part 7 — Configure CrowdSec

CrowdSec is automatically installed by Pangolin, but we need to enroll it with the CrowdSec Console and install additional security collections.

> **\[!IMPORTANT]**
> **CrowdSec Components installed by Pangolin:**
>
> * **Local Agent**: Analyzes logs and detects threats
> * **Traefik Bouncer**: Enforces decisions (blocks IPs in Traefik)
> * **Base Collections**: Basic parsers and scenarios
>
> We need to add specialized collections for enhanced security.
>
> Documentation: [CrowdSec Documentation](https://docs.crowdsec.net/)

### Step 7.1 — Verify CrowdSec installation

```bash
# Check if CrowdSec is running
docker ps | grep crowdsec

# Expected output:
# - crowdsec container (main agent)
# - traefik-bouncer container (integration with Traefik)
```

### Step 7.2 — Enroll CrowdSec with Console

Enroll the CrowdSec agent using the enrollment key generated in Part 1:

```bash
# Enroll CrowdSec with the console (replace with your actual key from Step 1.2)
docker exec -it crowdsec cscli console enroll a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

# Verify enrollment
docker exec -it crowdsec cscli console status
```

Expected output:

```
Option                        Value
Enabled                       true
API URL                       https://api.crowdsec.net/v1
Organization ID               <your-org-id>
```

> **\[!NOTE]**
> CrowdSec Console enrollment enables:
>
> * Centralized security monitoring across multiple servers
> * Threat intelligence sharing with the CrowdSec community
> * Advanced analytics and reporting
>
> Documentation: [CrowdSec Console](https://docs.crowdsec.net/docs/console/enrollment)

### Step 7.3 — Install additional CrowdSec collections

Install specialized security collections for enhanced protection:

```bash
# Install Traefik parser and scenarios
docker exec crowdsec cscli collections install crowdsecurity/traefik

# Install virtual patching for known CVEs
docker exec crowdsec cscli collections install crowdsecurity/appsec-virtual-patching

# Install generic WAF rules
docker exec crowdsec cscli collections install crowdsecurity/appsec-generic-rules

# Install OWASP Core Rule Set for in-band protection
docker exec crowdsec cscli collections install crowdsecurity/appsec-crs-inband

# Restart CrowdSec to apply changes
docker restart crowdsec
```

**Collections explained:**

| Collection                              | Purpose                                                                            | Protection Level |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| `crowdsecurity/traefik`                 | Parses Traefik access logs and detects HTTP-based attacks                          | ⭐⭐⭐ Essential    |
| `crowdsecurity/appsec-virtual-patching` | Blocks exploitation attempts for known CVEs (Common Vulnerabilities and Exposures) | ⭐⭐⭐ Critical     |
| `crowdsecurity/appsec-generic-rules`    | Generic Web Application Firewall rules for common attack patterns                  | ⭐⭐⭐ High         |
| `crowdsecurity/appsec-crs-inband`       | OWASP Core Rule Set for comprehensive in-band attack protection                    | ⭐⭐⭐ High         |

**Additional recommended collections (optional):**

```bash
# HTTP protocol violations
docker exec crowdsec cscli collections install crowdsecurity/http-cve

# Bot detection
docker exec crowdsec cscli collections install crowdsecurity/http-bad-user-agent

# IP reputation
docker exec crowdsec cscli collections install crowdsecurity/sshd  # If SSH is exposed

# Restart after adding optional collections
docker restart crowdsec
```

> **\[!TIP]**
> Browse all available collections: [CrowdSec Hub](https://hub.crowdsec.net/browse/#collections)
>
> To list installed collections:
>
> ```bash
> docker exec crowdsec cscli collections list
> ```

### Step 7.4 — Verify Traefik bouncer configuration

The Traefik bouncer is automatically configured by Pangolin. Verify it's working:

```bash
# Check bouncer connection
docker exec crowdsec cscli bouncers list

# Expected output:
# NAME             IP ADDRESS  VALID  LAST API PULL
# traefik-bouncer  172.x.x.x   ✓      2025-11-08 10:00:00

# View bouncer logs
docker logs traefik-bouncer

# Test that bouncer is actively blocking
docker exec crowdsec cscli decisions list
```

> **\[!NOTE]**
> The Traefik bouncer automatically blocks IPs that CrowdSec identifies as malicious. No manual configuration is needed as Pangolin handles the integration.

***

## Part 8 — Setup automated backups

Create a robust backup system for Pangolin configuration and data.

### Step 8.1 — Create backup script

Create a comprehensive backup script:

```bash
cat > /usr/local/bin/backup-pangolin.sh <<'EOF'
#!/bin/bash
#
# Pangolin Backup Script
# Description: Automated backup of Pangolin, CrowdSec, and related configurations
# Usage: Run manually or via cron
#

set -euo pipefail

# Configuration
BACKUP_ROOT="/var/backups/pangolin"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${DATE}"
LOG_FILE="${BACKUP_ROOT}/backup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "${BACKUP_ROOT}/logs"

log "Starting Pangolin backup to ${BACKUP_DIR}"

# Backup Pangolin configuration and data
if [ -d "/opt/pangolin" ]; then
    log "Backing up Pangolin configuration..."
    tar czf "${BACKUP_DIR}/pangolin-config.tar.gz" \
        -C /opt/pangolin \
        --exclude='*.log' \
        --exclude='*.sock' \
        . 2>/dev/null || warning "Some Pangolin files could not be backed up"
    success "Pangolin configuration backed up"
else
    warning "Pangolin directory not found at /opt/pangolin"
fi

# Backup CrowdSec configuration and data
if [ -d "/opt/pangolin/crowdsec" ]; then
    log "Backing up CrowdSec configuration..."
    tar czf "${BACKUP_DIR}/crowdsec-config.tar.gz" \
        -C /opt/pangolin/crowdsec \
        config 2>/dev/null || warning "CrowdSec config could not be backed up"
    
    log "Backing up CrowdSec data..."
    tar czf "${BACKUP_DIR}/crowdsec-data.tar.gz" \
        -C /opt/pangolin/crowdsec \
        data 2>/dev/null || warning "CrowdSec data could not be backed up"
    success "CrowdSec backed up"
fi

# Backup docker-compose file
if [ -f "/opt/pangolin/docker-compose.yml" ]; then
    log "Backing up docker-compose configuration..."
    cp /opt/pangolin/docker-compose.yml "${BACKUP_DIR}/docker-compose.yml"
    success "docker-compose.yml backed up"
fi

# Export Docker volumes (if any custom volumes exist)
log "Exporting Docker volumes..."
docker volume ls --format '{{.Name}}' | grep pangolin | while read -r volume; do
    log "Backing up volume: $volume"
    docker run --rm \
        -v "$volume":/volume \
        -v "$BACKUP_DIR":/backup \
        alpine \
        tar czf "/backup/volume-${volume}.tar.gz" -C /volume . 2>/dev/null || warning "Volume $volume could not be backed up"
done

# Export CrowdSec decisions and metrics (optional)
if docker ps | grep -q crowdsec; then
    log "Exporting CrowdSec decisions..."
    docker exec crowdsec cscli decisions list -o json > "${BACKUP_DIR}/crowdsec-decisions.json" 2>/dev/null || warning "Could not export decisions"
    
    log "Exporting CrowdSec metrics..."
    docker exec crowdsec cscli metrics > "${BACKUP_DIR}/crowdsec-metrics.txt" 2>/dev/null || warning "Could not export metrics"
fi

# Create backup manifest
cat > "${BACKUP_DIR}/MANIFEST.txt" <<MANIFEST
Pangolin Backup Manifest
========================
Backup Date: $(date)
Hostname: $(hostname)
VPS IP: $(hostname -I | awk '{print $1}')
Tailscale IP: $(tailscale ip -4 2>/dev/null || echo "N/A")

Backup Contents:
$(ls -lh "$BACKUP_DIR")

Docker Containers:
$(docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}')

CrowdSec Collections:
$(docker exec crowdsec cscli collections list 2>/dev/null || echo "N/A")

Disk Usage:
$(df -h /)
MANIFEST

success "Backup manifest created"

# Calculate backup size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | awk '{print $1}')
log "Backup completed. Size: ${BACKUP_SIZE}"

# Cleanup old backups
log "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_ROOT" -maxdepth 1 -type d -name "20*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true

# Log cleanup
find "${BACKUP_ROOT}/logs" -name "*.log" -mtime +30 -delete 2>/dev/null || true

# Summary
BACKUP_COUNT=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name "20*" | wc -l)
success "Backup completed successfully. Total backups: ${BACKUP_COUNT}"

# Send notification (optional - uncomment if you have ntfy or similar)
# curl -d "Pangolin backup completed: ${BACKUP_SIZE}" https://ntfy.sh/pangolin-backups

exit 0
EOF

chmod +x /usr/local/bin/backup-pangolin.sh
```

### Step 8.2 — Test backup script

Run the backup script manually to verify it works:

```bash
# Run backup manually
/usr/local/bin/backup-pangolin.sh

# Check backup was created
ls -lh /var/backups/pangolin/

# View backup manifest
cat /var/backups/pangolin/*/MANIFEST.txt
```

### Step 8.3 — Schedule automated backups

Configure cron to run daily backups:

```bash
# Edit crontab
crontab -e

# Add the following line (runs daily at 2 AM):
0 2 * * * /usr/local/bin/backup-pangolin.sh >> /var/backups/pangolin/logs/cron.log 2>&1

# Alternative: Use crontab -l to append without editing
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-pangolin.sh >> /var/backups/pangolin/logs/cron.log 2>&1") | crontab -

# Verify cron job is scheduled
crontab -l
```

**Alternative backup schedules:**

```bash
# Every 6 hours
0 */6 * * * /usr/local/bin/backup-pangolin.sh >> /var/backups/pangolin/logs/cron.log 2>&1

# Every day at 3 AM
0 3 * * * /usr/local/bin/backup-pangolin.sh >> /var/backups/pangolin/logs/cron.log 2>&1

# Every Sunday at 1 AM (weekly)
0 1 * * 0 /usr/local/bin/backup-pangolin.sh >> /var/backups/pangolin/logs/cron.log 2>&1
```

### Step 8.4 — Configure backup retention

Adjust backup retention by setting the environment variable:

```bash
# Create systemd environment file for backup configuration
cat > /etc/default/pangolin-backup <<EOF
# Pangolin Backup Configuration
BACKUP_RETENTION_DAYS=7
EOF

# Update the cron job to use the environment file
crontab -l | grep -v backup-pangolin.sh | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * * source /etc/default/pangolin-backup; /usr/local/bin/backup-pangolin.sh >> /var/backups/pangolin/logs/cron.log 2>&1") | crontab -
```

### Step 8.5 — Restore from backup (procedure)

To restore from a backup:

```bash
# Stop all containers
cd /opt/pangolin
docker compose down

# List available backups
ls -lh /var/backups/pangolin/

# Extract backup (replace DATE with actual backup date)
BACKUP_DATE="20251108-020000"
cd /opt/pangolin
tar xzf "/var/backups/pangolin/${BACKUP_DATE}/pangolin-config.tar.gz"
tar xzf "/var/backups/pangolin/${BACKUP_DATE}/crowdsec-config.tar.gz" -C crowdsec/
tar xzf "/var/backups/pangolin/${BACKUP_DATE}/crowdsec-data.tar.gz" -C crowdsec/

# Restore docker-compose.yml
cp "/var/backups/pangolin/${BACKUP_DATE}/docker-compose.yml" /opt/pangolin/

# Restore Docker volumes (if any)
for volume_backup in /var/backups/pangolin/${BACKUP_DATE}/volume-*.tar.gz; do
    volume_name=$(basename "$volume_backup" .tar.gz | sed 's/volume-//')
    docker volume create "$volume_name"
    docker run --rm \
        -v "$volume_name":/volume \
        -v /var/backups/pangolin/${BACKUP_DATE}:/backup \
        alpine \
        sh -c "cd /volume && tar xzf /backup/$(basename $volume_backup)"
done

# Start containers
docker compose up -d

# Verify services are running
docker ps
docker logs pangolin
docker logs crowdsec
```

***

## Part 9 — Verification and testing

### Step 9.1 — Verify all services are running

```bash
# Check all containers
docker ps

# Expected containers:
# - pangolin (VPN server)
# - pangolin-web (Web UI)
# - traefik (Reverse proxy)
# - crowdsec (Security engine)
# - traefik-bouncer (CrowdSec bouncer)
```

### Step 9.2 — Test Pangolin VPN connectivity

1. Download the Pangolin client from your Pangolin web UI
2. Configure a new VPN connection
3. Connect to the VPN
4. Test connectivity:

```bash
# From your client machine
ping <VPN_SERVER_INTERNAL_IP>
curl https://pangolin.chezmoi.sh
```

### Step 9.3 — Test CrowdSec blocking

Test that CrowdSec is actively blocking malicious traffic:

```bash
# Generate a test attack (safe, won't harm the system)
docker exec crowdsec cscli decisions add --ip 1.2.3.4 --duration 4h --reason "test"

# Verify the decision
docker exec crowdsec cscli decisions list

# Try to access from a different machine (optional)
# The IP 1.2.3.4 should now be blocked

# Remove the test decision
docker exec crowdsec cscli decisions delete --ip 1.2.3.4
```

### Step 9.4 — Monitor logs

```bash
# Pangolin logs
docker logs -f pangolin

# CrowdSec logs
docker logs -f crowdsec

# Traefik logs
docker logs -f traefik
```

***

## Troubleshooting

### Tailscale not connecting

```bash
# Check Tailscale status
tailscale status

# View detailed logs
journalctl -u tailscaled -f

# Restart Tailscale
systemctl restart tailscaled
```

### Pangolin web UI not accessible

```bash
# Check if containers are running
docker ps

# Check Pangolin logs
docker logs pangolin

# Verify firewall rules
ufw status

# Test local access
curl -k https://localhost
```

### CrowdSec not enrolling

```bash
# Check CrowdSec logs
docker logs crowdsec

# Verify enrollment key
docker exec crowdsec cscli console status

# Re-enroll if needed
docker exec crowdsec cscli console enroll <enrollment-key>
```

### Docker containers not starting

```bash
# Check Docker daemon status
systemctl status docker

# View Docker logs
journalctl -u docker -f

# Check disk space
df -h

# Restart Docker
systemctl restart docker
```

***

## Post-installation recommendations

### Security hardening

1. **Disable root SSH access** (after confirming Tailscale SSH works):

```bash
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd
```

2. **Enable automatic security updates**:

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

### Monitoring and maintenance

1. **Set up log rotation** for Docker:

```bash
# Already configured in Step 5.2, but verify:
cat /etc/docker/daemon.json
```

2. **Monitor backup success**:

```bash
# View recent backups
ls -lh /var/backups/pangolin/

# Check backup logs
tail -f /var/backups/pangolin/logs/cron.log

# View last backup manifest
cat $(ls -td /var/backups/pangolin/20* | head -1)/MANIFEST.txt
```

3. **Update your infrastructure documentation**:
   * Document the VPS in your inventory
   * Update network diagrams
   * Keep firewall rules documented

***

## Future Improvements: Update Management

The current configuration, following the removal of Watchtower, does not have an automated mechanism for updating applications (Pangolin, Traefik, etc.). The process is currently manual.

The future goal is to adopt a declarative approach where application versions are tracked in Git and applied automatically.

### Path 1: `ansible-pull` model (preferred)

This approach aims to use Ansible to manage the application lifecycle without requiring a central Ansible server.

**Components:**

* **Ansible:** To manage the `docker-compose.yml` via templates and variables. Docker image versions would be stored in Ansible variable files.
* **Git Repository:** Acts as the source of truth for the configuration.
* **Renovate/Dependabot:** A tool to detect new image versions and propose Pull Requests to update the version variables in the Git repository.
* **Cronjob on the VPS:** A scheduled task that periodically runs the `ansible-pull` command.

**Envisioned Workflow:**

1. **Auto-update:** Renovate detects a new version of the `fossorial/pangolin:latest` image and opens a PR to update the corresponding variable in the configuration repository.
2. **Validation:** The PR is reviewed and merged into the main branch.
3. **Deployment:** On the VPS, a cronjob runs `ansible-pull` at regular intervals. This command fetches the latest version of the configuration from the Git repository.
4. **Application:** Ansible generates the new `docker-compose.yml` and redeploys the relevant services, thus applying the update.

### Path 2: Lightweight Kubernetes (k3s) with GitOps

Alternatively, if managing the configuration with Ansible proves to be complex, a Kubernetes-based approach could be considered.

* **k3s:** A lightweight Kubernetes distribution, ideal for a single VPS.
* **FluxCD or ArgoCD:** A GitOps controller that synchronizes the cluster's state with a Git repository.

This model is conceptually similar (Git as the source of truth) but relies on the Kubernetes ecosystem. It could be simpler in the long run if configuration complexity increases, but it represents a more significant architectural change.

***

## References

* [Pangolin Documentation](https://docs.pangolin.net/)
* [Tailscale Documentation](https://tailscale.com/kb/)
* [CrowdSec Documentation](https://docs.crowdsec.net/)
* [Docker Documentation](https://docs.docker.com/)
* [UFW Documentation](https://help.ubuntu.com/community/UFW)

***

## Changelog

| Date       | Version | Description                                                                                                                  |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2025-11-08 | 1.0.0   | Initial procedure created                                                                                                    |
| 2025-11-08 | 1.0.1   | Simplified filename from `INF-20251108-00.bootstrap-vps-pangolin-crowdsec.md` to `HOW_TO_BOOTSTRAP.md`                       |
| 2025-11-08 | 1.2.0   | Refactored procedure: removed Watchtower and fail2ban, corrected numbering, and added a section on future update management. |
