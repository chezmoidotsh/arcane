{ self, pkgs, postgresql, documentdb-src }:

let
  # ───────────────────────────────────────────────────────────────────────────
  # Intel Decimal Floating-Point Math Library (IntelRDFPMathLib)
  # Required by DocumentDB for Decimal128 type support (bid_conf.h, libbid).
  # Built from Ubuntu's patched version on Launchpad.
  # ───────────────────────────────────────────────────────────────────────────
  intelrdfpmathlib = pkgs.stdenv.mkDerivation {
    pname = "intelrdfpmathlib";
    version = "2.0u3-1";

    src = pkgs.fetchgit {
      url = "https://git.launchpad.net/ubuntu/+source/intelrdfpmath";
      rev = "applied/2.0u3-1";
      hash = "sha256-DVrvYYr7Qr0zmSJj7nwEdVQ/Dm/RgKg0JN0P7hErIRo=";
    };

    nativeBuildInputs = [ pkgs.gnumake pkgs.gcc ];

    # Build the library with -fPIC for shared library linking.
    # The flags match DocumentDB's install_setup_intel_decimal_math_lib.sh:
    #   CALL_BY_REF=0 GLOBAL_RND=0 GLOBAL_FLAGS=0 UNCHANGED_BINARY_FLAGS=0
    buildPhase = ''
      cd LIBRARY
      make -j$NIX_BUILD_CORES \
        _CFLAGS_OPT=-fPIC \
        CC=cc \
        CALL_BY_REF=0 \
        GLOBAL_RND=0 \
        GLOBAL_FLAGS=0 \
        UNCHANGED_BINARY_FLAGS=0
    '';

    installPhase = ''
      cd ..

      # Install headers and library
      mkdir -p $out/lib $out/include $out/lib/pkgconfig

      cp LIBRARY/libbid.a $out/lib/
      cp LIBRARY/src/*.h $out/include/

      # Create pkg-config file matching what DocumentDB expects (intelmathlib)
      cat > $out/lib/pkgconfig/intelmathlib.pc <<PKGEOF
prefix=$out
libdir=\''${prefix}/lib
includedir=\''${prefix}/include

Name: intelmathlib
Description: Intel Decimal Floating-Point Math Library
Version: 2.0 Update 2
Cflags: -I\''${includedir}
Libs: -L\''${libdir} -lbid
PKGEOF
    '';

    meta = {
      description = "Intel Decimal Floating-Point Math Library (BID encoding)";
      homepage = "https://www.intel.com/content/www/us/en/developer/articles/tool/intel-decimal-floating-point-math-library.html";
    };
  };

  # ───────────────────────────────────────────────────────────────────────────
  # PCRE2 (static, with JIT)
  # DocumentDB links against libpcre2-8 statically via pkg-config.
  # ───────────────────────────────────────────────────────────────────────────
  pcre2-static = pkgs.pcre2.overrideAttrs (old: {
    configureFlags = (old.configureFlags or []) ++ [
      "--enable-static"
      "--enable-jit"
    ];

    # Ensure -fPIC for all compiled objects
    env = (old.env or {}) // {
      NIX_CFLAGS_COMPILE = "${old.env.NIX_CFLAGS_COMPILE or ""} -fPIC";
    };
  });

  # ───────────────────────────────────────────────────────────────────────────
  # libbson (from mongo-c-driver 1.28.0)
  # DocumentDB requires libbson-static-1.0 to be available via pkg-config.
  # We build mongo-c-driver with static libbson enabled.
  # ───────────────────────────────────────────────────────────────────────────
  mongo-c-driver-static = pkgs.mongoc.overrideAttrs (old: {
    version = "1.28.0";

    src = pkgs.fetchurl {
      url = "https://github.com/mongodb/mongo-c-driver/releases/download/1.28.0/mongo-c-driver-1.28.0.tar.gz";
      hash = "sha256-vskMhTYbSp+J2AJDRA1T85uecGsf5L+QHE0//W9Q+9s=";
    };

    cmakeFlags = (old.cmakeFlags or []) ++ [
      "-DENABLE_MONGOC=ON"
      "-DMONGOC_ENABLE_ICU=OFF"
      "-DENABLE_ICU=OFF"
      "-DCMAKE_C_FLAGS=-fPIC"
    ];
  });

in
pkgs.stdenv.mkDerivation {
  pname = "pg_documentdb";
  version = "0.109.0";

  src = documentdb-src;

  nativeBuildInputs = [
    pkgs.pkg-config
    pkgs.gnumake
    pkgs.gcc
    pkgs.git          # needed by generate_extension_version.sh (git rev-parse)
    pkgs.clang
    postgresql
    postgresql.pg_config
    postgresql.dev
  ];

  buildInputs = [
    postgresql
    mongo-c-driver-static  # provides libbson-static-1.0
    intelrdfpmathlib       # provides intelmathlib (bid_conf.h, libbid)
    pcre2-static           # provides libpcre2-8
    pkgs.openssl
    pkgs.libkrb5
    pkgs.readline
    pkgs.zlib
    pkgs.icu
    postgresql
  ];

  # Make pkg-config find our custom intelmathlib.pc
  PKG_CONFIG_PATH = pkgs.lib.concatStringsSep ":" [
    "${intelrdfpmathlib}/lib/pkgconfig"
    "${pcre2-static}/lib/pkgconfig"
    "${mongo-c-driver-static}/lib/pkgconfig"
  ];

  # Build: pg_documentdb_core → pg_documentdb → pg_documentdb_extended_rum
  # (mirrors `make install-no-distributed` from root Makefile)
buildPhase = ''
    export HOME=$TMPDIR
    patchShebangs scripts/

    # 1. Patch de l'API MongoDB
    echo "Patching legacy BSON functions..."
    substituteInPlace pg_documentdb_core/src/io/pgbson.c \
      --replace-fail "bson_as_legacy_extended_json" "bson_as_relaxed_extended_json"

    # 2. Inclusions globales + Désactivation de LTO au niveau global
    export NIX_CFLAGS_COMPILE="-I${postgresql.dev}/include/server -I${pkgs.openssl.dev}/include -I${pkgs.libkrb5.dev}/include -fno-lto"

    # 3. Le bouclier Clang + Désactivation de LTO injectée dans PGXS
    local pgCflags="-Wno-error=typedef-redefinition -Wno-error=unused-function -Wno-error=deprecated-non-prototype -Wno-error=default-const-init-field-unsafe -Wno-declaration-after-statement -Wno-error=declaration-after-statement -fno-lto"

    local makeArgs=(
      "PG_CONFIG=pg_config"
      "PG_CFLAGS=''${pgCflags}"
      "-j$NIX_BUILD_CORES"
    )

    echo "--- Building Core ---"
    make -C pg_documentdb_core "''${makeArgs[@]}"
    
    echo "--- Building Main Extension ---"
    make -C pg_documentdb "''${makeArgs[@]}"
    
    echo "--- Building Extended Rum ---"
    make -C pg_documentdb_extended_rum "''${makeArgs[@]}"
  '';

  installPhase = ''
    # Install into a temporary DESTDIR
    export DESTDIR="$TMPDIR/install"
    make -C pg_documentdb_core install
    make -C pg_documentdb install
    make -C pg_documentdb_extended_rum install

    # Copy files to output following CNPG image volume extension layout:
    #   /share/extension/ → *.control + *.sql files
    #   /lib/             → *.so files
    local pgShareDir=$(pg_config --sharedir)
    local pgPkgLibDir=$(pg_config --pkglibdir)

    mkdir -p $out/share/extension
    mkdir -p $out/lib

    # Copy control and SQL files
    cp -v $DESTDIR$pgShareDir/extension/documentdb_core* $out/share/extension/ || true
    cp -v $DESTDIR$pgShareDir/extension/documentdb--* $out/share/extension/ || true
    cp -v $DESTDIR$pgShareDir/extension/documentdb.control $out/share/extension/ || true
    cp -v $DESTDIR$pgShareDir/extension/documentdb_extended_rum* $out/share/extension/ || true

    # Copy shared libraries
    cp -v $DESTDIR$pgPkgLibDir/pg_documentdb_core.so $out/lib/ || true
    cp -v $DESTDIR$pgPkgLibDir/pg_documentdb.so $out/lib/ || true
    cp -v $DESTDIR$pgPkgLibDir/pg_documentdb_extended_rum.so $out/lib/ || true
    cp -v $DESTDIR$pgPkgLibDir/pg_documentdb_extended_rum_core.so $out/lib/ || true

    # Also copy the libbid.a that might be needed at runtime
    # (DocumentDB links it statically, so this is just for completeness)
  '';

  meta = {
    description = "DocumentDB PostgreSQL extension (MongoDB-compatible document store)";
    homepage = "https://github.com/documentdb/documentdb";
    license = pkgs.lib.licenses.mit;
  };
}
