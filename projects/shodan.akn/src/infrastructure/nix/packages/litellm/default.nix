# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : litellm                                                     │
# │ Description : Python environment for LiteLLM.                             │
# │ Why         : Disables failing checks for broken dependencies (dlinfo,    │
# │               plotly, wandb) to allow building on our current nixpkgs     │
# │               channel.                                                    │
# └───────────────────────────────────────────────────────────────────────────┘
{ pkgs ? import <nixpkgs> {} }:

{

  # Returns the path to the litellm binary from a custom Python environment
  bin = let
    python = pkgs.python312.override {
      packageOverrides = final: prev: {
        # LiteLLM needs extra dependencies for its proxy functionality
        litellm = prev.litellm.overridePythonAttrs (old: {
          propagatedBuildInputs = (old.propagatedBuildInputs or []) ++ [
            final.backoff
            final.fastapi
            final.uvicorn
            final.python-multipart
            final.orjson
            final.apscheduler
            final.gunicorn
          ];
        });

        # Disable failing checks for broken dependencies to allow building on our channel
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
    
    # Create an environment containing our overridden LiteLLM
    env = python.withPackages (ps: [ ps.litellm ]);
  in
    "${env}/bin/litellm";
}

