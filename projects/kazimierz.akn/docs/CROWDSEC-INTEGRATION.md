# CrowdSec Integration with Pangolin

## Overview

This document describes how CrowdSec is integrated with Pangolin's Traefik reverse proxy to provide WAF (Web Application Firewall) and threat protection capabilities.

## Architecture

The integration consists of three main components:

1. **CrowdSec Service**: Threat detection and decision engine
2. **Traefik Plugin**: CrowdSec bouncer that enforces decisions
3. **Log Analysis**: CrowdSec reads Traefik access logs to detect threats

### Component Interaction

```text
                    ┌─────────────────────────────────────┐
                    │   Internet Traffic (Port 80/443)    │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │  Traefik (with CrowdSec Middleware)  │
                    │  • Checks LAPI for ban decisions     │
                    │  • Sends requests to AppSec (7422)   │
                    │  • Writes access logs                │
                    └─────┬────────────────────────────┬───┘
                          │                            │
              ┌───────────┘                            └───────────┐
              │ Allow                                  │ Logs      │
              ▼                                        ▼           │
   ┌──────────────────────┐              ┌─────────────────────┐   │
   │  Backend Services    │              │   CrowdSec Engine   │   │
   │  (Pangolin/Gerbil)   │              │ ┌─────────────────┐ │   │
   └──────────────────────┘              │ │ Log Parser      │◄┼───┘
                                         │ │ (traefik.yaml)  │ │
                                         │ └─────────────────┘ │
                                         │ ┌─────────────────┐ │
                                         │ │ AppSec WAF      │◄┼───┐
                                         │ │ (appsec.yaml)   │ │   │
                                         │ └─────────────────┘ │   │
                                         │ ┌─────────────────┐ │   │
                                         │ │ Decision Engine │ │   │
                                         │ └─────────────────┘ │   │
                                         │ ┌─────────────────┐ │   │
                                         │ │ LAPI (8080)     │─┼───┘
                                         │ │ (Bouncer API)   │ │ AppSec
                                         │ └─────────────────┘ │ Port 7422
                                         └─────────────────────┘
```

## Implementation Details

### Docker Compose Configuration

The CrowdSec service is configured in `docker-compose.yml.j2` with:

* **Health Check**: `cscli capi status` ensures CrowdSec is ready before Traefik starts
* **Log Volume**: Shared `traefik-logs` volume allows CrowdSec to read Traefik access logs
* **Acquis Configuration**: Mounted from `./config/crowdsec/acquis.d/` to define log sources
* **Collections**: Installed via environment variable (traefik, appsec-virtual-patching, etc.)

### Traefik Static Configuration

In `traefik_config.yml.j2`:

```yaml
experimental:
  plugins:
    crowdsec:
      moduleName: "github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin"
      version: "v1.4.4"

entryPoints:
  websecure:
    http:
      middlewares:
        - crowdsec@file  # Apply CrowdSec middleware globally
```

### Traefik Dynamic Configuration

In `dynamic_config.yml.j2`:

```yaml
http:
  middlewares:
    crowdsec:
      plugin:
        crowdsec:
          enabled: true
          crowdsecLapiKey: "PUT_YOUR_BOUNCER_KEY_HERE_OR_IT_WILL_NOT_WORK"
          crowdsecLapiHost: crowdsec:8080
          crowdsecAppsecEnabled: true
          crowdsecAppsecHost: crowdsec:7422
```

The Jinja2 variable `{{ pangolin_crowdsec_bouncer_key }}` is interpolated during template deployment. If undefined, it falls back to the placeholder `PUT_YOUR_BOUNCER_KEY_HERE_OR_IT_WILL_NOT_WORK`.

## Ansible Automation

### Workflow

