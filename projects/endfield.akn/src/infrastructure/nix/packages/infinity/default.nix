{ pkgs ? import <nixpkgs> { } }:

# Infinity packaging for rapid prototyping.
# - use `rec` so `${version}` is available in buildPhase
# - pin torch/torchvision explicitly and install optimum before infinity-emb
# - version pinned to 0.0.77
pkgs.stdenv.mkDerivation rec {
  pname = "infinity";
  version = "0.0.77";

  # Ensure uv and python are available on PATH during build
  nativeBuildInputs = [
    pkgs.uv
    pkgs.python312
    pkgs.makeWrapper
  ];

  # We're creating the venv and installing wheels at build time
  unpackPhase = "true";

  buildPhase = ''
    export UV_CACHE_DIR=$TMPDIR/uv-cache
    export HOME=$TMPDIR

    # Create a venv at $out
    uv venv $out --python python3

    # Pin torch + torchvision first to avoid binary/operator mismatches
    # (these versions were chosen because they are known to be compatible together)
    uv pip install --python "$out/bin/python" \
      "torch==2.5.1" \
      "torchvision==0.20.1"

    # Install optimum early (provides optimum.bettertransformer and other runtime bits)
    uv pip install --python "$out/bin/python" \
      "optimum==1.27.0"

    # Install other pinned runtime deps
    uv pip install --python "$out/bin/python" \
      "transformers==4.53.1" \
      "typer==0.12.5" \
      "click==8.1.7"

    # Finally install infinity-emb with extras; it will reuse the already-installed
    # torch/torchvision/optimum/transformers from above.
    uv pip install --python "$out/bin/python" "infinity-emb[all]==${version}"
  '';

  installPhase = ''
    # Wrap the entrypoint to ignore user site-packages
    wrapProgram $out/bin/infinity_emb \
      --set PYTHONNOUSERSITE 1
  '';

  meta = with pkgs.lib; {
    description = "Infinity CLI and embeddings packaged into a venv using uv (prototype)";
    license = licenses.mit;
    platforms = platforms.darwin;
    maintainers = with maintainers; [ ];
  };
}
