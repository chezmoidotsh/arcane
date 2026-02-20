{
  description = "Firecrawl API Service - Turn websites into LLM-ready data";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-25.05";
    systems.url = "github:nix-systems/default";
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
    flockenzeit.url = "github:balsoft/Flockenzeit";
  };

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

      firecrawl = import ./firecrawl.nix { inherit self pkgs; };

      version = firecrawl.version;
      nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";

      entrypoint = pkgs.writeScript "docker-entrypoint.sh" ''
        #!${pkgs.runtimeShell}
        set -e

        APP_DIR="''${APP_DIR:-/srv/firecrawl/app}"
        NODE="''${NODE_BIN:-${pkgs.nodejs_22}/bin/node}"

        if [ "$#" -gt 0 ]; then
          exec "$@"
        fi

        if [ -f "$APP_DIR/dist/src/harness.js" ]; then
          exec "$NODE" "$APP_DIR/dist/src/harness.js"
        elif [ -f "$APP_DIR/server.js" ]; then
          exec "$NODE" "$APP_DIR/server.js"
        elif [ -f "$APP_DIR/dist/index.js" ]; then
          exec "$NODE" "$APP_DIR/dist/index.js"
        elif [ -f "$APP_DIR/index.js" ]; then
          exec "$NODE" "$APP_DIR/index.js"
        fi

        echo "No Firecrawl API entrypoint found under $APP_DIR" >&2
        exit 1
      '';
    in
    {
      packages = {
        # ┌───────────────────────────────────────────────────────────────────────────┐
        # │ Individual build artifacts                                                │
        # └───────────────────────────────────────────────────────────────────────────┘
        go-html-to-md = firecrawl.goHtmlToMd;
        firecrawl-app = firecrawl.firecrawlApp;

        # ┌───────────────────────────────────────────────────────────────────────────┐
        # │ <default>: Build the Firecrawl API runtime image.                         │
        # │                                                                           │
        # │ @sh.chezmoi.app.image: firecrawl-api                                      │
        # │ @sh.chezmoi.app.type: helm                                                │
        # └───────────────────────────────────────────────────────────────────────────┘
        default = pkgs.dockerTools.buildLayeredImage {
          name = "firecrawl-api";
          tag = "${version}-${nixversion}-${system}";

          contents = [
            pkgs.busybox
            pkgs.cacert
            pkgs.nodejs_22
            pkgs.tini
            pkgs.git
            pkgs.bash
          ];

          fakeRootCommands = ''
            #!${pkgs.runtimeShell}

            mkdir -p srv/firecrawl/{app,config,logs,run,tmp}
            cp -a ${firecrawl.firecrawlLayer}/* srv/firecrawl/app/
            chown -R 23169:42291 srv/firecrawl
            chmod 755 srv/firecrawl srv/firecrawl/{app,config,logs,run}
            chmod 1777 srv/firecrawl/tmp

            mkdir -p usr/local/bin
            ln -s ${entrypoint} usr/local/bin/docker-entrypoint.sh
          '';
          enableFakechroot = false;

          config = {
            Env = [
              "PATH=/bin:/usr/local/bin:${pkgs.nodejs_22}/bin"
              "TZDIR=${pkgs.tzdata}/share/zoneinfo"
              "NODE_ENV=production"
              "APP_DIR=/srv/firecrawl/app"
              "LD_LIBRARY_PATH=/srv/firecrawl/app/sharedLibs/go-html-to-md"
            ];

            WorkingDir = "/srv/firecrawl/app";

            Cmd = [
              "node" "dist/src/harness.js"
            ];

            Entrypoint = [
              "${pkgs.tini}/bin/tini" "--"
              "/usr/local/bin/docker-entrypoint.sh"
            ];

            ExposedPorts = {
              "8080/tcp" = { };
              "3002/tcp" = { };
              "3004/tcp" = { };
              "3005/tcp" = { };
            };

            User = "23169:42291";

            Labels = {
              "org.opencontainers.image.authors" = "chezmoidotsh lab <xunleii@users.noreply.github.com>";
              "org.opencontainers.image.description" = "Firecrawl API - Turn websites into LLM-ready data.";
              "org.opencontainers.image.documentation" = "https://github.com/mendableai/firecrawl";
              "org.opencontainers.image.licenses" = "AGPL-3.0-or-later";
              "org.opencontainers.image.revision" = self.rev or self.dirtyRev or "dirty";
              "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/firecrawl/firecrawl/flake.nix";
              "org.opencontainers.image.title" = "firecrawl-api";
              "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
              "org.opencontainers.image.version" = version;

              "sh.chezmoi.catalog.build.engine.type" = "nix";
              "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
              "sh.chezmoi.catalog.category" = "app/ai";
              "sh.chezmoi.catalog.origin.author" = "Mendable AI";
              "sh.chezmoi.catalog.origin.license" = "AGPL-3.0-or-later";
              "sh.chezmoi.catalog.origin.repository" = "github.com/mendableai/firecrawl";
            };
          };

          maxLayers = 32;
          created = flockenzeit.lib.ISO-8601 self.lastModified;
        };
      };
    });
}
