# ─────────────────────────────────────────────────────────────────────────────
# omni-infra-provider-proxmox — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Supplies site-specific values: system identity, locale, and the provider
# options. Module logic lives in:
#   catalog/nix/siderolabs/omni/infra-provider-proxmox.nix  — service + binary
#   modules/hardening.nix  — sysctl, firewall, login surface, journald
#   modules/secrets.nix    — writes /etc/infra-provider/secrets at build time
#
# No persistent volume is needed — the provider is stateless (all cluster
# state lives in Omni). The LXC uses only its root disk.
#
# First-boot checklist:
#   1. Confirm provider is running:  systemctl status omni-infra-provider-proxmox
#   2. Check logs:                   journalctl -u omni-infra-provider-proxmox -f
#   3. If phase 2 not done yet:      register in Omni UI then rebuild with key
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, lib, ... }:

{
  system.stateVersion = "26.05";
  networking.hostName = "omni-infra-provider-proxmox";

  time.timeZone = "Etc/UTC";
  i18n.defaultLocale = "C.UTF-8";

  # ── Console shell (pct enter) ────────────────────────────────────────────
  users.users.root.shell = pkgs.bashInteractive;
  programs.bash.shellInit = ''
    if [ -z "''${__NIXOS_SET_ENVIRONMENT_DONE-}" ]; then
      . /etc/set-environment
    fi
  '';

  # `pct exec` (lxc-attach) runs the command directly with PATH set to
  # /sbin:/bin:/usr/sbin:/usr/bin — no shell is involved, so shellInit
  # above never executes and the NixOS binaries are unreachable.
  # /usr/sbin is unused by NixOS: pointing it at the system profile makes
  # `pct exec <vmid> -- journalctl …` work without absolute paths.
  systemd.tmpfiles.rules = [
    "L+ /usr/sbin - - - - /run/current-system/sw/bin"
  ];

  # ── Console toolbox ──────────────────────────────────────────────────────
  environment.systemPackages = with pkgs; [ curl jq ];

  # ── Omni Infrastructure Provider for Proxmox ────────────────────────────
  services.omniInfraProviderProxmox = {
    enable = true;

    # Must match the provider ID registered in Omni UI
    # (Settings → Infrastructure Providers → the "id" field).
    id = "pve.chezmoi.sh";

    # Omni instance this provider registers with.
    omniApiEndpoint = "https://omni.chezmoi.sh/";

    proxmox = {
      url = "https://pve-01.pve.chezmoi.sh:8006/api2/json";
      # Pass username without realm suffix — realm is sent separately.
      # username=omni@pve&realm=pve → auth failure (double realm);
      # username=omni&realm=pve → success.
      username = "omni";
      realm = "pve";

      # Proxmox API TLS cert is self-signed — skip verification.
      insecureSkipVerify = true;
    };
  };
}
