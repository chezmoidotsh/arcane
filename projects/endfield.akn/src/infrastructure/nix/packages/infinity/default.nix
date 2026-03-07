{ pkgs ? import <nixpkgs> { } }:

# Developer-friendly prototype packaging for `infinity`.
# Strategy:
#  - create a venv with `uv`
#  - install `infinity-emb[all]` with `--no-deps` (so it cannot upgrade deps)
#  - then explicitly install pinned dependency versions (torch, torchvision, optimum,
#    transformers, and the small runtime set) to avoid unwanted upgrades
#
# This is intended for rapid prototyping only (it performs network installs at build time).
# For production/reproducible builds you should vendor wheels or use a Nix-native python build.

pkgs.stdenv.mkDerivation rec {
  pname = "infinity";
  version = "0.0.77";

  nativeBuildInputs = [
    pkgs.uv
    pkgs.python312
    pkgs.makeWrapper
    pkgs.rustc
    pkgs.cargo
    pkgs.pkg-config
    pkgs.cacert
  ];

  # we build the venv and install wheels at build time
  unpackPhase = "true";

  buildPhase = ''
    export UV_CACHE_DIR=$TMPDIR/uv-cache
    export HOME=$TMPDIR

    # create venv
    uv venv $out --python python3

    # Install the infinity package itself WITHOUT dependencies so it doesn't pull
    # and upgrade transformers/optimum/etc.
    uv pip install --no-deps --python "$out/bin/python" "infinity-emb[all]==${version}"

    # Now install pinned runtime dependencies in the order that avoids binary mismatches:
    # 1) torch + torchvision (must be compatible)
    # 2) optimum (provides optimum.bettertransformer)
    # 3) transformers pinned to a version compatible with optimum.bettertransformer
    # 4) other small runtime deps
    #
    # NOTE: adjust versions if you need specific MPS support on macOS. These are chosen to
    # be reasonably compatible for prototyping.
    uv pip install --python "$out/bin/python" \
      "torch==2.5.1" \
      "torchvision==0.20.1"

    uv pip install --python "$out/bin/python" \
      "optimum==1.27.0"

    # transformers must be compatible with optimum.bettertransformer in this context.
    uv pip install --python "$out/bin/python" \
      "transformers==4.48.1"

    # smaller runtime utilities — pin huggingface-hub to a version that still exposes
    # `cached_download` before installing sentence-transformers which expects it.
    uv pip install --python "$out/bin/python" \
      "typer==0.12.5" \
      "click==8.1.7" \
      "huggingface-hub==0.13.4" \
      "sentence-transformers==2.2.2" \
      "accelerate==0.22.0"

    # If infinity-emb exposes extras which require additional packages not covered above,
    # install them explicitly here. We installed infinity-emb itself earlier so its package
    # files are present but its automatic dependency installation is suppressed.
  '';

  installPhase = ''
    # wrap the script to ignore user site-packages (and to set PATH correctly)
    wrapProgram $out/bin/infinity_emb \
      --set PYTHONNOUSERSITE 1 \
      --prefix PATH : "${pkgs.python312}/bin"
  '';

  meta = with pkgs.lib; {
    description = "Prototype packaging of infinity-emb into a venv (installs pins after --no-deps)";
    license = licenses.mit;
    platforms = platforms.unix;
    maintainers = with maintainers; [ ];
  };
}
