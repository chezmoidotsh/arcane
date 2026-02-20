{ self, pkgs, ... }:

let
  # renovate: datasource=github-releases depName=mendableai/firecrawl
  version = "v2.8.0";

  src = pkgs.fetchFromGitHub {
    owner = "firecrawl";
    repo = "firecrawl";
    rev = version;
    hash = "sha256-7dB3jdp5jkRiNx63C5sjs3t85fuz5vzurfvYY5jWQyU=";
  };

  # ──────────────────────────────────────────────────────────────────────────────
  # Go shared library (c-shared) - html-to-markdown converter
  # ──────────────────────────────────────────────────────────────────────────────
  goHtmlToMd = pkgs.buildGoModule {
    pname = "firecrawl-go-html-to-md";
    inherit version src;

    sourceRoot = "source/apps/api/sharedLibs/go-html-to-md";
    vendorHash = "sha256-Oc1p8yDg3qjRa7DpgmyCspBALNaYA81epGMx1sP1oak=";

    # We only need the c-shared library, not a binary
    buildPhase = ''
      runHook preBuild
      go build -buildmode=c-shared -o libhtml-to-markdown.so html-to-markdown.go
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out/lib $out/include
      cp libhtml-to-markdown.so $out/lib/
      if [ -f libhtml-to-markdown.h ]; then
        cp libhtml-to-markdown.h $out/include/
      fi
      runHook postInstall
    '';

    # Required for c-shared build
    env.CGO_ENABLED = "1";

    doCheck = false;

    meta = with pkgs.lib; {
      description = "Go HTML to Markdown shared library for Firecrawl (c-shared).";
      homepage = "https://github.com/mendableai/firecrawl";
      license = licenses.agpl3Only;
    };
  };

  # ──────────────────────────────────────────────────────────────────────────────
  # Node.js / pnpm application build
  # ──────────────────────────────────────────────────────────────────────────────
  firecrawlApp = pkgs.stdenv.mkDerivation {
    pname = "firecrawl-app";
    inherit version src;

    # Build from the monorepo root so workspace packages (eg. @mendable/firecrawl-rs)
    # are correctly built and linked into the apps/api package.
    sourceRoot = "source";

    nativeBuildInputs = [
      pkgs.nodejs_22
      pkgs.pnpm
      pkgs.python3
      pkgs.pkg-config
      pkgs.gnumake
      pkgs.cacert
      # Rust toolchain for native modules (node-gyp/napi-rs)
      pkgs.rustc
      pkgs.cargo
      pkgs.libiconv
    ];

    buildInputs = [
      pkgs.openssl
      pkgs.openssl.dev
      pkgs.libiconv
    ];

    # Environment for native module compilation
    OPENSSL_DIR = "${pkgs.openssl.dev}";
    OPENSSL_LIB_DIR = "${pkgs.openssl.out}/lib";
    OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";

    # Network access is required for pnpm install
    __noChroot = true;

    configurePhase = ''
      runHook preConfigure

      export HOME=$TMPDIR/home
      mkdir -p $HOME

      # SSL certificates for network access
      export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
      export NIX_SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
      export NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt

      runHook postConfigure
    '';

    buildPhase = ''
      runHook preBuild

      # certs / openssl envs
      export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
      export NIX_SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
      export NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt

      export OPENSSL_DIR="${pkgs.openssl.dev}"
      export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
      export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
      export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"

      # Use pnpm from nixpkgs to avoid corepack download
      PNPM_BIN="${pkgs.pnpm}/bin/pnpm"

      # Detect workspace root: pnpm-workspace.yaml or "workspaces" in package.json
      WORKSPACE_ROOT=""
      if [ -f pnpm-workspace.yaml ]; then
        WORKSPACE_ROOT="."
      elif [ -f package.json ] && grep -q '"workspaces"' package.json 2>/dev/null; then
        WORKSPACE_ROOT="."
      fi

      if [ -n "$WORKSPACE_ROOT" ]; then
        echo "pnpm workspace detected at $WORKSPACE_ROOT — installing/building workspace"
        # Install all workspace deps and build workspace packages (including any native bindings)
        $PNPM_BIN -w install --frozen-lockfile
        $PNPM_BIN -w run build || true

        # Ensure apps/api has its own node_modules and build
        if [ -d apps/api ]; then
          (cd apps/api && $PNPM_BIN install --frozen-lockfile && $PNPM_BIN run build || true)
          (cd apps/api && $PNPM_BIN rebuild || true)
          (cd apps/api && $PNPM_BIN prune --prod --ignore-scripts || true)
        fi
      else
        echo "No pnpm workspace detected — building apps/api only"
        if [ -d apps/api ]; then
          (cd apps/api && ${pkgs.pnpm}/bin/pnpm install --frozen-lockfile && ${pkgs.pnpm}/bin/pnpm run build || true)
          (cd apps/api && ${pkgs.pnpm}/bin/pnpm rebuild || true)
          (cd apps/api && ${pkgs.pnpm}/bin/pnpm prune --prod --ignore-scripts || true)
        else
          echo "Warning: apps/api not found; nothing to build" >&2
        fi
      fi

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out

      # Copy built artifacts from apps/api inside the monorepo (relative paths).
      if [ -d apps/api/dist ]; then
        cp -a apps/api/dist $out/dist
      fi

      # Prefer copying the package-local node_modules if present (pnpm may create it in the package)
      if [ -d apps/api/node_modules ]; then
        cp -a apps/api/node_modules $out/node_modules
      else
        # Attempt to copy relevant workspace modules from the monorepo top-level node_modules
        mkdir -p $out/node_modules
        if [ -d node_modules/@mendable ]; then
          cp -a node_modules/@mendable $out/node_modules/ || true
        fi
        # Fallback: copy top-level node_modules (ensures native packages are included)
        if [ -d node_modules ]; then
          cp -a node_modules $out/node_modules || true
        fi
      fi

      # Copy package.json from apps/api so runtime can inspect it.
      if [ -f apps/api/package.json ]; then
        cp -a apps/api/package.json $out/
      fi

      # Copy native modules if they exist in the API package
      if [ -d apps/api/native ]; then
        cp -a apps/api/native $out/
      fi

      # Copy shared libs directory structure and inject the Go shared library
      mkdir -p $out/sharedLibs/go-html-to-md
      cp -a ${goHtmlToMd}/lib/libhtml-to-markdown.so $out/sharedLibs/go-html-to-md/
      if [ -f ${goHtmlToMd}/include/libhtml-to-markdown.h ]; then
        cp -a ${goHtmlToMd}/include/libhtml-to-markdown.h $out/sharedLibs/go-html-to-md/
      fi

      runHook postInstall
    '';

    doCheck = false;

    meta = with pkgs.lib; {
      description = "Firecrawl API - Turn websites into LLM-ready data.";
      homepage = "https://github.com/mendableai/firecrawl";
      license = licenses.agpl3Only;
      platforms = platforms.linux;
    };
  };

in
rec {
  inherit version src goHtmlToMd firecrawlApp;

  # ──────────────────────────────────────────────────────────────────────────────
  # Convenience layer for Docker image inclusion
  # ──────────────────────────────────────────────────────────────────────────────
  firecrawlLayer = pkgs.runCommand "firecrawl-layer-${version}" { } ''
    mkdir -p $out
    cp -a ${firecrawlApp}/* $out/
  '';
}
