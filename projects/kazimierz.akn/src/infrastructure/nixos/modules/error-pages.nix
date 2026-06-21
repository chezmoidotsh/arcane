# ─────────────────────────────────────────────────────────────────────────────
# Custom error-pages service — kazimierz.akn
# ─────────────────────────────────────────────────────────────────────────────
# Serves branded HTTP error pages for 4xx/5xx responses.  Traefik's
# error-pages middleware forwards unmatched/error status codes here via
# http://127.0.0.1:8080/{status}.html.
#
# tarampampam/error-pages is NOT in nixpkgs; built from source as a Go module.
# v4 has no external Go dependencies (go.sum is empty → vendorHash = null).
#
# Bump: edit `version`, then refresh `src.hash` with
#   nix-prefetch-url --unpack \
#     https://github.com/tarampampam/error-pages/archive/refs/tags/v<version>.tar.gz
# (then `nix hash convert --to sri --hash-algo sha256 <base32>`).
# ─────────────────────────────────────────────────────────────────────────────
{ pkgs, lib, config, ... }:

let
  cfg = config.services.error-pages;

  error-pages = pkgs.buildGoModule rec {
    pname = "error-pages";
    version = "4.2.2";

    src = pkgs.fetchFromGitHub {
      owner = "tarampampam";
      repo = "error-pages";
      rev = "v${version}";
      hash = "sha256-08PwlzE4sYUZuIBPTYN9HTaD1h7RiQTSZvoDHWYqpj0=";
    };

    vendorHash = null; # v4 has no external Go deps (go.sum is empty)

    env.CGO_ENABLED = "0"; # static binary; passed via env to avoid the
    # buildGoModule "overlapping derivation args" assertion on recent nixpkgs.
  };
in
{
  options.services.error-pages = {
    templateName = lib.mkOption {
      type = lib.types.enum [
        "app-down"
        "cats"
        "connection"
        "ghost"
        "hacker-terminal"
        "l7"
        "lost-in-space"
        "orient"
        "noise"
        "shuffle"
        "win95"
      ];
      default = "app-down";
      description = "error-pages template to serve (tarampampam/error-pages v4)";
    };
  };

  config.systemd.services.error-pages = {
    description = "HTTP error pages (serves 4xx/5xx templates to Traefik)";
    wantedBy = [ "multi-user.target" ];
    after = [ "network.target" ];

    serviceConfig = {
      ExecStart = "${error-pages}/bin/error-pages --template-name ${cfg.templateName} --addr 127.0.0.1 --port 8080";
      DynamicUser = true;
      Restart = "on-failure";
      RestartSec = "5s";
    };
  };
}
