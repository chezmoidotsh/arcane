# ─────────────────────────────────────────────────────────────────────────────
# Build-time secrets injection — /etc/infra-provider/secrets
# ─────────────────────────────────────────────────────────────────────────────
# When PROXMOX_PASSWORD and/or OMNI_SERVICE_ACCOUNT_KEY are set at build time
# (via `mise run lxc:build`, which decrypts the SOPS-encrypted secrets files),
# they are written to /etc/infra-provider/secrets so the provider service can
# load them at runtime via EnvironmentFile.
#
# PROXMOX_PASSWORD is also baked directly into the Proxmox YAML config by the
# catalog module (infra-provider-proxmox.nix) — both paths cover the same
# value for consistency.
#
# If either variable is absent (pure build), the file is not created (or is
# partial). The service starts but cannot authenticate — run lxc:secrets:*
# then rebuild to complete the setup.
#
# Manual post-deploy override (emergency):
#   printf 'PROXMOX_PASSWORD=%s\nOMNI_SERVICE_ACCOUNT_KEY=%s\n' '<pw>' '<key>' \
#     > /etc/infra-provider/secrets
#   chmod 0400 /etc/infra-provider/secrets
#   systemctl restart omni-infra-provider-proxmox
#
# Build args forwarded from flake.nix via _module.args:
#   proxmoxPassword       — Proxmox API password  (proxmox.sops.env)
#   omniServiceAccountKey — Omni infra provider key (omni.sops.env)
# ─────────────────────────────────────────────────────────────────────────────
{ lib, proxmoxPassword ? "", omniServiceAccountKey ? "", ... }:

let
  hasSecrets = proxmoxPassword != "" || omniServiceAccountKey != "";
  content = lib.concatStrings [
    (lib.optionalString (proxmoxPassword != "") "PROXMOX_PASSWORD=${proxmoxPassword}\n")
    (lib.optionalString (omniServiceAccountKey != "") "OMNI_SERVICE_ACCOUNT_KEY=${omniServiceAccountKey}\n")
  ];
in
lib.mkIf hasSecrets {
  environment.etc."infra-provider/secrets" = {
    text = content;
    mode = "0400";
    user = "infra-provider";
    group = "infra-provider";
  };
}
