{
  description = "PostGIS PostgreSQL extension for CloudNativePG (image volume extension).";

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
          postgis = pkgs.postgresql18Packages.postgis;
          nixversion = "${pkgs.lib.versions.major pkgs.lib.version}.${pkgs.lib.versions.minor pkgs.lib.version}";

          bundledPostgis = pkgs.runCommand "postgis-bundled"
            {
              nativeBuildInputs = [ pkgs.patchelf pkgs.glibc.bin ];
            } ''
            mkdir -p $out/lib $out/share/extension $out/xml2

            # -- Copy PostGIS extension files
            cp -rL ${postgis}/lib/address_standardizer-3.so $out/lib/
            cp -rL ${postgis}/lib/postgis_raster-3.so $out/lib/
            cp -rL ${postgis}/lib/postgis_topology-3.so $out/lib/
            cp -rL ${postgis}/lib/postgis-3.so $out/lib/
            
            cp -rL ${postgis}/share/postgresql/extension/* $out/share/extension/

            # -- Copy PostGIS extension dependencies
            cp -rL ${pkgs.gdal}/lib/libgdal.so.37 $out/lib/
            cp -rL ${pkgs.geos}/lib/libgeos_c.so.1 $out/lib/
            cp -rL ${pkgs.glibc}/lib/libm.so.6 $out/lib/
            cp -rL ${pkgs.json_c}/lib/libjson-c.so.5 $out/lib/
            # cp -rL ${pkgs.libxml2}/* $out/xml2/
            cp -rL ${pkgs.proj}/lib/libproj.so.25 $out/lib/
            cp -rL ${pkgs.protobufc.lib}/lib/libprotobuf-c.so.1 $out/lib/
          '';
        in
        rec {
          # ┌───────────────────────────────────────────────────────────────────────────┐
          # │ <default>: Build the PostGIS extension image for CNPG.                    │
          # │            Follows CNPG image volume extension layout.                    │
          # │                                                                           │
          # │ PostGIS dynamically links against libgeos, libproj, libgdal, and many     │
          # │ other libraries. Unlike pg_cron (self-contained .so), we must bundle      │
          # │ the exact set of transitively-needed shared libraries and patch RPATHs    │
          # │ to $ORIGIN so they resolve within the extension volume, since CNPG        │
          # │ containers have no Nix store.                                             │
          # │                                                                           │
          # │ We use recursive ldd to discover only the .so files actually needed       │
          # │ at runtime (from the Nix store), copy them into /lib/, and rewrite        │
          # │ RPATHs. System libs (glibc, ld-linux) are excluded since they exist       │
          # │ in the CNPG container already.                                            │
          # │                                                                           │
          # | @sh.chezmoi.app.image: postgres-postgis-extension                         │
          # | @sh.chezmoi.app.type: extension                                           │
          # └───────────────────────────────────────────────────────────────────────────┘
          postgis = bundledPostgis;
          # libxml2 = pkgs.libxml2;

          default = pkgs.dockerTools.buildImage {
            name = "ghcr.io/chezmoidotsh/flakes/postgres-extensions/postgis";
            tag = "${postgis.version}-pg${postgresql.version}-${nixversion}-${system}";

            copyToRoot = bundledPostgis;

            # created = builtins.substring 0 8 self.lastModifiedDate;
            config.Labels = {
              "org.opencontainers.image.authors" = "chezmoi.sh Lab <xunleii@users.noreply.github.com>";
              "org.opencontainers.image.description" = "PostGIS PostgreSQL extension for CloudNativePG image volume extensions";
              "org.opencontainers.image.documentation" = "https://postgis.net/documentation/";
              "org.opencontainers.image.licenses" = "GPL-2.0-or-later";
              "org.opencontainers.image.revision" = postgis.version;
              "org.opencontainers.image.source" = "https://github.com/chezmoidotsh/arcane/blob/main/catalog/flakes/postgres-extensions/postgis/flake.nix";
              "org.opencontainers.image.title" = "postgres-postgis-extension";
              "org.opencontainers.image.url" = "https://github.com/chezmoidotsh/arcane";
              "org.opencontainers.image.version" = postgis.version;

              "sh.chezmoi.catalog.build.engine.type" = "nix";
              "sh.chezmoi.catalog.build.engine.version" = "${pkgs.lib.version}";
              "sh.chezmoi.catalog.category" = "database/extension";
              "sh.chezmoi.catalog.origin.author" = "PostGIS <https://postgis.net>";
              "sh.chezmoi.catalog.origin.license" = "GPL-2.0-or-later";
              "sh.chezmoi.catalog.origin.repository" = "github.com/postgis/postgis";
            };
          };
        };
    });
}
