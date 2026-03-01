{ pkgs ? import <nixpkgs> {} }:

let
  litellmPkg = pkgs.litellm;

  prismaGenerateScript = pkgs.writeScriptBin "litellm-prisma-generate" ''
    #!/usr/bin/env bash
    set -euo pipefail

    XDG_DATA_HOME="${HOME:-/root}/.local/share"
    LITELLM_DATA="${XDG_DATA_HOME}/litellm"
    SCHEMA="${LITELLM_DATA}/schema.prisma"
    LOG="${HOME:-/root}/.local/state/log/litellm.init.log"

    mkdir -p "${LITELLM_DATA}"
    mkdir -p "$(dirname "${LOG}")"
    touch "${LOG}"

    {
      echo "LiteLLM prisma-init: starting at $(date -u)"
      echo "Schema path: ${SCHEMA}"
      if [ -f "${SCHEMA}" ]; then
        echo "Schema found; attempting prisma generate with args: $*"
        if command -v prisma >/dev/null 2>&1; then
          echo "Using prisma CLI at $(command -v prisma)"
          (
            cd "${LITELLM_DATA}"
            prisma generate "$@" >> "${LOG}" 2>&1
          )
          echo "prisma generate completed"
        else
          echo "prisma CLI not available; please install prisma (npm/pnpm/corepack) or add it to PATH" >&2
        fi
      else
        echo "No schema.prisma present; skipping prisma generate"
      fi
      echo "LiteLLM prisma-init: finished at $(date -u)"
    } >> "${LOG}"
  '';

  supervisordConf = ''
    [supervisord]
    nodaemon=true
    loglevel=info
    logfile=/tmp/supervisord.log
    pidfile=/tmp/supervisord.pid

    [group:litellm]
    programs=main,health

    [program:main]
    command=sh -c 'exec python -m litellm.proxy.proxy_cli --host 0.0.0.0 --port=4000 $LITELLM_ARGS'
    autostart=true
    autorestart=true
    startretries=3
    priority=1
    exitcodes=0
    stopasgroup=true
    killasgroup=true
    stopwaitsecs=%(ENV_SUPERVISORD_STOPWAITSECS)s
    stdout_logfile=/dev/stdout
    stderr_logfile=/dev/stderr
    stdout_logfile_maxbytes=0
    stderr_logfile_maxbytes=0
    environment=PYTHONUNBUFFERED=true

    [program:health]
    command=sh -c '[ "$SEPARATE_HEALTH_APP" = "1" ] && exec uvicorn litellm.proxy.health_endpoints.health_app_factory:build_health_app --factory --host 0.0.0.0 --port=${SEPARATE_HEALTH_PORT:-4001} || exit 0'
    autostart=true
    autorestart=true
    startretries=3
    priority=2
    exitcodes=0
    stopasgroup=true
    killasgroup=true
    stopwaitsecs=%(ENV_SUPERVISORD_STOPWAITSECS)s
    stdout_logfile=/dev/stdout
    stderr_logfile=/dev/stderr
    stdout_logfile_maxbytes=0
    stderr_logfile_maxbytes=0
    environment=PYTHONUNBUFFERED=true

    [eventlistener:process_monitor]
    command=python -c "from supervisor import childutils; import os, signal; [os.kill(os.getppid(), signal.SIGTERM) for h,p in iter(lambda: childutils.listener.wait(), None) if h['eventname'] in ['PROCESS_STATE_FATAL', 'PROCESS_STATE_EXITED'] and dict([x.split(':') for x in p.split(' ')])['processname'] in ['main', 'health'] or childutils.listener.ok()]"
    events=PROCESS_STATE_EXITED,PROCESS_STATE_FATAL
    autostart=true
    autorestart=true
  '';

  prodEntrypoint = ''
    #!/usr/bin/env sh
    if [ "$SEPARATE_HEALTH_APP" = "1" ]; then
      export LITELLM_ARGS="$@"
      export SUPERVISORD_STOPWAITSECS="${SUPERVISORD_STOPWAITSECS:-3600}"
      exec supervisord -c /etc/supervisord.conf
    fi

    exec litellm "$@"
  '';
in
{
  inherit prismaGenerateScript;

  supervisorConfig = pkgs.writeText "litellm-supervisord.conf" supervisordConf;

  prodEntrypoint = pkgs.writeText "litellm-prod-entrypoint.sh" prodEntrypoint;

  bin = "${litellmPkg}/bin/litellm";

  meta = with pkgs.lib; {
    description = "Helper scripts and supervisor config for LiteLLM inspired by the upstream Docker deployment";
    maintainers = with maintainers; [ chezmoi ];
    platforms = platforms.darwin;
  };
}
