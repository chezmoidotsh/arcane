# ─────────────────────────────────────────────────────────────────────────────
# ptilopsis.akn — site configuration
# ─────────────────────────────────────────────────────────────────────────────
# Mac Studio (Apple Silicon) run as a headless server. This file holds what is
# specific to the machine: its identity, the values the stack is sized with and
# the host agent's settings. How it all works is in ./modules:
#
#   modules/server.nix          sleep, power, macOS updates, firewall, no SSH
#   modules/secrets.nix         sops-nix and the secrets' owners
#   modules/o11y-datastore/     the observability stack (launchd daemons)
# ─────────────────────────────────────────────────────────────────────────────
{ ... }:

{
  imports = [ ./modules/server.nix ./modules/secrets.nix ./modules/o11y-datastore ];

  system.stateVersion = 6;
  nixpkgs.hostPlatform = "aarch64-darwin";

  # otelcol-contrib 0.155.0 does not build with Go 1.27 (github.com/cockroachdb/swiss
  # links into runtime internals that changed): build the collectors with Go 1.26
  # until nixpkgs-unstable fixes it.
  nixpkgs.overlays = [
    (final: prev: {
      opentelemetry-collector-releases = prev.opentelemetry-collector-releases.override {
        buildGoModule = final.buildGo126Module;
        go = final.go_1_26;
      };
    })
  ];

  networking.hostName = "ptilopsis";
  networking.computerName = "ptilopsis.akn";

  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # The macOS admin account must be created with this short name during setup.
  system.primaryUser = "ptilopsis";
  users.users.ptilopsis = {
    name = "ptilopsis";
    home = "/Users/ptilopsis";
  };

  # ── Observability stack (ADR-022) ──────────────────────────────────────────
  services.o11yDatastore = {
    # A dedicated APFS volume with a 250 GB quota (a limit, not a reservation),
    # created at install time on the right disk, never the system one.
    dataDir = "/var/lib/o11y-datastore";
    # `diskutil info -plist <volume> | plutil -extract VolumeUUID raw -`. A daemon
    # mounts it: macOS 27.2.1 unmounts it a minute after boot, fstab or not.
    volumeUuid = "FC8AB851-5DC1-4F8B-80D2-A2CED576DAD2";
    retention = { metrics = "18M"; logs = "30d"; traces = "2d"; }; # <n>d, <n>w or <n>M
    allowedSources = [ "10.0.0.0/22" ]; # the homelab LAN
    readOnlySources = [ "192.168.10.0/25" ]; # the Home VLAN: queries only
  };

  # ── Host agent ─────────────────────────────────────────────────────────────
  # Pushes to the stack's public name, data.o11y.chezmoi.sh.
  catalog.o11yAgent = {
    enable = true;
    o11y.endpoint = "https://data.o11y.chezmoi.sh:4318";
    metrics.enable = true;

    # macOS noise of a headless Mac Studio: ~360 000 errors in 6 hours, 99% of what
    # this host shipped. Most of it comes from services of features this machine
    # does not use (and that server.nix turns off) but whose daemons still run. A
    # bare process drops everything it logs; with a message, a real error from the
    # same process still gets through. Left visible on purpose: the rest of the
    # kernel, launchd, mDNSResponder, backupd (Time Machine), locationd, powerd
    # and the Shortcuts runner.
    logs.unifiedLog.ignore = [
      # Bluetooth is off (server.nix)
      { process = "bluetoothd"; }
      { process = "audioaccessoryd"; }
      { process = "SiriPreferenceExtension"; }
      { process = "PerfPowerServices"; }
      # Biome: the on-device event store behind Siri and suggestions
      { process = "biomed"; }
      { process = "biomesyncd"; }
      { process = "BiomeAgent"; }
      { process = "duetexpertd"; }
      { process = "SetStoreUpdateService"; }
      { process = "SiriLogProcessor"; }
      { process = "GMSSELFIngestor"; }
      { process = "BiomeSELFIngestor"; }
      { process = "IFTelemetrySELFIngestor"; }
      { process = "IFTranscriptSELFIngestor"; }
      # Apple Intelligence, Siri, media analysis, Spotlight knowledge, Siri search
      { process = "intelligenceflowd"; }
      { process = "IntelligencePlatformComputeService"; }
      { process = "textunderstandingd"; }
      { process = "assistantd"; }
      { process = "SiriUploadWorker"; }
      { process = "mediaanalysisd"; }
      { process = "mediaanalysisd-access"; }
      { process = "spotlightknowledged.updater"; }
      { process = "parsecd"; }
      { process = "parsec-fbf"; }
      # Find My
      { process = "searchpartyd"; }
      { process = "searchpartyuseragent"; }
      { process = "findmydevice-user-agent"; }
      { process = "locationd"; message = "onAvengerAdvertisementDetected"; }
      # AirDrop, Handoff, AirPlay receiver, nearby devices (off in server.nix)
      { process = "sharingd"; }
      { process = "kernel"; message = "Sandbox: sharingd"; }
      { process = "kernel"; message = "for Sandbox: sharingd"; }
      { process = "rapportd"; }
      { process = "WiFiAgent"; message = "nearbysync"; }
      # iCloud (no account signed in: cloudd logs "Could not create primary backing account")
      { process = "cloudd"; }
      { process = "itunescloudd"; }
      { process = "UsageTrackingAgent"; }
      { process = "com.apple.iCloudHelper"; }
      # Widgets, Weather, Safari
      { process = "WeatherWidget"; }
      { process = "chronod"; }
      { process = "SafariBookmarksSyncAgent"; }
      { process = "com.apple.Safari.History"; }
      # Spotlight indexing, Siri context, Wi-Fi peer-to-peer, ambient display
      { process = "corespotlightd"; }
      { process = "contextstored"; }
      { process = "ContextStoreAgent"; }
      { process = "wifip2pd"; }
      { process = "com.apple.AmbientDisplayAgent"; }
      { process = "ReportMemoryException"; }
      # no Touch ID, no iCloud account, no Wi-Fi analytics consumer
      { process = "biometrickitd"; }
      { process = "wifianalyticsd"; }
      { process = "iCloudNotificationAgent"; }
      { process = "syncdefaultsd"; }
      { process = "nsurlsessiond"; message = "Failed to convert from bundle ID (com.apple.bird)"; }
      { process = "nsurlsessiond"; message = "nw_connection_copy_protocol_metadata"; }
      # harmless errors of services that stay useful: only the message is dropped
      { process = "coreservicesd"; message = "asked for zero entry ref"; }
      { process = "syspolicyd"; message = "Unable to get organizational unit from certificate"; }
      { process = "pkd"; message = "could not fetch persona generation ID"; }
      { process = "identityservicesd"; message = "Failure computing hash of message for replay key"; }
      { process = "loginwindow"; message = "Failed to set up CFPasteboardRef"; }
      { process = "loginwindow"; message = "Ignoring _setTargetUserIdentifier"; }
      { process = "WindowServer"; message = "ignoring menu bars from app"; }
      { process = "tccd"; message = "one instance of XPC forwardMessage"; }
      # Apple telemetry and experimentation
      { process = "analyticsagent"; }
      { process = "triald_system"; }
      { process = "UnilogConfigXPCService"; }
      { message = "TaskFolder missing"; }
      # no audio hardware
      { process = "ControlCenter"; message = "Could not find default device"; }
      { process = "coreaudiod"; message = "No USB devices found"; }
      { process = "coreaudiod"; message = "exceeds rate-limit threshold"; }
      # no battery, no display
      { process = "dasd"; }
      { process = "kernel"; message = "Sandbox: dasd"; }
      { process = "kernel"; message = "Sandbox: intelligenceflowd"; }
      { process = "kernel"; message = "Sandbox: analyticsagent"; }
      { process = "kernel"; message = "for Sandbox: analyticsagent"; }
      { process = "apsd"; message = "Received incoming push notification for topic"; }
      # system plumbing that logs the same harmless error all day
      { process = "cfprefsd"; message = "due to No such file or directory"; }
      { process = "cfprefsd"; message = "rejecting write of key"; }
      { process = "runningboardd"; message = "MEMORYSTATUS_CMD_CONVERT_MEMLIMIT_MB"; }
      { process = "runningboardd"; message = "Kernel call to get coalition roles"; }
      { process = "runningboardd"; message = "RBLogAddStateCaptureBlockWithTitle"; }
      { process = "runningboardd"; message = "RBSStateCapture remove item called for untracked item"; }
      { process = "runningboardd"; message = "Two equal instances have unequal identities"; }
      { process = "airportd"; message = "Unhandled request type"; }
      { process = "symptomsd"; message = "Failed to post Wi-Fi loaded LQM event"; }
      { process = "apsd"; message = "lacks APSConnectionInitiateEntitlement"; }
      { process = "PerfPowerTelemetryClientRegistrationService"; }
      { process = "deleted"; }
      { process = "spindump"; message = "missing microstackshots"; }
      { process = "secinitd"; message = "Unable to obtain persona info"; }
      { process = "mobileassetd"; message = "removeDownloadsNotRecentlyInFlight"; }
      { process = "systemstats"; message = "assertion failed"; }
      { process = "kernel"; message = "necp_client_add_flow"; }
      { process = "kernel"; message = "netagent_client_message"; }
    ];
  };
}
