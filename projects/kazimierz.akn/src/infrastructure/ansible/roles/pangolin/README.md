# Ansible Role: Pangolin

Deploy the [Pangolin](https://github.com/fosrl/pangolin) tunneled reverse proxy stack with Docker Compose. Pangolin
provides a self-hosted, identity-aware alternative to Cloudflare Tunnels and Tailscale Funnel, using WireGuard for
secure tunneling.

## Stack

- **Pangolin** — main controller and web dashboard
- **Gerbil** — WireGuard tunnel manager for site and client (Newt) connections
- **Traefik** — reverse proxy in front of Pangolin, automatic Let's Encrypt certificates
- **error-pages** — themed error responses for Traefik
- GeoIP (MaxMind GeoLite2) database kept fresh by a nightly systemd timer for Pangolin's geoblocking middleware

No CrowdSec: it was tried and dropped -- its shared threat-intel bouncer produced false positives that blacklisted
legitimate guests. Pangolin's own access controls are relied on instead.

## Requirements

- `community.docker` collection (uses the `docker_compose_v2` module, Compose v2 only)
- Docker Engine with the Compose v2 plugin on the target host
- DNS A record(s) pointing at the host's public IP for every domain in `pangolin_domains`
- Firewall: TCP 80/443, UDP `pangolin_wireguard_site_port`/`pangolin_wireguard_client_port` (default 51820/21820)

## Role Variables

See `defaults/main.yml` for the full, authoritative list with comments. The variables that must be overridden in
`host_vars` (no usable default):

```yaml
pangolin_dashboard_url: "https://pangolin.example.com"
pangolin_domains:
  - "pangolin.example.com"
pangolin_server_secret: "" # min 8 chars, 32+ recommended -- use ansible-vault
pangolin_acme_email: "admin@example.com" # must not be the placeholder value
pangolin_gerbil_base_endpoint: "pangolin.example.com"
pangolin_public_ip: "" # e.g. "{{ ansible_default_ipv4.address }}"
```

`pangolin_bind_ip` should be set to the host's public IP whenever Tailscale (or anything else) also wants port 443 --
otherwise Traefik and that other listener fight over the same port on all interfaces.

### Integration API (tailnet-only remote control)

Set `pangolin_enable_integration_api: true` to turn on Pangolin's
[Integration API](https://docs.pangolin.net/self-host/advanced/integration-api) for programmatic control (creating
sites, resources, users, etc. via API key). This is a separate service from the `/api/v1` the web dashboard itself
already routes publicly through Traefik -- it listens on its own port (`pangolin_integration_port`, default 3003), bound
to `127.0.0.1` only, and is re-exposed on the tailnet via `tailscale serve` (requires `tailscaled` running and logged in
on the host). It is never reachable from the public internet. Swagger docs are served at `/v1/docs` once enabled.

## Directory Structure

```text
{{ pangolin_compose_dir }}/            # default: /opt/pangolin
├── docker-compose.yml
└── config/
    ├── config.yml                     # Pangolin config (contains the server secret, mode 0640)
    ├── db/                            # SQLite database (unless pangolin_postgres_connection_string is set)
    ├── geoip/                         # GeoLite2-Country.mmdb, refreshed nightly
    ├── logs/
    ├── letsencrypt/acme.json          # mode 0600, required by Traefik
    └── traefik/
        ├── traefik_config.yml         # static config
        └── dynamic_config.yml         # routers, services, middlewares
```

## Post-Deployment

1. Visit `{{ pangolin_dashboard_url }}/auth/initial-setup` to create the admin account. The role extracts the one-time
   setup token from the Pangolin container logs and prints it (`tags: setup`), but it only appears once -- on the very
   first deployment.
2. Install [Newt](https://github.com/fosrl/newt) on any device that needs to open a tunnel through this gateway.

## Operations

```bash
docker compose -f /opt/pangolin/docker-compose.yml ps
docker compose -f /opt/pangolin/docker-compose.yml logs -f [pangolin|gerbil|traefik|error-pages]
docker compose -f /opt/pangolin/docker-compose.yml restart
```

Re-running the playbook (or letting `ansible-pull` do it) is the supported way to update or reconfigure the stack --
templates are idempotent and the role stops/restarts the stack automatically when `docker-compose.yml` changes.

### Troubleshooting

| Symptom                           | Check                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No TLS certificate                | Ports 80/443 reachable from the internet, DNS actually resolves to this host, `traefik` logs, `acme.json` is mode 0600 |
| Pangolin container unhealthy      | `pangolin_server_secret` length, `config.yml` is valid YAML, `pangolin` container logs                                 |
| Gerbil / Newt tunnels not working | WireGuard ports open in UFW/NSG, `gerbil` container logs, `config/key` was generated                                   |

## Tags

| Tag             | Scope                              |
| --------------- | ---------------------------------- |
| `pangolin`      | Everything in this role (default)  |
| `directories`   | Directory/permission setup only    |
| `configuration` | Template deployment only           |
| `traefik`       | Traefik-specific templates only    |
| `docker`        | Compose stack deploy/redeploy only |
| `setup`         | Setup-token extraction only        |
| `scripts`       | GeoIP update script                |
| `systemd`       | GeoIP update timer/service         |
| `tailscale`     | Integration API Tailscale Serve    |

## References

- [Pangolin](https://github.com/fosrl/pangolin) / [Gerbil](https://github.com/fosrl/gerbil) /
  [Newt](https://github.com/fosrl/newt)
- [Traefik documentation](https://doc.traefik.io/traefik/)