The `crowdsec.yml` tasks file implements the following workflow (based on Pangolin's Go implementation):

1. **Directory Setup**: Create required directories for CrowdSec configuration
   * `/config/crowdsec`
   * `/config/crowdsec/acquis.d`
   * `/config/traefik/.ansible` (for hash storage)

2. **Template Change Detection**:
   * Calculate SHA256 hash of `dynamic_config.yml.j2` template
   * Compare with stored hash from previous run
   * Set `template_has_changed` flag accordingly

3. **Acquis Configuration**: Deploy two acquisition configs:
   * `traefik.yaml`: Traefik log file parsing
   * `appsec.yaml`: AppSec listener on port 7422

4. **Container Health Check**: Wait for CrowdSec container to be healthy

5. **Conditional Bouncer Regeneration** (only if template hash changed):
   * Check if `traefik-bouncer` already exists
   * Delete existing bouncer to regenerate API key
   * Create new bouncer: `docker exec crowdsec cscli bouncers add traefik-bouncer -o raw`
   * Extract and store key in Ansible fact (`pangolin_crowdsec_bouncer_key`)
   * Re-deploy dynamic\_config.yml template (Jinja2 automatically interpolates the API key from the fact)
   * Save new template hash to `.ansible/dynamic_config_template.sha256`

6. **Service Restart**: Trigger "Restart Pangolin stack" handler to reload Traefik configuration

**Idempotency**:

* Template hash stored in `config/traefik/.ansible/dynamic_config_template.sha256`
* Bouncer API key only regenerated when template **content** changes (not when config file is touched)
* Post-deployment modifications to `dynamic_config.yml` (API key injection) don't trigger regeneration
* Safe to run playbook multiple times without disrupting CrowdSec authentication

### Key Tasks

#### Acquis Configuration Deployment

Two acquisition sources are deployed from `files/crowdsec/acquis.d/`:

**Traefik Logs** (`traefik.yaml`):

```yaml
poll_without_inotify: false
filenames:
  - /var/log/traefik/*.log
labels:
  type: traefik
```

**AppSec Listener** (`appsec.yaml`):

```yaml
listen_addr: 0.0.0.0:7422
appsec_config: crowdsecurity/appsec-default
name: myAppSecComponent
source: appsec
labels:
  type: appsec
```

These files are deployed using `ansible.builtin.copy` since they don't require templating.

#### Template Hash Tracking

To ensure idempotency, the playbook tracks changes to the template file itself:

```yaml
- name: Calculate template hash for dynamic_config.yml
  ansible.builtin.stat:
    path: "{{ role_path }}/templates/dynamic_config.yml.j2"
    checksum_algorithm: sha256
  register: template_file_stat
  delegate_to: localhost

- name: Read previous template hash
  ansible.builtin.slurp:
    path: "{{ pangolin_compose_dir }}/config/traefik/.ansible/dynamic_config_template.sha256"
  register: previous_hash_content
  when: previous_hash_file.stat.exists

- name: Determine if template has changed
  ansible.builtin.set_fact:
    template_has_changed: "{{ not previous_hash_file.stat.exists or current_template_hash != previous_template_hash }}"
```

This approach prevents unnecessary bouncer regeneration when:

* The deployed config file is modified (API key injection)
* File metadata changes (timestamps, permissions)
* Template variables change but template structure remains the same

#### API Key Generation

```yaml
- name: Generate new Traefik bouncer API key
  ansible.builtin.command:
    cmd: docker exec crowdsec cscli bouncers add traefik-bouncer -o raw
  register: crowdsec_bouncer_key_raw
  when:
    - template_has_changed  # Only when template actually changed
```

#### Configuration Update

```yaml
- name: Re-deploy dynamic configuration with bouncer API key
  ansible.builtin.template:
    src: dynamic_config.yml.j2
    dest: "{{ pangolin_compose_dir }}/config/traefik/dynamic_config.yml"
    mode: "0644"
    owner: root
    group: root
  when:
    - template_has_changed
    - pangolin_crowdsec_bouncer_key is defined
  notify: Restart Pangolin stack
  no_log: true  # Hide sensitive information
```

**Handler Configuration**:

The `Restart Pangolin stack` handler is triggered when the template changes, ensuring Traefik picks up the new bouncer API key configuration without manual intervention.

## CrowdSec Features

### Collections Installed

Configured via `pangolin_crowdsec_collections` variable:

* `crowdsecurity/traefik`: Traefik-specific parsers and scenarios
* `crowdsecurity/appsec-virtual-patching`: CVE-based virtual patching
* `crowdsecurity/appsec-generic-rules`: Generic AppSec rules
* `crowdsecurity/appsec-crs-inband`: OWASP Core Rule Set integration

### Parsers Installed

* `crowdsecurity/whitelists`: IP whitelist support

### AppSec Configuration

* **Enabled**: Application Security (WAF) functionality active
* **Body Limit**: 10MB request body inspection
* **Failure Mode**: Block on AppSec failure or unreachable
* **Update Interval**: 15 seconds decision refresh

## IP Forwarding Configuration

### Trusted IPs

The configuration trusts internal networks for client IP detection:

```yaml
clientTrustedIPs:
  - "10.0.0.0/8"
  - "172.16.0.0/12"
  - "192.168.0.0/16"
  - "100.89.137.0/20"  # Tailscale network
```

### Forwarded Headers

Trusts all sources for forwarded headers (since traffic comes through VPN):

```yaml
forwardedHeadersTrustedIPs:
  - "0.0.0.0/0"
```

## Verification

### Check CrowdSec Status

```bash
docker exec crowdsec cscli capi status
docker exec crowdsec cscli metrics
```

### List Bouncers

```bash
docker exec crowdsec cscli bouncers list
```

### View Active Decisions

```bash
docker exec crowdsec cscli decisions list
```

### Monitor Traefik Logs

```bash
docker exec traefik tail -f /var/log/traefik/access.log
```

## Troubleshooting

### Bouncer Authentication Errors (HTTP 403)

**Symptom**: Traefik logs show `statusCode:403` when querying CrowdSec LAPI, and `cscli bouncers list` shows the bouncer exists but has never made an API pull.

**Cause**: API key mismatch between Traefik configuration and CrowdSec database.

**Solution (Ansible Method - Recommended)**:

1. Force template change detection by modifying the `dynamic_config.yml.j2` template:
   ```bash
   # Add a comment or whitespace to trigger hash change
   vi roles/pangolin/templates/dynamic_config.yml.j2
   ```

2. Re-run the Ansible playbook with appropriate tags:
   ```bash
   ansible-playbook site.yml --tags pangolin,crowdsec
   ```

3. The playbook will automatically:
   * Detect the template change
   * Delete and recreate the bouncer
   * Re-deploy the configuration with the new API key
   * Restart Traefik via handler

**Manual Method (Emergency Only)**:

> **Warning**: Manual changes will be overwritten on the next Ansible run. Use this method only for immediate troubleshooting.

1. Delete and recreate the bouncer with a new API key:
   ```bash
   docker exec crowdsec cscli bouncers delete traefik-bouncer
   BOUNCER_KEY=$(docker exec crowdsec cscli bouncers add traefik-bouncer -o raw)
   ```

2. Update the configuration file (note the pipe delimiter to handle special characters):
   ```bash
   sed -i "s|crowdsecLapiKey: \".*\"|crowdsecLapiKey: \"$BOUNCER_KEY\"|" \
     /opt/pangolin/config/traefik/dynamic_config.yml
   ```

3. Restart Traefik:
   ```bash
   cd /opt/pangolin && docker compose restart traefik
   ```

**Verification** (for both methods):

1. Verify authentication works:
   ```bash
   API_KEY=$(grep "crowdsecLapiKey:" /opt/pangolin/config/traefik/dynamic_config.yml | \
     awk '{print $2}' | tr -d '"')
   docker exec traefik wget -q -O- --header "X-Api-Key: $API_KEY" \
     http://crowdsec:8080/v1/decisions?ip=1.2.3.4
   ```
   Expected output: `null` (no decisions for this IP)

2. Check bouncer is now communicating:
   ```bash
   docker exec crowdsec cscli bouncers list
   ```
   The `Last API pull` column should show a recent timestamp.

### Bouncer Not Working

1. Verify API key is correctly injected:
   ```bash
   grep crowdsecLapiKey /opt/pangolin/config/traefik/dynamic_config.yml
   ```

2. Check bouncer connectivity:
   ```bash
   docker exec crowdsec cscli bouncers list
   ```

3. Verify Traefik can reach CrowdSec:
   ```bash
   docker exec traefik wget -O- http://crowdsec:8080/v1/heartbeat
   ```

### No Decisions Being Made

1. Verify log acquisition:
   ```bash
   docker exec crowdsec cscli metrics
   ```

2. Check log format matches parser:
   ```bash
   docker exec traefik cat /var/log/traefik/access.log | head -5
   ```

3. Test parser manually:
   ```bash
   docker exec crowdsec cscli parsers test -d /var/log/traefik/access.log
   ```

### AppSec Not Blocking

1. Verify AppSec is enabled:
   ```bash
   docker exec crowdsec cscli appsec-configs list
   ```

2. Check AppSec rules are loaded:
   ```bash
   docker exec crowdsec cscli appsec-rules list
   ```

## References

* [Pangolin CrowdSec Implementation](https://github.com/fosrl/pangolin/blob/main/install/crowdsec.go)
* [CrowdSec Traefik Bouncer Plugin](https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin)
* [CrowdSec Documentation](https://docs.crowdsec.net/)
