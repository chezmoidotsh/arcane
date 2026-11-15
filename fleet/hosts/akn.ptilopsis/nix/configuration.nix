# ─────────────────────────────────────────────────────────────────────────────
# ptilopsis.akn — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Mac Studio (Apple Silicon) run as a headless server. Skeleton only: system
# identity, nix settings and SSH. Server hardening (pmset, pf, sleep) and the
# observability services are added at MIGR-20261115-00 step 2.
# ─────────────────────────────────────────────────────────────────────────────
{ ... }:

{
  system.stateVersion = 6;
  nixpkgs.hostPlatform = "aarch64-darwin";

  networking.hostName = "ptilopsis";
  networking.computerName = "ptilopsis.akn";

  # ── Nix ────────────────────────────────────────────────────────────────────
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # ── Admin user ─────────────────────────────────────────────────────────────
  # Placeholder: replace with the real account name when the Mac is installed.
  system.primaryUser = "admin";
  users.users.admin = {
    name = "admin";
    home = "/Users/admin";
    # SSH public key to add at install time (public key only, never a secret).
    openssh.authorizedKeys.keys = [ ];
  };

  # ── Remote access ──────────────────────────────────────────────────────────
  services.openssh.enable = true;
}
