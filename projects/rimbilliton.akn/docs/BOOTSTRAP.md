# Bootstrap rimbilliton.akn

Prerequisites: `mise install`, OCI creds as `TF_VAR_*` (see `kazimierz.akn`), `POCKET_ID_API_KEY`, B2 + Cloudflare +
Tailscale credentials for the providers, `tag:minecraft` declared in the tailnet ACL, `nix` + `sops` + `ssh-to-age`.

1. **Infra**
   ```sh
   cd projects/rimbilliton.akn/src/infrastructure/pulumi
   pnpm install
   pulumi stack init rimbilliton_akn.live   # then the `pulumi config set` list from .mise.toml
   mise run pulumi:diff && mise run pulumi:apply
   ```
   If OCI answers `Out of host capacity`, retry later (known Always Free A1 issue).
2. **Host key + secrets** (so sops-nix can decrypt on first boot)
   ```sh
   cd ../nixos
   mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
   ssh-to-age < extra/etc/ssh/ssh_host_ed25519_key.pub     # -> host age key in .sops.yaml
   cp secrets/rimbilliton.example.yaml secrets/rimbilliton.sops.yaml  # fill from `pulumi stack output --show-secrets`
   sops --encrypt --in-place secrets/rimbilliton.sops.yaml
   ```
   Also set `clientID` (sso.nix), `bucket` (backup.nix) and your SSH public key (configuration.nix). Do not commit `extra/`.
3. **Install NixOS over the Ubuntu bootstrap VM**
   ```sh
   nix run github:nix-community/nixos-anywhere -- --flake .#rimbilliton \
     --extra-files extra --target-host ubuntu@$(pulumi -C ../pulumi stack output publicIp)
   ```
   SSH is closed in the NSG: temporarily `pulumi config set unsecure true && pulumi up` for this step, then set it back.
   Later deploys go through Tailscale: `nixos-rebuild switch --flake .#rimbilliton --target-host root@rimbilliton`.
4. **Crafty**: open `https://mc-admin.chezmoi.sh` (Pocket-Id login), get the initial Crafty password from
   `podman logs crafty` / `/var/lib/crafty/config/default-creds.txt`, create a Paper server on port 25565, set `-Xmx4G`,
   and schedule a backup every 6 h.
5. **Verify backups**: `systemctl start restic-backups-minecraft` then `restic snapshots` against the B2 repo.
