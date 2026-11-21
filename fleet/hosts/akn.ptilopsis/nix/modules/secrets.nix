# ─────────────────────────────────────────────────────────────────────────────
# Secrets — sops-nix, decrypted at activation into /run/secrets/
# ─────────────────────────────────────────────────────────────────────────────
# Two files, both encrypted for the admin key and for this host's SSH host key
# (.sops.yaml): o11y.sops.yaml (by hand) and cloudflare.sops.json (written by
# pulumi/). A secret whose file does not exist is left out, and every evaluation
# says so (no TLS token, no Slack, no heartbeat).
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, ... }:

let
  o11y = ../secrets/o11y.sops.yaml;
  cloudflare = ../secrets/cloudflare.sops.json;

  secrets = {
    "cloudflare-api-token" = { owner = "_caddy"; sopsFile = cloudflare; format = "json"; };
    "slack-webhook-url" = { owner = "_o11y"; sopsFile = o11y; };
    "alertmanager-deadman-url" = { owner = "_o11y"; sopsFile = o11y; };
  };
  present = lib.filterAttrs (_: s: builtins.pathExists s.sopsFile) secrets;
in
{
  # The runtime path of a secret, or null while its file does not exist.
  _module.args.secretPath = name: if present ? ${name} then config.sops.secrets.${name}.path else null;

  warnings = lib.mapAttrsToList
    (name: s: "ptilopsis: ${baseNameOf s.sopsFile} is missing, so the secret ${name} is unavailable (see README).")
    (removeAttrs secrets (lib.attrNames present));

  sops = lib.mkIf (present != { }) {
    age.sshKeyPaths = [ "/etc/ssh/ssh_host_ed25519_key" ];
    secrets = present;
  };
}
