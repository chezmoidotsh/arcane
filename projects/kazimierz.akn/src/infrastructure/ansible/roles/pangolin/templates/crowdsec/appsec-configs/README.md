# CrowdSec AppSec Configurations

This directory contains CrowdSec Application Security (WAF) custom configurations that modify the behavior of OWASP ModSecurity Core Rule Set (CRS) to prevent false positives while maintaining security protections.

## Configuration Strategy

Configurations are organized by **application** rather than by individual rules:

### Application-Specific Profiles

**Files**: `allow-{application}.yaml`
**Applied to**: Requests to configured application domains
**Purpose**: Prevent false positives for legitimate application traffic patterns

#### Core Infrastructure

* **`allow-pangolin.yaml`**: Pangolin dashboard profile (always deployed)
  * Rules: 911100 (REST methods), 920420 (Content-Type), 930120 (LFI/Docker socket)
  * Domains: Configured via `pangolin_domains`

#### User Applications

* **`allow-jellyfin.yaml`**: Jellyfin media server profile
  * Rules: 920180 (POST Content-Length), 920420 (Content-Type), 920450 (Accept-Charset)
  * Domains: Configured via `crowdsec_appsec_domains.jellyfin`

* **`allow-immich.yaml`**: Immich photo management profile
  * Rules: 920180 (POST Content-Length), 920420 (Content-Type)
  * Domains: Configured via `crowdsec_appsec_domains.immich`

## Adding New Application Profiles

### Step 1: Analyze CrowdSec Reports

When you see blocked traffic in CrowdSec alerts:

```bash
# View recent alerts
cscli alerts list --limit 20

# View specific alert details
cscli alerts inspect <alert-id>
```

Identify:

* **Application**: User-Agent, target URIs, request patterns
* **Triggered Rules**: Rule IDs (e.g., 920180, 920450)
* **Legitimacy**: Is this normal application behavior?

### Step 2: Create Application Profile

Create a new file: `allow-{application}.yaml.j2`

```yaml
---
name: custom/allow-{application}
description: Application profile for {Application Name}
default_remediation: ban

pre_eval:
  - filter: |
      IsInBand == true && (
        {%- for domain in crowdsec_appsec_domains.{application} | default([]) -%}
        req.Host == "{{ domain }}"
        {%- if not loop.last %} || {% endif -%}
        {%- endfor -%}
      )
    apply:
      # Document WHY each rule is disabled
      - RemoveInBandRuleByID(920180)  # Reason: Empty POST body is valid for /api/endpoint
      - RemoveInBandRuleByID(920450)  # Reason: App uses Accept-Charset header
```

### Step 3: Update Ansible Configuration

1. **Add variable to defaults** ([defaults/main.yml](../../defaults/main.yml)):

```yaml
crowdsec_appsec_domains:
  {application}: []
```

2. **Add deployment task** ([tasks/crowdsec.yml](../../tasks/crowdsec.yml)):

```yaml
- name: Deploy CrowdSec AppSec application profiles
  ansible.builtin.template:
    src: "crowdsec/appsec-configs/{{ item.config }}.j2"
    dest: "{{ pangolin_compose_dir }}/config/crowdsec/appsec-configs/{{ item.config }}"
    mode: "0644"
  loop:
    - config: allow-{application}.yaml
      domains: "{{ crowdsec_appsec_domains.{application} | default([]) }}"
  when: item.domains | length > 0
```

### Step 4: Configure in Host Vars

In your inventory host\_vars file:

```yaml
crowdsec_appsec_domains:
  {application}:
    - "{application}.example.com"
    - "app.example.com"
```

### Step 5: Deploy and Test

```bash
# Run Ansible playbook
ansible-playbook -i inventory site.yml --tags pangolin,crowdsec

# Verify configuration loaded in CrowdSec
docker exec crowdsec cscli appsec-configs list

# Test application traffic
# Monitor for new alerts
cscli alerts list --limit 10
```

## Common OWASP CRS Rules

### Frequently Disabled Rules

| Rule ID | Description                 | Common False Positive                        |
| ------- | --------------------------- | -------------------------------------------- |
| 911100  | HTTP Method Not Allowed     | REST APIs using PUT/DELETE/PATCH             |
| 920180  | POST without Content-Length | Empty POST bodies (valid HTTP)               |
| 920420  | Content-Type Not Allowed    | Custom or missing Content-Type headers       |
| 920450  | Restricted HTTP Header      | Accept-Charset and other standard headers    |
| 930120  | OS File Access Attempt      | Legitimate paths like /docker.sock in config |

### Rule Categories

* **911xxx**: Method Enforcement
* **920xxx**: Protocol Enforcement
* **930xxx**: Local File Inclusion (LFI)
* **931xxx**: Remote File Inclusion (RFI)
* **932xxx**: Remote Code Execution (RCE)
* **933xxx**: PHP Injection
* **941xxx**: XSS Detection
* **942xxx**: SQL Injection

## Security Best Practices

1. **Scope Minimization**: Only disable rules for specific domains that need them
2. **Document Everything**: Always explain WHY a rule is disabled in comments
3. **Monitor Continuously**: Review CrowdSec alerts regularly for new patterns
4. **Test Thoroughly**: Verify application functionality after deploying profiles
5. **Version Control**: All configurations are in Git - review changes carefully
6. **Least Privilege**: Prefer disabling specific rules over reducing anomaly thresholds

## Debugging Tips

### Configuration Not Loading

```bash
# Check CrowdSec logs for syntax errors
docker logs crowdsec | grep -i error

# Validate YAML syntax
docker exec crowdsec cat /etc/crowdsec/appsec-configs/allow-{app}.yaml | yamllint -
```

### Application Still Blocked

```bash
# Check if domains match exactly (case-sensitive)
docker exec crowdsec cscli alerts inspect <id> | grep "req.Host"

# Verify rule was actually disabled
docker exec crowdsec cscli appsec-rules list | grep {rule-id}
```

### Too Permissive

If you're seeing suspicious traffic getting through:

1. Review the disabled rules for that application
2. Consider adding more specific filters (URI patterns, methods)
3. Enable simulation mode to test without blocking:

```yaml
pre_eval:
  - filter: IsInBand == true && req.Host == "app.com" && req.URI startsWith "/admin"
    apply:
      - SetRemediation("log")  # Log only, don't block
```

## References

* [CrowdSec AppSec Documentation](https://docs.crowdsec.net/docs/appsec/)
* [OWASP ModSecurity CRS](https://coreruleset.org/)
* [CrowdSec Hooks Reference](https://docs.crowdsec.net/docs/appsec/hooks/)
* [CrowdSec Helpers Reference](https://docs.crowdsec.net/docs/appsec/helpers/)
