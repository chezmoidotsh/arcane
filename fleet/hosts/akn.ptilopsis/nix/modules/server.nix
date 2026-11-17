# ─────────────────────────────────────────────────────────────────────────────
# Server settings — a headless Mac that never sleeps, never updates itself and
# runs nothing a desktop would
# ─────────────────────────────────────────────────────────────────────────────
{ config, ... }:

let
  user = config.system.primaryUser;

  # Apple background services a headless server never needs (user domain).
  # `launchctl disable` survives reboots and is not blocked by SIP.
  unneededAgents = [
    "com.apple.photoanalysisd" # Photos face/scene analysis
    "com.apple.mediaanalysisd" # media analysis (Visual Look Up, …)
    "com.apple.suggestd" # Siri / Spotlight suggestions
    "com.apple.ReportCrash" # crash reports sent to Apple
  ];
in
{
  # ── Never sleep, come back after a power cut ──────────────────────────────
  power.sleep.computer = "never";
  power.sleep.display = 1; # no screen: off as soon as possible
  power.sleep.harddisk = "never";
  power.sleep.allowSleepByPowerButton = false;
  power.restartAfterPowerFailure = true;
  power.restartAfterFreeze = true;
  # nix-darwin applies the options above with `systemsetup`, whose errors it
  # discards (some are unsupported on Apple Silicon). pmset is the source of
  # truth: set the same values there, plus no Power Nap (dark wakes).
  # Wake-on-LAN (womp) is not needed: the machine never sleeps.
  system.activationScripts.postActivation.text = ''
    /usr/bin/pmset -a sleep 0 disksleep 0 displaysleep 1 autorestart 1 powernap 0

    # ── Headless: RAM, CPU and energy ──
    # No Spotlight indexing (the biggest RAM and I/O saver; the datastore
    # volume must never be indexed).
    /usr/bin/mdutil -a -i off >/dev/null || true
    # No screen saver (per-host preference, so not in system.defaults).
    /usr/bin/sudo -u ${user} /usr/bin/defaults -currentHost write com.apple.screensaver idleTime 0
    # No Handoff, no AirPlay Receiver (per-host preferences).
    /usr/bin/sudo -u ${user} /usr/bin/defaults -currentHost write com.apple.coreservices.useractivityd ActivityAdvertisingAllowed -bool false
    /usr/bin/sudo -u ${user} /usr/bin/defaults -currentHost write com.apple.coreservices.useractivityd ActivityReceivingAllowed -bool false
    /usr/bin/sudo -u ${user} /usr/bin/defaults -currentHost write com.apple.controlcenter AirplayRecieverEnabled -bool false
    # Bluetooth off (read at boot). Wi-Fi stays on on purpose.
    /usr/bin/defaults write /Library/Preferences/com.apple.Bluetooth ControllerPowerState -int 0
    # Background services (see unneededAgents).
    ${builtins.concatStringsSep "\n    " (map (a: ''/bin/launchctl disable "user/$(/usr/bin/id -u ${user})/${a}"'') unneededAgents)}
  '';

  system.defaults.CustomUserPreferences = {
    "com.apple.NetworkBrowser".DisableAirDrop = true;
    "com.apple.universalcontrol".Disable = true;
    "com.apple.assistant.support"."Assistant Enabled" = false; # Siri
    "com.apple.Siri".StatusMenuVisible = false;
    "com.apple.lookup.shared".LookupSuggestionsDisabled = true;
    "com.apple.gamed".Disabled = true; # Game Center
    "com.apple.WindowManager" = { StandardHideWidgets = true; StageManagerHideWidgets = true; };
  };

  # ── macOS updates: never automatic (they reboot the machine) ──────────────
  system.defaults.SoftwareUpdate.AutomaticallyInstallMacOSUpdates = false;
  system.defaults.CustomSystemPreferences = {
    "/Library/Preferences/com.apple.SoftwareUpdate" = {
      AutomaticCheckEnabled = true; # check and notify only
      AutomaticDownload = false;
      CriticalUpdateInstall = false; # Rapid Security Responses can reboot
      ConfigDataInstall = true; # XProtect/Gatekeeper data: no reboot
    };
    "/Library/Preferences/com.apple.commerce".AutoUpdate = false;
    # No diagnostics or analytics sent to Apple or third parties.
    "/Library/Application Support/CrashReporter/DiagnosticMessagesHistory" = {
      AutoSubmit = false;
      ThirdPartyDataSubmit = false;
    };
  };

  # ── Firewall ──────────────────────────────────────────────────────────────
  # The pf anchor of the observability stack restricts 443/4318 by source; the
  # application firewall cannot. It would also block the Caddy binary (ad-hoc
  # signed, from the Nix store), so it stays off.
  networking.applicationFirewall.enable = false;

  # ── Remote access ─────────────────────────────────────────────────────────
  # None: the Mac is only reachable through Screen Sharing, SSH (Remote Login)
  # stays off. The sops-nix key (/etc/ssh/ssh_host_ed25519_key) is generated at
  # install time with `ssh-keygen -A`, which does not enable sshd (see README).
}
