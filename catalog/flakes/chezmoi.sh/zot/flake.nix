{
  description = "Zot — OCI-native container registry binary packages (pre-built release binaries)";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs }:
    let
      # renovate: datasource=github-releases depName=project-zot/zot
      version = "v2.1.17";

      binaries = {
        "x86_64-linux" = {
          zot = {
            url = "https://github.com/project-zot/zot/releases/download/${version}/zot-linux-amd64";
            hash = "sha256-/OLda4e6pk5j0BlhbwWmdE+CfRWiVD3u0SvKbXFtYi0=";
          };
          "zot-minimal" = {
            url = "https://github.com/project-zot/zot/releases/download/${version}/zot-linux-amd64-minimal";
            hash = "sha256-Uj5b8poBPbCRFfeAwxUq+Y/Ftl/ECKDT5sKTZD3Jvec=";
          };
        };
        "aarch64-linux" = {
          zot = {
            url = "https://github.com/project-zot/zot/releases/download/${version}/zot-linux-arm64";
            hash = "sha256-sXsDrANaatkhqW8VSPel+XcEPmYfScbtSO7AUbj8uXQ=";
          };
          "zot-minimal" = {
            url = "https://github.com/project-zot/zot/releases/download/${version}/zot-linux-arm64-minimal";
            hash = "sha256-9WrxDKVu88QrinXyZI8jFfJIBInVmLz8ecIVUJYVskw=";
          };
        };
      };

      supportedSystems = builtins.attrNames binaries;

      forEachSystem =
        f: builtins.listToAttrs (map (system: { name = system; value = f system; }) supportedSystems);
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          systemBinaries = binaries.${system};

          mkZotPackage =
            variant:
            let
              bin = systemBinaries.${variant};
            in
            pkgs.stdenvNoCC.mkDerivation {
              pname = variant;
              inherit version;

              src = pkgs.fetchurl {
                url = bin.url;
                hash = bin.hash;
              };

              # Zot release binaries are dynamically linked (CGO). autoPatchelfHook
              # rewrites the ELF interpreter and RPATH to point into the Nix store,
              # which is required because /lib64/ld-linux-x86-64.so.2 does not exist
              # on NixOS.
              nativeBuildInputs = [ pkgs.autoPatchelfHook ];
              buildInputs = [ pkgs.glibc ];

              dontUnpack = true;
              dontConfigure = true;
              dontBuild = true;

              installPhase = ''
                install -Dm755 $src $out/bin/${variant}
              '';

              meta = with pkgs.lib; {
                description = "OCI-native container registry — ${variant} variant";
                homepage = "https://zotregistry.dev";
                license = licenses.asl20;
                platforms = [ system ];
                mainProgram = variant;
              };
            };
        in
        {
          zot = mkZotPackage "zot";
          zot-minimal = mkZotPackage "zot-minimal";
          default = mkZotPackage "zot";
        }
      );
    };
}
