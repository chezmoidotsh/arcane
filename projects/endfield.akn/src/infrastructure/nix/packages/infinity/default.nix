{ pkgs ? import <nixpkgs> { } }:

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : infinity                                                     │
# │ Description : Python environment for infinity-emb embedding/reranking      │
# │               server with MPS (Metal) acceleration.                        │
# │ Why         : infinity-emb is not packaged in nixpkgs; we build it from    │
# │               the PyPI wheel and pull core ML deps from nixpkgs.           │
# └───────────────────────────────────────────────────────────────────────────┘
let
  # ───────────────────────────────────────────────────────────────────────────
  # Python Environment Override
  # Overrides default Python packages to skip broken tests on darwin.
  # ───────────────────────────────────────────────────────────────────────────
  python = pkgs.python312.override {
    packageOverrides = final: prev:
      {

        spacy = prev.spacy.overridePythonAttrs (old: {
          doCheck = false;
        });
        accelerate = prev.accelerate.overridePythonAttrs (old: {
          doCheck = false;
        });
        sentence-transformers = prev.sentence-transformers.overridePythonAttrs (old: {
          doCheck = false;
        });
        jupyter = prev.jupyter.overridePythonAttrs (old: {
          doCheck = false;
        });
        notebook = prev.notebook.overridePythonAttrs (old: {
          doCheck = false;
        });
      };
  };
  pythonPkgs = python.pkgs;

  # ───────────────────────────────────────────────────────────────────────────
  # prometheus-fastapi-instrumentator
  # Required by infinity-emb[server] — may be missing or out-of-date in
  # nixpkgs, so we fetch the wheel directly.
  # ───────────────────────────────────────────────────────────────────────────
  prometheusFastapiInstrumentator = pythonPkgs.buildPythonPackage rec {
    pname = "prometheus-fastapi-instrumentator";
    version = "7.0.2";
    format = "wheel";
    src = pkgs.fetchurl {
      url = "https://files.pythonhosted.org/packages/f1/f7/a67e804853d05b3f1f5def0ebd662b9f48dbcfe0b452f0aa5d4c183a6f86/prometheus_fastapi_instrumentator-7.0.2-py3-none-any.whl";
      sha256 = "975e39992acb7a112758ff13ba95317e6c54d1bbf605f9156f31ac9f2800c32d";
    };
    doCheck = false;
    propagatedBuildInputs = with pythonPkgs; [
      prometheus-client
      fastapi
      starlette
    ];
  };

  # ───────────────────────────────────────────────────────────────────────────
  # infinity-emb
  # The core embedding/reranking server, built from PyPI source (tar.gz).
  # We build from source instead of a wheel so that pythonRelaxDepsHook
  # can natively patch the pyproject.toml requirements before packaging.
  # ───────────────────────────────────────────────────────────────────────────
  infinityEmb = pythonPkgs.buildPythonPackage rec {
    pname = "infinity-emb";
    version = "0.0.77";
    format = "pyproject";
    src = pkgs.fetchurl {
      url = "https://files.pythonhosted.org/packages/5c/78/41733353cee591332a528971c4e81816af389ae6b669dc43893f68805073/infinity_emb-0.0.77.tar.gz";
      sha256 = "f7143b162530c5431f4439d1836e4d807daf16ad7819c9da5885e9d43b9d9c82";
    };

    nativeBuildInputs = with pythonPkgs; [
      poetry-core
      pythonRelaxDepsHook
    ];

    # Relax strict requirement on numpy < 2 
    pythonRelaxDeps = [ "numpy" ];

    # The tests require a running backend or more complex setup, so we disable them
    doCheck = false;

    propagatedBuildInputs = with pythonPkgs; [
      # Core
      numpy
      huggingface-hub

      # Server extras
      fastapi
      orjson
      prometheusFastapiInstrumentator
      pydantic
      rich
      typer
      uvicorn

      # Torch / ML extras
      torch
      sentence-transformers
      transformers
      einops
      pillow

      # Cache
      diskcache
    ];
  };

  # ───────────────────────────────────────────────────────────────────────────
  # Final Python Environment
  # Assembles a complete venv-like environment with infinity_emb and its
  # transitive deps available on PYTHONPATH.
  # ───────────────────────────────────────────────────────────────────────────
  pythonEnv = python.withPackages (ps: with ps; [
    infinityEmb

    # Core ML
    torch
    sentence-transformers
    transformers
    einops
    numpy
    pillow

    # Server
    fastapi
    uvicorn
    orjson
    pydantic
    rich
    typer
    prometheusFastapiInstrumentator

    # Utilities
    huggingface-hub
    diskcache
  ]);

in
{
  bin = "${pythonEnv}/bin/infinity_emb";
}
