# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : kokoro                                                      │
# │ Description : Python environment and models for Kokoro FastAPI.           │
# │ Why         : Custom wheels (phonemizer-fork, espeakng-loader, spacy)     │
# │               are required and must be built because they are missing     │
# │               or failing in nixpkgs. Pre-trained models are also fetched. │
# └───────────────────────────────────────────────────────────────────────────┘
{ pkgs ? import <nixpkgs> {} }:

let
  # ───────────────────────────────────────────────────────────────────────────
  # Kokoro-FastAPI Source
  # Original repository for Kokoro API implementation.
  # ───────────────────────────────────────────────────────────────────────────
  src = pkgs.fetchFromGitHub {
    owner = "remsky";
    repo = "Kokoro-FastAPI";
    rev = "v0.2.4-master";
    hash = "sha256-dAC0Jq7vhKPzt7n09cO4okn8C/AqG294Ds/BJLlWPbk=";
  };

  # ───────────────────────────────────────────────────────────────────────────
  # Python Environment Override
  # Overrides default Python packages to skip broken tests and inject our
  # custom derivations (like phonemizer-fork) directly into the package set.
  # ───────────────────────────────────────────────────────────────────────────
  python = pkgs.python312.override {
    packageOverrides = final: prev: let
      phonemizerForkPkg = prev.buildPythonPackage rec {
        pname = "phonemizer-fork";
        version = "3.3.2";
        format = "wheel";
        src = pkgs.fetchurl {
          url = "https://files.pythonhosted.org/packages/64/f1/0dcce21b0ae16a82df4b6583f8f3ad8e55b35f7e98b6bf536a4dd225fa08/phonemizer_fork-3.3.2-py3-none-any.whl";
          sha256 = "sha256-lzBcdvQYOzgl2uj0wDImX+eMmUbOWMR9S2IWE0kmS3Q=";
        };
        dontWrapPythonPrograms = true;
        propagatedBuildInputs = with final; [
          attrs
          dlinfo
          joblib
          segments
          final."typing-extensions"
        ];
        postInstall = ''
          rm -f $out/bin/.phonemize-wrapped
        '';
        doCheck = false;
      };
    in {
      dlinfo = prev.dlinfo.overridePythonAttrs (old: {
        meta = old.meta // { broken = false; };
        doCheck = false;
      });
      plotly = prev.plotly.overridePythonAttrs (old: {
        doCheck = false;
      });
      wandb = prev.wandb.overridePythonAttrs (old: {
        doCheck = false;
      });
      spacy = prev.spacy.overridePythonAttrs (old: {
        doCheck = false;
      });
      phonemizer = phonemizerForkPkg;
      "phonemizer-fork" = phonemizerForkPkg;
    };
  };
  pythonPkgs = python.pkgs;

  # ───────────────────────────────────────────────────────────────────────────
  # espeakng-loader
  # Dependency for text-to-speech, provided as a pre-built macOS wheel.
  # ───────────────────────────────────────────────────────────────────────────
  espeakngLoader = pythonPkgs.buildPythonPackage rec {
    pname = "espeakng-loader";
    version = "0.2.4";
    format = "wheel";
    src = pkgs.fetchurl {
      url = "https://files.pythonhosted.org/packages/a8/26/258c0cd43b9bc1043301c5f61767d6a6c3b679df82790c9cb43a3277b865/espeakng_loader-0.2.4-py3-none-macosx_11_0_arm64.whl";
      sha256 = "sha256-0nzcoxESIm5ymdhWLoidPjih5IBVye44G0XWaQcu5Z8=";
    };
    doCheck = false;
  };

  # ───────────────────────────────────────────────────────────────────────────
  # spaCy Model (en_core_web_sm)
  # Pre-trained English language model required by Kokoro for text processing.
  # ───────────────────────────────────────────────────────────────────────────
  spacyModelEnCoreWebSm = pythonPkgs.buildPythonPackage rec {
    pname = "en-core-web-sm";
    version = "3.8.0";
    format = "wheel";
    src = pkgs.fetchurl {
      url = "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl";
      sha256 = "sha256-GTJCnbcn1L/z3u1rNM/AXfF3lPSlLusmz4ko98Gg+4U=";
    };
    doCheck = false;
  };

  # ───────────────────────────────────────────────────────────────────────────
  # text2num
  # Built from PyPI source because it is missing in the Nixpkgs Python set.
  # ───────────────────────────────────────────────────────────────────────────
  text2numPkg = pythonPkgs.buildPythonPackage rec {
    pname = "text2num";
    version = "2.5.1";
    pyproject = true;
    src = pkgs.fetchPypi {
      inherit pname version;
      sha256 = "sha256-wGAgH6JLe5fzGQBF6V5vKyg656wXLL5IKjpO8G6yCMQ=";
    };
    build-system = with pythonPkgs; [ setuptools wheel ];
    doCheck = false;
  };

  # ───────────────────────────────────────────────────────────────────────────
  # Final Python Environment
  # Constructs the final Python environment with all required pip packages,
  # including the custom ones we defined above.
  # ───────────────────────────────────────────────────────────────────────────
  pythonEnv = python.withPackages (ps: with ps; [
    aiofiles
    av
    click
    espeakngLoader
    fastapi
    inflect
    kokoro
    loguru
    matplotlib
    misaki
    munch
    mutagen
    numpy
    openai
    phonemizer
    ps."pydantic-settings"
    ps."python-dotenv"
    psutil
    pydantic
    pydub
    regex
    requests
    scipy
    soundfile
    spacy
    spacyModelEnCoreWebSm
    sqlalchemy
    text2numPkg
    tiktoken
    torch
    tqdm
    uvicorn
  ]);

  # ───────────────────────────────────────────────────────────────────────────
  # Pre-trained Models
  # Fetch and bundle the Kokoro neural network weights and configuration.
  # ───────────────────────────────────────────────────────────────────────────
  models = let 
    weights = pkgs.fetchurl {
      url = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/f3ff3571791e39611d31c381e3a41a3af07b4987/kokoro-v1_0.pth";
      sha256 = "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4";
    };
    config = pkgs.fetchurl {
      url = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/f3ff3571791e39611d31c381e3a41a3af07b4987/config.json";
      sha256 = "5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f";
    };
  in pkgs.stdenvNoCC.mkDerivation {
    pname = "kokoro-models";
    version = "v1_0";
    dontUnpack = true;
    installPhase = ''
      mkdir -p $out
      install -m 0644 ${weights} $out/kokoro-v1_0.pth
      install -m 0644 ${config} $out/config.json
    '';
  };

  # ───────────────────────────────────────────────────────────────────────────
  # Janitor Script
  # Utility script to clean up temporary audio files older than 60 minutes.
  # ───────────────────────────────────────────────────────────────────────────
  janitor = pkgs.writeShellScriptBin "kokoro-janitor" ''
    #!${pkgs.bash}/bin/bash
    # Deletes files in the specified directory that are older than 60 minutes.

    if [ -z "$1" ]; then
      echo "Usage: kokoro-janitor <directory_path>"
      exit 1
    fi

    echo "Cleaning up files in $1 older than 60 minutes..."
    ${pkgs.findutils}/bin/find "$1" -type f -mmin +60 -print -delete
  '';

in {
  inherit src models;
  janitor = "${janitor}/bin/kokoro-janitor";
  bin = "${pythonEnv}/bin/uvicorn";
}
