{
  description = "DocumentDB PostgreSQL extension for CloudNativePG (image volume extension).";

  inputs.nixpkgs.url = "nixpkgs/nixos-25.11";
  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.flake-utils.inputs.systems.follows = "systems";

  inputs.documentdb-src = {
    url = "github:documentdb/documentdb/v0.109-0";
    flake = false;
  };

  outputs =
    { self
    , nixpkgs
    , flake-utils
    , documentdb-src
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (system: {
      packages =
        let
          pkgs = import nixpkgs { inherit system; };
          postgresql = pkgs.postgresql_18;
          nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";

          documentdb = import ./documentdb-ext.nix {
            inherit self pkgs postgresql documentdb-src;
          };
        in
        rec {
          inherit documentdb;

          # ┌───────────────────────────────────────────────────────────────────────────┐
          # │ <default>: Build the DocumentDB extension image for CNPG.                 │
          # │            Follows CNPG image volume extension layout.                    │
          # │                                                                           │
          # | @sh.chezmoi.app.image: postgres-documentdb-extension                      │
          # | @sh.chezmoi.app.type: extension                                           │
          # └───────────────────────────────────────────────────────────────────────────┘
          default = let 
            flattenedDocumentdb = pkgs.runCommand "documentdb-flat" {} ''
              mkdir -p $out
              cp -rL ${documentdb}/. $out/
            '';
          in pkgs.dockerTools.buildImage {
            name = "ghcr.io/chezmoidotsh/flakes/postgres-extensions/documentdb";
            tag = "${documentdb.version}-pg${postgresql.version}-${nixversion}-${system}";

            copyToRoot = flattenedDocumentdb;

            # created = builtins.substring 0 8 self.lastModifiedDate;
            config.Labels = {
              "org.opencontainers.image.authors" = "chezmoi.sh Lab <xunleii@users.noreply.github.com>";
              "org.opencontainers.image.description" = "DocumentDB PostgreSQL extension for CloudNativePG image volume extensions";
              "org.opencontainers.image.documentation" = "https://github.com/documentdb/documentdb";
              "org.opencontainers.image.licenses" = "Apache-2.0";
              "org.opencontainers.image.revision" = documentdb.version;
              "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/postgres-extensions/documentdb/flake.nix";
              "org.opencontainers.image.title" = "postgres-documentdb-extension";
              "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
              "org.opencontainers.image.version" = documentdb.version;

              "sh.chezmoi.catalog.build.engine.type" = "nix";
              "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
              "sh.chezmoi.catalog.category" = "database/extension";
              "sh.chezmoi.catalog.origin.author" = "DocumentDB <https://github.com/documentdb/documentdb>";
              "sh.chezmoi.catalog.origin.license" = "Apache-2.0";
              "sh.chezmoi.catalog.origin.repository" = "github.com/documentdb/documentdb";
            };
          };
        };
    });
}
