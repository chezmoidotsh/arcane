# ─────────────────────────────────────────────────────────────────────────────
# Build-time secrets injection — /etc/omni/secrets
# ─────────────────────────────────────────────────────────────────────────────
# When DEX_ADMIN_PASSWORD_HASH is set at build time (via `mise run lxc:build`,
# which exports it from the SOPS-encrypted secrets/omni.sops.env), it is baked
# into /etc/omni/secrets so Dex authenticates the admin user at first boot
# without any manual post-boot step.
#
# Both the omni and dex units load this file via `environmentFile` (see
# configuration.nix), so a single source of truth covers both.
#
# If the variable is absent (pure build), the file is not created.
# The hash is baked into the Dex config at Nix eval time (builtins.readFile
# in dex.nix) — creating /etc/omni/secrets manually at runtime will NOT
# make Dex accept logins. Rebuild the image with secrets available instead:
#   mise run lxc:build   # exports DEX_ADMIN_PASSWORD_HASH from omni.sops.env
#
# Build arg forwarded from flake.nix via _module.args:
#   dexAdminPasswordHash  — bcrypt hash for the Dex admin user
# ─────────────────────────────────────────────────────────────────────────────
{ lib, dexAdminPasswordHash ? "", ... }:

lib.mkIf (dexAdminPasswordHash != "") {
  environment.etc."omni/secrets" = {
    text = "DEX_ADMIN_PASSWORD_HASH=${dexAdminPasswordHash}\n";
    mode = "0400";
    user = "root";
    group = "root";
  };
}
