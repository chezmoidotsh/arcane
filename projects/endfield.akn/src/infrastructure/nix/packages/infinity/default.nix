{ pkgs ? import <nixpkgs> { }
, poetry2nix ? null
}:

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : infinity                                                     │
# │ Description : Python environment for infinity-emb embedding/reranking      │
# │               server with MPS (Metal) acceleration.                        │
# │ Why         : infinity-emb is not packaged in nixpkgs; we use poetry2nix   │
# │               so Nix respects the exact versions from the source lockfile. │
# └───────────────────────────────────────────────────────────────────────────┘

let
  # Initialize poetry2nix (either from the flake input or fallback to tarball)
  p2n = if poetry2nix != null
        then poetry2nix.lib.mkPoetry2Nix { inherit pkgs; }
        else (import (builtins.fetchTarball "https://github.com/nix-community/poetry2nix/archive/master.tar.gz") { inherit pkgs; });

  # Fetch the specific version we want from GitHub. We use this because 
  # PyPI source distributions do not always include 'poetry.lock'.
  src = pkgs.fetchFromGitHub {
    owner = "michaelfeil";
    repo = "infinity";
    rev = "0.0.77";
    # NOTE: Set to empty initially to let Nix fail and give us the exact hash.
    # Once we run it, we'll get an error with the correct SRI hash to put here.
    hash = "sha256-78u6aTRJ9ypJ4HWZkYWELA2PRdMKtwZAxQTzbcqx1Wo="; 
  };

  # Infinity-emb's poetry files are located in a subdirectory of the repo.
  projectDir = "${src}/libs/infinity_emb";

  # A builder for dummy Python packages to safely stub out Linux/Windows-only
  # dependencies without triggering Nix's lazy `throw` if we try to override them.
  dummyPkg = pname: pkgs.python312Packages.buildPythonPackage {
    inherit pname;
    version = "0.0.0-dummy";
    src = pkgs.writeTextDir "setup.py" ''
      from setuptools import setup
      setup(name="${pname}", version="0.0.0")
    '';
    format = "setuptools";
    doCheck = false;
    nativeBuildInputs = [ pkgs.python312Packages.setuptools ];
    propagatedBuildInputs = [ pkgs.python312Packages.setuptools ];
  };

  infinityApp = p2n.mkPoetryApplication {
    inherit projectDir;
    python = pkgs.python312;
    doCheck = false;    # Disable tests (we just want the backend wrapper)
    checkGroups = [];   
    preferWheel = true; # Use binary wheels on Darwin to avoid SDK/compilation issues

    # We must patch the same two files since the source code still has these logic errors
    postPatch = ''
      substituteInPlace infinity_emb/transformer/utils_optimum.py \
        --replace-fail "from huggingface_hub import HfApi, HfFolder" "from huggingface_hub import HfApi" \
        --replace-fail "HfFolder().get_token()" "None" || true

      substituteInPlace infinity_emb/transformer/acceleration.py \
        --replace-fail "return config.model_type in BetterTransformerManager.MODEL_MAPPING" "return ('BetterTransformerManager' in globals()) and (config.model_type in BetterTransformerManager.MODEL_MAPPING)" || true
    '';

    # Some dependencies in poetry might fail C extensions build in Darwin
    # or don't have macOS wheels/sources (like onnxruntime-gpu). Since we don't
    # enable these optional features anyway, we can just stub them entirely
    # to prevent poetry2nix from dying during evaluation.
    overrides = p2n.defaultPoetryOverrides.extend (self: super: {
      onnxruntime-gpu = dummyPkg "onnxruntime-gpu";
      tensorrt = dummyPkg "tensorrt";
      openvino = dummyPkg "openvino";
      onnxruntime-openvino = dummyPkg "onnxruntime-openvino";
      openvino-tokenizers = dummyPkg "openvino-tokenizers";

      # Use nixpkgs versions for packages that have complex system dependencies 
      # (like C extensions linking to macOS SDKs or specific C++ libraries).
      pyarrow = pkgs.python312Packages.pyarrow;
      psutil = pkgs.python312Packages.psutil;
      orjson = pkgs.python312Packages.orjson;
      uvicorn = pkgs.python312Packages.uvicorn;
      uvloop = pkgs.python312Packages.uvloop;
      httptools = pkgs.python312Packages.httptools;
      flatbuffers = pkgs.python312Packages.flatbuffers;
      onnxruntime = pkgs.python312Packages.onnxruntime;
      optimum = pkgs.python312Packages.optimum;
      gputil = dummyPkg "gputil";
      setuptools = pkgs.python312Packages.setuptools;
      huggingface-hub = pkgs.python312Packages.huggingface-hub;
      tokenizers = pkgs.python312Packages.tokenizers;

      # Additionally, sentence-transformers uses poetry-core, which sometimes needs to be explicit
      sentence-transformers = super.sentence-transformers.overridePythonAttrs (old: {
        nativeBuildInputs = (old.nativeBuildInputs or []) ++ [ self.poetry-core ];
      });
    });
  };

in
{
  bin = "${infinityApp}/bin/infinity_emb";
}
