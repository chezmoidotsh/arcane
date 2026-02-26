# Shodan.akn AI Stack (macOS)

Ansible playbooks to provision the macOS AI stack for Shodan natively, bypassing Docker.

## Services Installed
- **LiteLLM**: AI gateway proxy. Runs on `127.0.0.1:4000`.
- **Kokoro-FastAPI**: Local TTS engine running on CPU+ONNX (macOS constraint). Runs on `127.0.0.1:8880`.
- **Caddy**: Reverse proxy that acts as the only public entry point, providing automatic HTTPS via DNS-01 ACME challenge. Routes all traffic to LiteLLM. Listens on `https://shodan.local:1234`.

## Prerequisites
1. Base installation directory at `~/.local/state/shodan.akn` (automatically created).
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
ansible-playbook site.yml -i inventory/localhost.yml
```

## Troubleshooting / Logs

Logs for all services are written to dedicated folders within the state directory:
- `cat ~/.local/state/shodan.akn/services/litellm/logs/litellm.out.log`
- `cat ~/.local/state/shodan.akn/services/kokoro/logs/kokoro.out.log`
- `cat ~/.local/state/shodan.akn/services/caddy/logs/caddy.err.log`

To restart a service manually:
```bash
launchctl kickstart -k gui/$(id -u)/sh.chezmoi.shodan.litellm
launchctl kickstart -k gui/$(id -u)/sh.chezmoi.shodan.kokoro
launchctl kickstart -k gui/$(id -u)/sh.chezmoi.shodan.caddy
```
