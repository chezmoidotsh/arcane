{
  description = "Firecrawl Postgres (with pg_cron)";

  # Nixpkgs / NixOS version to use.
  inputs.nixpkgs.url = "nixpkgs/nixos-25.11";

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

      postgresql = pkgs.postgresql_17.withPackages (p: [ p.pg_cron ]);
      version = postgresql.version;
      nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";

      entrypoint = pkgs.writeScript "docker-entrypoint.sh" (builtins.readFile ./docker-entrypoint.sh);
      nuqSql = ./nuq.sql;
    in
    {
      packages = {
        # ┌───────────────────────────────────────────────────────────────────────────┐
        # │ <default>: Build the Firecrawl Postgres image with pg_cron and init SQL.  │
        # │                                                                           │
        # | @sh.chezmoi.app.image: firecrawl-postgres                                 |
        # | @sh.chezmoi.app.type: helm                                                │
        # └───────────────────────────────────────────────────────────────────────────┘
        default = pkgs.dockerTools.buildLayeredImage {
          name = "firecrawl/nuq-postgres";
          tag = "${version}-${nixversion}-${system}";

          contents = [
            pkgs.busybox
            pkgs.bash
            pkgs.shadow # for su
            pkgs.coreutils
            pkgs.postgresql
            pkgs.postgresql17Packages.pg_cron
            pkgs.tini
          ];

          fakeRootCommands = ''
            #!${pkgs.runtimeShell}

            # Create postgres user and group
            mkdir -p etc
            echo "postgres:x:70:70::/var/lib/postgresql:/bin/bash" >> etc/passwd
            echo "postgres:x:70:" >> etc/group

            # Create directories
            mkdir -p var/lib/postgresql/data
            chown -R 70:70 var/lib/postgresql
            chmod 700 var/lib/postgresql/data

            mkdir -p docker-entrypoint-initdb.d
            cp ${nuqSql} docker-entrypoint-initdb.d/nuq.sql
            chmod 644 docker-entrypoint-initdb.d/nuq.sql

            mkdir -p usr/local/bin
            ln -s ${entrypoint} usr/local/bin/docker-entrypoint.sh

            mkdir -p usr/bin
            for f in ${postgresql}/bin/*; do ln -s "$f" usr/bin/$(basename "$f"); done

            mkdir -p tmp
            chmod 1777 tmp
          '';
          enableFakechroot = false;

          config.Env = [
            "PATH=/bin:/usr/bin:${postgresql}/bin"
            "TZDIR=${pkgs.tzdata}/share/zoneinfo"
            "PGDATA=/var/lib/postgresql/data"
          ];

          config.Entrypoint = [
            "${pkgs.tini}/bin/tini" "--"
            "/usr/local/bin/docker-entrypoint.sh"
          ];

          config.ExposedPorts = {
            "5432/tcp" = {};
          };

          maxLayers = 32;
          created = flockenzeit.lib.ISO-8601 self.lastModified;
          config.Labels = {
            "org.opencontainers.image.authors" = "chezmoidotsh lab <xunleii@users.noreply.github.com>";
            "org.opencontainers.image.description" = "PostgreSQL for Firecrawl with pg_cron and init scripts.";
            "org.opencontainers.image.documentation" = "https://github.com/firecrawl/firecrawl";
            "org.opencontainers.image.licenses" = "AGPL-3.0-or-later";
            "org.opencontainers.image.revision" = self.rev or self.dirtyRev or "dirty";
            "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/firecrawl/nuq-postgres/flake.nix";
            "org.opencontainers.image.title" = "firecrawl-postgres";
            "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
            "org.opencontainers.image.version" = version;

            "sh.chezmoi.catalog.build.engine.type" = "nix";
            "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
            "sh.chezmoi.catalog.category" = "datastore/sql";
            "sh.chezmoi.catalog.origin.author" = "Firecrawl";
            "sh.chezmoi.catalog.origin.license" = "AGPL-3.0-or-later";
            "sh.chezmoi.catalog.origin.repository" = "github.com/firecrawl/firecrawl";
          };
          config.User = "0:0";
        };
      };
    });
}
