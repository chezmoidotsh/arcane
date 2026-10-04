# Rimbilliton·AKN — Minecraft server

Named after Rim Billiton, the mining city of Arknights — fitting for a block-mining game. Same naming scheme as
`rhodes`, `lungmen`, `kazimierz`, `shodan`.

A single Minecraft server on **OCI Always Free ARM** (1 OCPU / 6 GB), declared as code, managed through
[Crafty Controller](https://craftycontrol.com/) behind **Pocket-Id SSO**, with daily **Backblaze B2** backups.

```text
players ──25565/tcp──▶ ┌──────────────── OCI VM.Standard.A1.Flex (NixOS) ───────────────┐
                       │  Crafty (podman) ── Minecraft server(s)                         │
admins ──443──▶ Caddy ─┼─▶ oauth2-proxy ──(OIDC)──▶ Pocket-Id (group `admin`)            │
                       │        └──▶ Crafty UI (127.0.0.1:8443)                          │
                       │  restic ──daily──▶ Backblaze B2   ·   tailscale (SSH only)      │
                       └──────────────────────────────────────────────────────────────────┘
```

## Layout

| Path                                | Content                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `src/infrastructure/pulumi/`        | OCI (compartment, dedicated VCN `172.16.1.0/26`, NSG, instance), Cloudflare DNS, B2 bucket + scoped key, Tailscale key, Pocket-Id OIDC client |
| `src/infrastructure/nixos/`         | NixOS flake: disko, Tailscale, Crafty (podman), Caddy + oauth2-proxy, restic→B2 |
| `docs/BOOTSTRAP.md`                 | First deployment, step by step                                                 |

## Design decisions

- **Free tier**: the tenancy's A1 quota is 2 OCPU / 12 GB; `kazimierz-pangolin` uses half, this VM the other half.
  Block storage: 50 GB boot here + 100 GB for kazimierz = 150/200 GB. No extra volume — worlds are backed up to B2.
- **NixOS over Ubuntu**: Pulumi creates an Ubuntu bootstrap VM, `nixos-anywhere` replaces it. The instance ignores
  image/metadata changes so a new Ubuntu image never replaces (and wipes) the VM.
- **Admin only through Tailscale**: OCI NSG keeps SSH closed (`unsecure` toggle as in kazimierz); public ports are
  25565, 80, 443.
- **Backups**: Crafty produces consistent archives (scheduled from its UI), restic ships them to B2 daily
  (7 daily / 4 weekly / 6 monthly).

## Limites (à connaître)

- **SSO**: I could not confirm native OIDC support in Crafty Controller, MCSManager or Pelican (searches were
  inconclusive; not tested). The SSO gate is therefore *in front* of the panel (oauth2-proxy + Pocket-Id, `admin` group
  only): being `admin` in Pocket-Id is required to reach the panel, but Crafty still has its own local login behind it.
  If you want one single login, Pelican Panel with an OIDC plugin is the thing to evaluate — heavier (PHP + Docker
  daemon) on 6 GB.
- Crafty image tag is `latest` in `modules/crafty.nix` (`TODO(pin)`), and two values must be filled from Pulumi outputs
  (`clientID`, bucket name). Nothing here has been built or applied: no Nix, no OCI/Pulumi credentials in this session.
- Minecraft Java only (25565/tcp). Bedrock/Geyser would need an extra UDP rule in `network.ts`.
