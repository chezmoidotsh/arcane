# ┌───────────────────────────────────────────────────────────────────────────┐
# │ infinity.nix — local embedding & reranking API (user-level launchd agent) │
# │                                                                           │
# │ Responsibilities:                                                         │
# │   · Creates model cache and tmp dirs under XDG paths                      │
# │   · Configures newsyslog rotation for Infinity logs                       │
# │   · Starts Infinity embedding server as a user launchd agent              │
# │                                                                           │
# │ Models served:                                                            │
# │   · BAAI/bge-m3           — multilingual embedding model                  │
# │   · BAAI/bge-reranker-v2-m3 — multilingual reranker model                 │
# │                                                                           │
# │ Outputs:                                                                  │
# │   · launchd agent  sh.chezmoi.endfield.infinity   → 127.0.0.1:7997        │
# │   · logs           $XDG_STATE_HOME/log/infinity.{stdout,stderr}.log       │
# │   · model cache    $XDG_DATA_HOME/infinity/models/                        │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, pkgs
, username
, xdg
, ...
}:
let
  infinity = import ../packages/infinity { inherit pkgs; };

  # HuggingFace model cache directory (XDG-compliant).
  modelsDir = "${xdg.data}/infinity/models";
in
{
  # Ensure XDG data/tmp directories exist.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.data}/infinity
    install -d -m 0755 -o ${username} -g staff ${modelsDir}
    install -d -m 0755 -o ${username} -g staff ${xdg.tmp}/infinity
    chown -R ${username}:staff ${xdg.data}/infinity
    chown -R ${username}:staff ${xdg.tmp}/infinity
  '';

  # Log rotation for Infinity user-level logs (newsyslog is system-level).
  environment.etc."newsyslog.d/endfield.akn-infinity.conf".text = ''
    ${xdg.log}/infinity.stdout.log 644 7 10000 * J
    ${xdg.log}/infinity.stderr.log 644 7 10000 * J
  '';

  # User-level service (launchd agent) for Infinity embedding server.
  launchd.agents.infinity = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.infinity";
      # Execution
      ProgramArguments = [
        "${infinity.bin}"
        "v2"

        # 1. Models
        "--model-id"  "BAAI/bge-m3"
        "--model-id"  "BAAI/bge-reranker-v2-m3"

        # 2. Device — Apple Silicon Metal Performance Shaders
        "--device"    "mps"

        # 3. Network / Server configuration
        "--port"      "7997"
      ];
      WorkingDirectory = "${xdg.tmp}/infinity";
      # User
      UserName = username;
      # Lifecycle
      RunAtLoad = true;
      KeepAlive = { SuccessfulExit = false; };
      ThrottleInterval = 30;
      # Environment
      EnvironmentVariables = {
        HOME = "/Users/${username}";
        # HuggingFace model cache: stored under XDG_DATA_HOME for persistence.
        HF_HOME = "${modelsDir}";
        TMPDIR = "${xdg.tmp}/infinity";
        PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
      };
      # Logging
      StandardOutPath = "${xdg.log}/infinity.stdout.log";
      StandardErrorPath = "${xdg.log}/infinity.stderr.log";
    };
  };

  # Janitor agent: sweeps short-lived working files from xdg.tmp/infinity every hour.
  launchd.agents.infinity-janitor = {
    serviceConfig = {
      # Identity
      Label = "sh.chezmoi.endfield.infinity-janitor";
      # Execution
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "${pkgs.findutils}/bin/find ${xdg.tmp}/infinity -type f -mmin +60 -print -delete"
      ];
      WorkingDirectory = "${xdg.tmp}/infinity";
      # User
      UserName = username;
      # Lifecycle — runs every hour (3600s)
      RunAtLoad = true;
      StartInterval = 3600;
      ThrottleInterval = 10;
      # Logging
      StandardOutPath = "${xdg.log}/infinity-janitor.stdout.log";
      StandardErrorPath = "${xdg.log}/infinity-janitor.stderr.log";
    };
  };
}
