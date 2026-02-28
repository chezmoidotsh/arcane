# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : litellm                                                     │
# │ Description : Python environment for LiteLLM.                             │
# │ Why         : Disables failing checks for broken dependencies (dlinfo,    │
# │               plotly, wandb) to allow building on our current nixpkgs     │
# │               channel.                                                    │
# └───────────────────────────────────────────────────────────────────────────┘
{ pkgs ? import <nixpkgs> {} }:

{
  bin = let
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
    backoff
  ]);
}
