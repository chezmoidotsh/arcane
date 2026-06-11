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
# The operator must then create it manually on the live system:
#
#   printf 'DEX_ADMIN_PASSWORD_HASH=%s\n' \
#     "$(htpasswd -bnBC 12 "" '<pw>' | tr -d ':\n')" \
#     > /etc/omni/secrets
#   chmod 0400 /etc/omni/secrets
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
