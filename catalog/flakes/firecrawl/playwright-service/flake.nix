{
  description = "Firecrawl Playwright Service";

  # Nixpkgs / NixOS version to use.
  inputs.nixpkgs.url = "nixpkgs/nixos-25.05";

  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.flake-utils.inputs.systems.follows = "systems";

  inputs.flockenzeit.url = "github:balsoft/Flockenzeit";

  outputs =
    { self
    , nixpkgs
    , flake-utils
    , flockenzeit
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = import nixpkgs { inherit system; };

      # Upstream source (pin the hash before publishing).
      src = pkgs.fetchFromGitHub {
        owner = "firecrawl";
        repo = "firecrawl";
        rev = "main";
        hash = pkgs.lib.fakeSha256; # TODO: update with the real hash
      };

      version = src.rev;
      nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";

      entrypoint = pkgs.writeScript "docker-entrypoint.sh" ''
        #!${pkgs.runtimeShell}
        set -e

        APP_DIR="''${APP_DIR:-/srv/playwright-service/app}"
        NODE="''${NODE_BIN:-${pkgs.nodejs_22}/bin/node}"

        # If a command is provided, run it.
        if [ "$#" -gt 0 ]; then
          exec "$@"
        fi

        if [ -f "$APP_DIR/server.js" ]; then
          exec "$NODE" "$APP_DIR/server.js"
        elif [ -f "$APP_DIR/dist/index.js" ]; then
          exec "$NODE" "$APP_DIR/dist/index.js"
        elif [ -f "$APP_DIR/index.js" ]; then
          exec "$NODE" "$APP_DIR/index.js"
        fi

        echo "No Playwright service entrypoint found under $APP_DIR (server.js, dist/index.js, index.js)." >&2
        exit 1
      '';
    in
    {
      packages = {
        # ┌───────────────────────────────────────────────────────────────────────────┐
        # │ <default>: Build the Firecrawl Playwright service runtime image.          │
        # │                                                                           │
        # | @sh.chezmoi.app.image: firecrawl-playwright-service                       |
        # | @sh.chezmoi.app.type: helm                                                │
        # └───────────────────────────────────────────────────────────────────────────┘
        default = pkgs.dockerTools.buildLayeredImage {
          name = "firecrawl-playwright-service";
          tag = "${version}-${nixversion}-${system}";

          # Runtime dependencies only; application code should be provided externally.
          contents = [
            pkgs.busybox
            pkgs.cacert
            pkgs.nodejs_22
            pkgs.playwright-driver.browsers
            pkgs.tini
            pkgs.coreutils
          ];

          fakeRootCommands = ''
            #!${pkgs.runtimeShell}

            # Create runtime directories (non-root uid/gid 23169:42291 for consistency with catalog images).
            mkdir -p srv/playwright-service/{app,config,logs,run,tmp}
            chown -R 23169:42291 srv/playwright-service
            chmod 755 srv/playwright-service srv/playwright-service/{app,config,logs,run}
            chmod 1777 srv/playwright-service/tmp

            mkdir -p usr/local/bin
            ln -s ${entrypoint} usr/local/bin/docker-entrypoint.sh
          '';
          enableFakechroot = false;

          config.Env = [
            "PATH=/bin:/usr/local/bin"
            "TZDIR=${pkgs.tzdata}/share/zoneinfo"
            "APP_DIR=/srv/playwright-service/app"
            "PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}"
          ];

          config.WorkingDir = "/srv/playwright-service/app";

          # Expect the app to be mounted or baked in separately; tini keeps proper signal handling.
          config.Entrypoint = [
            "${pkgs.tini}/bin/tini" "--"
            "/usr/local/bin/docker-entrypoint.sh"
          ];

          config.ExposedPorts = {
            "3000/tcp" = {};
          };

          maxLayers = 32;

          created = flockenzeit.lib.ISO-8601 self.lastModified;
          config.Labels = {
            "org.opencontainers.image.authors" = "chezmoidotsh lab <xunleii@users.noreply.github.com>";
            "org.opencontainers.image.description" = "Firecrawl Playwright service runtime image (Node.js + Playwright browsers).";
            "org.opencontainers.image.documentation" = "https://github.com/firecrawl/firecrawl";
            "org.opencontainers.image.licenses" = "AGPL-3.0-or-later";
            "org.opencontainers.image.revision" = self.rev or self.dirtyRev or "dirty";
            "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/firecrawl/playwright-service/flake.nix";
            "org.opencontainers.image.title" = "firecrawl-playwright-service";
            "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
            "org.opencontainers.image.version" = version;

            "sh.chezmoi.catalog.build.engine.type" = "nix";
            "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
            "sh.chezmoi.catalog.category" = "app/browser";
            "sh.chezmoi.catalog.origin.author" = "Firecrawl";
            "sh.chezmoi.catalog.origin.license" = "AGPL-3.0-or-later";
            "sh.chezmoi.catalog.origin.repository" = "github.com/firecrawl/firecrawl";
          };
          config.User = "23169:42291";
        };
      };
    });
}
