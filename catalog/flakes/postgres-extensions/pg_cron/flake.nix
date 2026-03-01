{
  description = "DocumentDB PostgreSQL extension for CloudNativePG (image volume extension).";

  inputs.nixpkgs.url = "nixpkgs/nixos-25.11";
  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.flake-utils.inputs.systems.follows = "systems";

  outputs =
    { self
    , nixpkgs
    , flake-utils
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (system: {
      packages =
        let
          pkgs = import nixpkgs { inherit system; };
          postgresql = pkgs.postgresql_18;
          pg_cron = pkgs.postgresql18Packages.pg_cron;
          nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";
        in
        rec {
          # ┌───────────────────────────────────────────────────────────────────────────┐
          # │ <default>: Build the DocumentDB extension image for CNPG.                 │
          # │            Follows CNPG image volume extension layout.                    │
          # │                                                                           │
          # | @sh.chezmoi.app.image: postgres-documentdb-extension                      │
          # | @sh.chezmoi.app.type: extension                                           │
          # └───────────────────────────────────────────────────────────────────────────┘
          default =
            let
              flattenedPgCron = pkgs.runCommand "pg_cron-flat" { } ''
                mkdir -p $out/lib $out/share/extension
                cp -rL ${pg_cron}/lib/*.so $out/lib/
                cp -rL ${pg_cron}/share/postgresql/extension/* $out/share/extension/
              '';

            in
            pkgs.dockerTools.buildImage {
              name = "ghcr.io/chezmoidotsh/flakes/postgres-extensions/pg_cron";
              tag = "${pg_cron.version}-pg${postgresql.version}-${nixversion}-${system}";

              contents = [ flattenedPgCron ];

              # created = builtins.substring 0 8 self.lastModifiedDate;
              config.Labels = {
                "org.opencontainers.image.authors" = "chezmoi.sh Lab <xunleii@users.noreply.github.com>";
                "org.opencontainers.image.description" = "pg_cron PostgreSQL extension for CloudNativePG image volume extensions";
                "org.opencontainers.image.documentation" = "https://github.com/citusdata/pg_cron";
                "org.opencontainers.image.licenses" = "Apache-2.0";
                "org.opencontainers.image.revision" = pg_cron.version;
                "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/postgres-extensions/pg_cron/flake.nix";
                "org.opencontainers.image.title" = "postgres-pg_cron-extension";
                "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
                "org.opencontainers.image.version" = pg_cron.version;

                "sh.chezmoi.catalog.build.engine.type" = "nix";
                "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
                "sh.chezmoi.catalog.category" = "database/extension";
                "sh.chezmoi.catalog.origin.author" = "citusdata <https://github.com/citusdata/pg_cron>";
                "sh.chezmoi.catalog.origin.license" = "Apache-2.0";
                "sh.chezmoi.catalog.origin.repository" = "github.com/citusdata/pg_cron";
              };
            };
        };
    });
}
