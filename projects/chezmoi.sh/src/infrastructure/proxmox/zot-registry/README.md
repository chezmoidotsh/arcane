# oci.chezmoi.sh — Zot OCI Registry LXC (Proxmox)

Standalone Proxmox LXC running NixOS + Zot + Caddy.
Replaces the former `zot-registry` Kubernetes StatefulSet on `amiya.akn`.

## Architecture

```
Internet
  │  HTTPS :443 (DNS-01 via Cloudflare)
  ▼
Caddy (0.0.0.0:80 redirect / 0.0.0.0:443 TLS termination)
  │  HTTP :5000 (localhost only)
  ▼
Zot (pull-through cache — 11 upstream registries)
  │
  └── /var/lib/zot  (local disk or NAS mount)
```

## Prerequisites

* Docker (used by `nix:build:lxc` to wrap the Nix build)
* `kubectl` configured for `amiya.akn` (for `secrets:init`)
* `sops` + age key in `SOPS_AGE_KEY_FILE` (configured in root `.mise.toml`)
* SSH key-based access to `root@<pve-host>` (for `push`)

## Secrets setup

The Cloudflare API token is managed by Crossplane (`cloudflare.iam.zot-registry.yaml` in
`projects/chezmoi.sh/src/infrastructure/crossplane/`). Once the ArgoCD sync creates the
token on Cloudflare, retrieve and encrypt it in one step:

```sh
mise run lxc:secrets:init    # requires kubectl access to amiya.akn
```

This fetches the token from the `crossplane-secrets` namespace and writes
`secrets/caddy.sops.env` (age-encrypted, committed to git). Plaintext never touches disk.

To rotate: wait for Crossplane to rotate the token (delete the APIToken resource and let
ArgoCD recreate it), then re-run `mise run lxc:secrets:init`.

## Build and deploy

```sh
# Build with Cloudflare token baked in (TLS works on first boot)
mise run lxc:build:with-secrets

# Upload to Proxmox (adjust host and storage as needed)
mise run lxc:push -- pve.lan local

# Build without secrets (Caddy starts but TLS fails until /etc/caddy/secrets is present)
mise run lxc:build
```

## mise tasks

| Task                                        | Description                                                    |
| ------------------------------------------- | -------------------------------------------------------------- |
| `mise run lxc:secrets:init`                 | Fetch Cloudflare token from cluster → `secrets/caddy.sops.env` |
| `mise run lxc:build`                        | Pure build, no secrets baked in                                |
| `mise run lxc:build:with-secrets`           | Full build with token baked in                                 |
| `mise run lxc:push -- <pve-host> [storage]` | Upload template to Proxmox                                     |

## Caddy plugin hash

The `pkgs.caddy.withPlugins` hash in `configuration.nix` must be computed once:

```sh
# In the sandbox (Nix available):
nix build --impure --expr '
  (import <nixpkgs> {}).caddy.withPlugins {
    plugins = ["github.com/caddy-dns/cloudflare@v0.0.0-20240703190432-89f16b99c18e"];
    hash = (import <nixpkgs> {}).lib.fakeHash;
  }
'
# Nix will print the correct hash in the error — update configuration.nix with it.
```

## Updating Zot

Change `version` in `catalog/flakes/chezmoi.sh/zot/flake.nix` and update the
four binary hashes (two platforms × two variants). Run `mise run build` to verify.
