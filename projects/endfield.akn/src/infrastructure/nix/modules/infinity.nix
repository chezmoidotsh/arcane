# ┌───────────────────────────────────────────────────────────────────────────┐
# │ infinity.nix — local embedding & reranking API (user-level launchd agent) │
# │                                                                           │
# │ Strategy: uv-managed venv (see packages/infinity/default.nix for details) │
# │   Nix provides : uv, python3.12, the launcher script                     │
# │   uv manages   : infinity-emb and all its Python dependencies             │
# │   Venv lives at: $XDG_DATA_HOME/infinity/venv  (persistent, mutable)     │
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
# │   · venv           $XDG_DATA_HOME/infinity/venv/                          │
# └───────────────────────────────────────────────────────────────────────────┘
{ lib
, pkgs
, username
, xdg
, ...
}:
let
  # The launcher package: bootstraps the uv venv and execs infinity_emb.
  # See packages/infinity/default.nix for the full rationale on why we use
  # a uv venv instead of a pure Nix derivation.
  infinity = import ../packages/infinity { inherit pkgs; };

  # HuggingFace model cache directory (XDG-compliant).
  modelsDir = "${xdg.data}/infinity/models";

  # Persistent Python venv managed by uv (not in /nix/store — intentionally mutable).
  venvDir = "${xdg.data}/infinity/venv";
in
{
  # Ensure XDG data/tmp directories exist.
  system.activationScripts.extraActivation.text = lib.mkAfter ''
    install -d -m 0755 -o ${username} -g staff ${xdg.data}/infinity
    install -d -m 0755 -o ${username} -g staff ${modelsDir}
    install -d -m 0755 -o ${username} -g staff ${venvDir}
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
      # Execution — the launcher bootstraps the venv (uv) then exec's infinity_emb
      ProgramArguments = [
        "${infinity}/bin/infinity-launcher"
        "v2"

        # 1. Models
        "--model-id"
        "BAAI/bge-m3"
        "--model-id"
        "BAAI/bge-reranker-v2-m3"

        # 2. Device — Apple Silicon Metal Performance Shaders
        "--device"
        "mps"

        # 3. Network / Server configuration
        "--port"
        "7997"
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
        # Tell the launcher where to create/find the venv.
        INFINITY_VENV = "${venvDir}";
        # HuggingFace model cache: stored under XDG_DATA_HOME for persistence.
        HF_HOME = "${modelsDir}";
        TMPDIR = "${xdg.tmp}/infinity";
        # uv cache: kept in XDG_CACHE_HOME to avoid polluting HOME.
        UV_CACHE_DIR = "${xdg.cache}/uv";
        # PATH: uv and python3.12 from Nix store, then standard system paths.
        PATH = "${pkgs.uv}/bin:${pkgs.python312}/bin:/usr/bin:/bin:/usr/sbin:/sbin";
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
