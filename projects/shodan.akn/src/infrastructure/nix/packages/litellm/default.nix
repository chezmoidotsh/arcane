{ pkgs ? import <nixpkgs> {} }:

let
  python = pkgs.python312.override {
    packageOverrides = final: prev: {
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
    };
  };
in
python.withPackages (ps: with ps; [
  litellm
  fastapi
  uvicorn
  python-multipart
])
