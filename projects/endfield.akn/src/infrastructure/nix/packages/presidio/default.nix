{ pkgs ? import <nixpkgs> { } }:

let
  python = pkgs.python312.override {
    packageOverrides = final: prev:
      {
        spacy = prev.spacy.overridePythonAttrs (old: {
          doCheck = false;
        });
        
        en-core-web-sm = prev.buildPythonPackage rec {
          pname = "en-core-web-sm";
          version = "3.8.0";
          format = "wheel";
          src = pkgs.fetchurl {
            url = "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl";
            sha256 = "sha256-GTJCnbcn1L/z3u1rNM/AXfF3lPSlLusmz4ko98Gg+4U=";
          };
          doCheck = false;
        };

        presidio-analyzer = prev.buildPythonPackage rec {
          pname = "presidio-analyzer";
          version = "2.2.361";
          format = "wheel";
          src = pkgs.fetchurl {
            url = "https://files.pythonhosted.org/packages/f7/47/5f07857a3ae4bea36cb631adc6899ef58081cb37ad1901aab01b6a8b2849/presidio_analyzer-2.2.361-py3-none-any.whl";
            sha256 = "7054b36303f5f47dd4bb3b00600bc936fb46aa3cc5e6befde3de839f0205f7f2";
          };
          doCheck = false;
          propagatedBuildInputs = with final; [ spacy requests pyyaml phonenumbers tldextract ];
        };

        presidio-anonymizer = prev.buildPythonPackage rec {
          pname = "presidio-anonymizer";
          version = "2.2.361";
          format = "wheel";
          src = pkgs.fetchurl {
            url = "https://files.pythonhosted.org/packages/5c/21/2f90005c3242b783a376848040f4e96991b3c5b4d95080a74befce5066c7/presidio_anonymizer-2.2.361-py3-none-any.whl";
            sha256 = "ff0f64c234aa7ac37042cf7f187ed4a47587cff65418304d716af7d194c96ed3";
          };
          doCheck = false;
          propagatedBuildInputs = with final; [ pycryptodome ];
        };
      };
  };

  # Construct the virtual environment
  pythonEnv = python.withPackages (ps: with ps; [
    fastapi
    uvicorn
    pydantic
    presidio-analyzer
    presidio-anonymizer
    spacy
    en-core-web-sm
  ]);

in
{
  src = ./src;
  bin = "${pythonEnv}/bin/uvicorn";
}
