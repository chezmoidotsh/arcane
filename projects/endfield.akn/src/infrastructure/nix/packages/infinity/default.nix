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

  # Create a patched Python 3.12 package set where `accelerate` has its tests disabled.
  # This is the ONLY reliable way to disable transitive test dependencies — a package-level
  # overlay propagates the test-disabled derivation to all consumers (peft, sentence-transformers, etc.)
  # without them rebuilding themselves with the broken nixpkgs-cached doCheck=true version.
  py = pkgs.python312Packages.override {
    overrides = pySelf: pySuper: {
      accelerate = pySuper.accelerate.overrideAttrs (_: {
        doCheck = false;
        doInstallCheck = false;
        pytestFlagsArray = [];
        pythonImportsCheck = [];
      });
      peft = pySuper.peft.overrideAttrs (_: {
        doCheck = false;
        doInstallCheck = false;
        pytestFlagsArray = [];
        pythonImportsCheck = [];
      });
      transformers = pySuper.transformers.overrideAttrs (_: {
        doCheck = false;
        doInstallCheck = false;
        pytestFlagsArray = [];
        pythonImportsCheck = [];
      });
      sentence-transformers = pySuper.sentence-transformers.overrideAttrs (_: {
        doCheck = false;
        doInstallCheck = false;
        pytestFlagsArray = [];
        pythonImportsCheck = [];
      });
    };
  };

  infinityApp = p2n.mkPoetryApplication {
    inherit projectDir;
    python = pkgs.python312;
    doCheck = false;
    checkGroups = [];   
    preferWheel = true; 

    postPatch = ''
      substituteInPlace infinity_emb/transformer/utils_optimum.py \
        --replace-fail "from huggingface_hub import HfApi, HfFolder" "from huggingface_hub import HfApi" \
        --replace-fail "HfFolder().get_token()" "None" || true

      substituteInPlace infinity_emb/transformer/acceleration.py \
        --replace-fail "return config.model_type in BetterTransformerManager.MODEL_MAPPING" "return ('BetterTransformerManager' in globals()) and (config.model_type in BetterTransformerManager.MODEL_MAPPING)" || true
    '';

    overrides = p2n.defaultPoetryOverrides.extend (self: super: {
      onnxruntime-gpu = dummyPkg "onnxruntime-gpu";
      tensorrt = dummyPkg "tensorrt";
      openvino = dummyPkg "openvino";
      onnxruntime-openvino = dummyPkg "onnxruntime-openvino";
      openvino-tokenizers = dummyPkg "openvino-tokenizers";
      gputil = dummyPkg "gputil";
      setuptools = pkgs.python312Packages.setuptools;
      huggingface-hub = pkgs.python312Packages.huggingface-hub;
      tokenizers = pkgs.python312Packages.tokenizers;
      numpy = pkgs.python312Packages.numpy;
      scipy = pkgs.python312Packages.scipy;
      torch = pkgs.python312Packages.torch;
      torchvision = pkgs.python312Packages.torchvision;
      safetensors = pkgs.python312Packages.safetensors;
      pillow = pkgs.python312Packages.pillow;
      timm = pkgs.python312Packages.timm;
      maturin = pkgs.python312Packages.maturin;
      pip = pkgs.python312Packages.pip;
      prometheus-fastapi-instrumentator = noCheck pkgs.python312Packages.prometheus-fastapi-instrumentator;
      
      # Additional dependencies often needing source build fixes
      pydantic = noCheck pkgs.python312Packages.pydantic;
      pydantic-core = noCheck pkgs.python312Packages.pydantic-core;
      anyio = noCheck pkgs.python312Packages.anyio;
      starlette = noCheck pkgs.python312Packages.starlette;
      fastapi = noCheck pkgs.python312Packages.fastapi;
    });
  };

in
infinityApp
