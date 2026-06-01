{
  description = "Zot — pre-built OCI registry release binaries packaged for Nix";

  # ---------------------------------------------------------------------------
  # This flake produces *runnable* Zot binaries from the upstream GitHub
  # releases. It deliberately avoids `buildGoModule` for several reasons:
  #
  #   1. Reproducibility — we pin the *exact* upstream artifact by sha256 hash,
  #      so what runs in our LXC is byte-identical to the GitHub release.
  #   2. CGO dependencies — Zot's release binaries are dynamically linked
  #      (libc, libdl). `autoPatchelfHook` rewrites the ELF interpreter and
  #      RPATH to point into the Nix store, since /lib64/ld-linux-x86-64.so.2
  #      does not exist on NixOS.
  #   3. Speed — building Zot from source pulls in the full Go toolchain and
  #      ~200 Go dependencies. Pre-built binaries are seconds.
  #
  # When `version` is bumped, refresh every entry in `binaries` below using:
  #     mise run nix:hash:update
  # The script invokes `nix-prefetch-url` for each URL and rewrites the hash
  # in-place.
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs }:
    let
      # ---------------------------------------------------------------------
      # Upstream version pin.
      #
      # `renovate:` is a Renovate manager comment — it tells Renovate to track
      # https://github.com/project-zot/zot releases and propose PRs that bump
      # this value (and the matching hashes below).
      # ---------------------------------------------------------------------
      # renovate: datasource=github-releases depName=project-zot/zot
      version = "v2.1.17";

      # ---------------------------------------------------------------------
      # Per-system binary metadata.
      #
      # `zot`          — full distribution (search/UI/sync extensions baked in)
      # `zot-minimal`  — distribution-spec only, ~⅓ the size, no extensions.
      #
      # When updating: run `mise run nix:hash:update` from the flake directory.
      # ---------------------------------------------------------------------
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

      # ---------------------------------------------------------------------
      # Build one Zot variant for a given system.
      # ---------------------------------------------------------------------
      mkZotPackage = pkgs: system: variant:
        let
          bin = binaries.${system}.${variant};
        in
        pkgs.stdenvNoCC.mkDerivation {
          pname = variant;
          inherit version;

          src = pkgs.fetchurl {
            inherit (bin) url hash;
          };

          # autoPatchelfHook rewrites the ELF interpreter / RPATH so the binary
          # works under NixOS's pure store paths. glibc satisfies libc/libdl.
          nativeBuildInputs = [ pkgs.autoPatchelfHook ];
          buildInputs = [ pkgs.glibc ];

          # The release artifact is a stripped ELF — no archive to unpack,
          # no configure step, no build step.
          dontUnpack = true;
          dontConfigure = true;
          dontBuild = true;

          installPhase = ''
            runHook preInstall
            install -Dm755 "$src" "$out/bin/${variant}"
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "OCI-native container registry (${variant} variant, upstream release binary)";
            longDescription = ''
              Zot is a production-ready vendor-neutral OCI-native container
              image/artifact registry purely based on the OCI Distribution
              Specification. This package wraps the official upstream release
              tarball — no rebuild from source.

              Variants:
                * zot          — full distribution with search, UI, sync, mgmt
                                 extensions (used for the public registry).
                * zot-minimal  — distribution-spec only, smaller footprint.
            '';
            homepage = "https://zotregistry.dev";
            changelog = "https://github.com/project-zot/zot/releases/tag/${version}";
            license = licenses.asl20;
            platforms = [ system ];
            mainProgram = variant;
            sourceProvenance = [ sourceTypes.binaryNativeCode ];
          };
        };
    in
    {
      # -----------------------------------------------------------------------
      # Outputs
      # -----------------------------------------------------------------------
      packages = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          zot = mkZotPackage pkgs system "zot";
          zot-minimal = mkZotPackage pkgs system "zot-minimal";
          default = mkZotPackage pkgs system "zot";
        }
      );

      # Convenient overlay for consumers that import the flake as a NixOS module.
      overlays.default = final: prev: {
        zot = mkZotPackage final final.stdenv.hostPlatform.system "zot";
        zot-minimal = mkZotPackage final final.stdenv.hostPlatform.system "zot-minimal";
      };
    };
}
