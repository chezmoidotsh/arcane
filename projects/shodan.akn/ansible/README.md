# Shodan.akn AI Stack (macOS)

Ansible playbooks to provision the macOS AI stack for Shodan natively, bypassing Docker.

## Services Installed
- **LiteLLM**: AI gateway proxy. Runs on `127.0.0.1:4000`.
- **Kokoro-FastAPI**: Local TTS engine running on CPU+ONNX (macOS constraint). Runs on `127.0.0.1:8880`.
- **Caddy**: Reverse proxy that acts as the only public entry point, providing automatic HTTPS via DNS-01 ACME challenge. Routes all traffic to LiteLLM. Listens on `https://shodan.local:1234`.

## Prerequisites
1. Dedicated storage volume mounted at `/Volumes/AI Storage`.
2. A valid domain name and DNS provider supported by `caddy-dns`.

## DNS Challenge Configuration

Caddy needs an API token from your DNS provider to obtain the Let's Encrypt certificate.

1. Export the token in your shell before running Ansible:
   ```bash
   export CADDY_DNS_API_TOKEN="your_token_here"
   ```
   *(Ansible reads this var via `lookup('env')` while templating the plist)*

2. Open `inventory/localhost.yml` and set:
   - `caddy_hostname`
   - `caddy_acme_email`
   - `caddy_dns_plugin` (e.g. `cloudflare`, `route53`, `porkbun`)

## Execution

```bash
# Dry-run
ansible-playbook site.yml -i inventory/localhost.yml --check

# Apply
ansible-playbook site.yml -i inventory/localhost.yml -K
```

*(Note: `-K` prompts for the sudo password, which is required only for Caddy installation in `/usr/local/bin` and loading LaunchDaemons into `/Library/LaunchDaemons`).*

## Troubleshooting / Logs

Logs for all services are written to dedicated folders on the AI Storage volume:
- `cat "/Volumes/AI Storage/services/litellm/logs/litellm.out.log"`
- `cat "/Volumes/AI Storage/services/kokoro/logs/kokoro.out.log"`
- `cat "/Volumes/AI Storage/services/caddy/logs/caddy.err.log"`

To restart a service manually:
```bash
sudo launchctl kickstart -k system/sh.chezmoi.shodan.litellm
sudo launchctl kickstart -k system/sh.chezmoi.shodan.kokoro
sudo launchctl kickstart -k system/sh.chezmoi.shodan.caddy
```
