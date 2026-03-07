{ pkgs ? import <nixpkgs> { } }:

pkgs.stdenv.mkDerivation {
  pname = "infinity";
  version = "0.0.77";

  nativeBuildInputs = [
    pkgs.uv
    pkgs.python312
    pkgs.makeWrapper
  ];

  # Fixed-Output Derivation (FOD): allows network access during build.
  outputHashMode = "recursive";
  outputHashAlgo = "sha256";
  outputHash = "sha256-R4r97X0FpxT3zIu1Z4r87Yv+9qf9Yq9Yq9Yq9Yq9Yq9=";

  unpackPhase = "true";

  buildPhase = ''
    export UV_CACHE_DIR=$TMPDIR/uv-cache
    export HOME=$TMPDIR
    
    ${pkgs.uv}/bin/uv venv $out --python ${pkgs.python312}/bin/python3
    
    # 1. Install without extras to bypass optimum conflict.
    # We manually list everything previously in [all] but with compatible versions.
    ${pkgs.uv}/bin/uv pip install \
      --python "$out/bin/python" \
      "infinity-emb==0.0.77" \
      "transformers==4.48.0" \
      "optimum==1.17.0" \
      "typer==0.12.5" \
      "click==8.1.7"
  '';

  installPhase = ''
    # Wrap pour s'assurer qu'il ignore les packages Python de l'utilisateur (~/.local)
    wrapProgram $out/bin/infinity_emb \
      --set PYTHONNOUSERSITE 1
  '';
}
