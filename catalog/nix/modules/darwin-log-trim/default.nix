# ─────────────────────────────────────────────────────────────────────────────
# darwin-log-trim — size cap for launchd stdout/stderr files (nix-darwin)
# ─────────────────────────────────────────────────────────────────────────────
# launchd writes a daemon's StandardOutPath/StandardErrorPath through a file
# descriptor it opens once (O_APPEND) and never reopens. macOS newsyslog can
# only rename the file and signal a process: the daemon keeps writing to the
# renamed inode, so rotation never frees space without a restart (and the
# macOS newsyslog has no copytruncate). This job does a copy-then-truncate
# instead: above `maxBytes`, the file is copied to <file>.1 (one generation,
# replacing the previous one) and truncated in place; O_APPEND writers simply
# continue at offset 0.
#
# ponytail: lines written between the copy and the truncation are lost (a few
# at most, every 10 minutes at worst); the logs are shipped to VictoriaLogs by
# the o11y-agent anyway. Use a real log pipe (s6-log) if that ever matters.
#
# Used by the o11y-agent and o11y-datastore darwin modules, which append their
# files to `catalog.darwinLogTrim.files`.
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  cfg = config.catalog.darwinLogTrim;

  script = pkgs.writeShellScript "darwin-log-trim" ''
    set -u
    for f in ${lib.escapeShellArgs cfg.files}; do
      [ -f "$f" ] || continue
      size=$(/usr/bin/stat -f %z "$f") || continue
      if [ "$size" -gt ${toString cfg.maxBytes} ]; then
        /bin/cp -p "$f" "$f.1" && : > "$f"
      fi
    done
  '';
in
{
  options.catalog.darwinLogTrim = {
    files = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "launchd log files to keep under maxBytes (copy to <file>.1, then truncate).";
    };
    maxBytes = lib.mkOption {
      type = lib.types.ints.positive;
      default = 64 * 1024 * 1024;
      description = "Size above which a file is copied to <file>.1 and truncated.";
    };
  };

  config = lib.mkIf (cfg.files != [ ]) {
    launchd.daemons.darwin-log-trim.serviceConfig = {
      # launchd loads the daemons before /nix is mounted and gives up on an
      # interval job at the first "Missing executable": wait for the script.
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "until [ -x \"$1\" ]; do /bin/sleep 2; done; exec \"$@\""
        "darwin-log-trim"
        "${script}"
      ];
      StartInterval = 600;
      RunAtLoad = true;
      ProcessType = "Background";
      LowPriorityIO = true;
    };
  };
}
