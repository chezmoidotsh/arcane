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
  # NOTE: static linking is enforced by removing the dynamic libs.
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

    # Force compiler to use static archive by deleting shared object files
    postInstall = (old.postInstall or "") + ''
      rm -f $out/lib/*.so*
    '';
  });

  # ───────────────────────────────────────────────────────────────────────────
  # libbson (from mongo-c-driver 1.30.6)
  # DocumentDB requires libbson-static-1.0 to be available via pkg-config.
  # NOTE: mongo-c-driver is built with static libbson enabled
  # NOTE2: static linking is enforced by removing the dynamic libs
  # ───────────────────────────────────────────────────────────────────────────
  mongo-c-driver-static = pkgs.mongoc.overrideAttrs (old: {
    version = "1.30.6";

    src = pkgs.fetchurl {
      url = "https://github.com/mongodb/mongo-c-driver/releases/download/1.30.6/mongo-c-driver-1.30.6.tar.gz";
      hash = "sha256-gx3bVNHNKuCAVI/z/r28Wmikk475MuRCJpv2sRr4cbg=";
    };

    cmakeFlags = (old.cmakeFlags or []) ++ [
      "-DENABLE_MONGOC=ON"
      "-DMONGOC_ENABLE_ICU=OFF"
      "-DENABLE_ICU=OFF"
      "-DCMAKE_C_FLAGS=-fPIC"
    ];

    # Force compiler to use static archive by deleting shared object files
    postInstall = (old.postInstall or "") + ''
      rm -f $out/lib/*.so*
    '';
  });

in
pkgs.stdenv.mkDerivation {
  pname = "pg_documentdb";
  version = "0.109.0";

  src = documentdb-src;

nativeBuildInputs = with pkgs; [
    # Build tools
    clang              # Compiler required by PostgreSQL 17 standards in Nixpkgs
    gnumake
    pkg-config
    git                # Required by scripts/generate_extension_version.sh
    
    # PostgreSQL build infrastructure (PGXS)
    postgresql
    postgresql.dev

    # Closure shrinking tools
    patchelf
    removeReferencesTo
  ];

  buildInputs = with pkgs; [
    # Extension core dependencies
    mongo-c-driver-static  # Provides libbson-static-1.0
    intelrdfpmathlib       # Provides intelmathlib (bid_conf.h, libbid)
    pcre2-static           # Provides libpcre2-8
    
    # Cryptographic and system headers required by PostgreSQL
    openssl.dev
    libkrb5.dev
    
    # Standard utilities
    icu
    readline
    zlib
    postgresql
    postgresql.pg_config
  ];

  # Idiomatic construction of PKG_CONFIG_PATH using native Nix functions
  PKG_CONFIG_PATH = pkgs.lib.makeSearchPath "lib/pkgconfig" [
    intelrdfpmathlib
    pcre2-static
    mongo-c-driver-static
  ];

  buildPhase = ''
    export HOME=$TMPDIR
    patchShebangs scripts/

    # -----------------------------------------------------------------------------
    # 1. Global Includes & LTO Disabling
    # -----------------------------------------------------------------------------
    # NIX_CFLAGS_COMPILE applies to both the C compiler (Clang) AND the SQL preprocessor (GCC cpp).
    # We only put library includes and the '-fno-lto' flag here to avoid breaking the SQL generation.
    # LTO is disabled because Clang generates LLVM bitcode (.bc) which the GNU linker (ld) 
    # used by PGXS does not recognize (causes "file format not recognized" errors).
    export NIX_CFLAGS_COMPILE="$NIX_CFLAGS_COMPILE \
      -I${postgresql.dev}/include/server \
      -I${pkgs.openssl.dev}/include \
      -I${pkgs.libkrb5.dev}/include \
      -fno-lto"

    # -----------------------------------------------------------------------------
    # 2. Clang Shield (PG_CFLAGS)
    # -----------------------------------------------------------------------------
    # The extension's Makefiles inject '-Werror', making Clang 19 too strict 
    # against legacy code. We use PG_CFLAGS to inject our tolerances at the very 
    # end of the C compilation command, effectively overriding -Werror.
    # These flags are placed in an array to maintain readability.
    local pgCflags=(
      "-Wno-error=typedef-redefinition"
      "-Wno-error=unused-function"
      "-Wno-error=deprecated-non-prototype"
      "-Wno-error=default-const-init-field-unsafe"
      "-Wno-declaration-after-statement"
      "-Wno-error=declaration-after-statement"
      "-fno-lto"
    )

    local makeArgs=(
      "PG_CONFIG=pg_config"
      "PG_CFLAGS=''${pgCflags[*]}" # [*] merges the array into a single space-separated string
      "-j$NIX_BUILD_CORES"
    )

    make -C pg_documentdb_core "''${makeArgs[@]}"
    make -C pg_documentdb "''${makeArgs[@]}"
    make -C pg_documentdb_extended_rum "''${makeArgs[@]}"
  '';

  installPhase = ''
    export DESTDIR="$TMPDIR/install"
    
    # The installation also needs PG_CONFIG to properly resolve PGXS paths
    local installArgs=("PG_CONFIG=pg_config")

    make -C pg_documentdb_core install "''${installArgs[@]}"
    make -C pg_documentdb install "''${installArgs[@]}"
    make -C pg_documentdb_extended_rum install "''${installArgs[@]}"

    # -----------------------------------------------------------------------------
    # Extension Packaging
    # -----------------------------------------------------------------------------
    # We extract the compiled artifacts from DESTDIR to build the standard tree
    # expected by Nix ($out) and CloudNativePG.
    
    local pgShareDir=$(pg_config --sharedir)
    local pgPkgLibDir=$(pg_config --pkglibdir)

    mkdir -p $out/share/extension $out/lib

    # Copy control files and SQL schemas
    cp -v $DESTDIR$pgShareDir/extension/documentdb*.control $out/share/extension/
    cp -v $DESTDIR$pgShareDir/extension/documentdb*.sql $out/share/extension/

    # Copy dynamic libraries
    cp -v $DESTDIR$pgPkgLibDir/pg_documentdb*.so $out/lib/
  '';

  # -----------------------------------------------------------------------------
  # Closure Shrinking
  # -----------------------------------------------------------------------------
  # 1. RPATH Clearing: Nix embeds absolute paths to dynamic libraries (/nix/store/...)
  #    in the ELF's RPATH. CloudNativePG pods do not have a Nix store, meaning the
  #    extension would fail to load at runtime. We clear the RPATH so the extension 
  #    relies on the base OS libraries of the CNPG container.
  #
  # 2. String Scrubbing: PGXS embeds build paths (compiler, postgresql server, 
  #    dev headers) as hardcoded strings inside the .so files. Nix detects these 
  #    and forcefully pulls a massive runtime closure. We use 'remove-references-to' 
  #    to safely overwrite these Nix store paths with invalid hashes, breaking the 
  #    dependency graph without corrupting the ELF binary.
  postFixup = ''
    echo 'Fixing RPATH to $ORIGIN for proximity loading...'
    find $out/lib -type f -name "*.so" -exec patchelf --set-rpath '$ORIGIN' {} \;

    echo 'Scrubbing build tools and PostgreSQL server from binaries to shrink closure...'
    find $out/lib -type f -name "*.so" -exec remove-references-to -t ${pkgs.clang} {} \;
    find $out/lib -type f -name "*.so" -exec remove-references-to -t ${postgresql.dev} {} \;
    find $out/lib -type f -name "*.so" -exec remove-references-to -t ${postgresql} {} \;
  '';

  meta = {
    description = "DocumentDB PostgreSQL extension (MongoDB-compatible document store)";
    homepage = "https://github.com/documentdb/documentdb";
    license = pkgs.lib.licenses.asl20;
  };
}
