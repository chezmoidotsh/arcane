{ pkgs ? import <nixpkgs> {} }:

let
  # 1. We override the Python package set strictly to inject Prisma client generation
  # directly at build time using the upstream schema, removing the need for any 
  # runtime bash scripts.
  myPython = pkgs.python3.override {
    packageOverrides = self: super: {
      prisma = super.prisma.overridePythonAttrs (old: {
        nativeBuildInputs = (old.nativeBuildInputs or []) ++ [ pkgs.prisma-engines pkgs.nodejs ];
        postInstall = (old.postInstall or "") + ''
          echo "Generating Prisma client for LiteLLM schema..."
          
          # Prisma client needs the engines correctly defined locally to generate the code
          export PRISMA_CLIENT_ENGINE_TYPE="binary"
          export PRISMA_CLI_QUERY_ENGINE_TYPE="binary"
          export PRISMA_FMT_BINARY="${pkgs.prisma-engines}/bin/prisma-fmt"
          export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines}/bin/query-engine"
          export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
          export ENGINES_VERSION="${pkgs.prisma-engines.version}"
          export HOME=$TMPDIR
          
          # We extract the upstream schema natively from the litellm source!
          cp ${super.litellm.src}/litellm/proxy/schema.prisma ./schema.prisma
          chmod +w ./schema.prisma
          
          # Execute the prisma code generator using the exact Python executable!
          # This writes the generated schema natively into the site-packages folder itself.
          PYTHONPATH=$out/${pkgs.python3.sitePackages} $out/bin/prisma generate --schema=./schema.prisma
        '';
      });

      litellm = super.litellm.overridePythonAttrs (old: {
        # Propagate proxy dependencies to resolve any missing python module issues during startup
        propagatedBuildInputs = (old.propagatedBuildInputs or [])
          ++ (old.passthru.optional-dependencies.proxy or [])
          ++ (old.passthru.optional-dependencies.extra_proxy or []);
      });
    };
  };

  # Extract the deeply fixed LiteLLM 
  rawLitellm = myPython.pkgs.litellm;

  # 2. Re-wrap the final litellm binary so that it executes with the required 
  # Prisma runtime engine variables explicitly defined natively in the bash ENV 
  # (solving issue #10024 without hacky start scripts).
  litellmWrapped = pkgs.symlinkJoin {
    name = "litellm-wrapped";
    paths = [ rawLitellm ];
    nativeBuildInputs = [ pkgs.makeWrapper ];
    postBuild = ''
      wrapProgram $out/bin/litellm \
        --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.nodejs ]} \
        --set PRISMA_CLIENT_ENGINE_TYPE "binary" \
        --set PRISMA_CLI_QUERY_ENGINE_TYPE "binary" \
        --set PRISMA_FMT_BINARY "${pkgs.prisma-engines}/bin/prisma-fmt" \
        --set PRISMA_QUERY_ENGINE_BINARY "${pkgs.prisma-engines}/bin/query-engine" \
        --set PRISMA_SCHEMA_ENGINE_BINARY "${pkgs.prisma-engines}/bin/schema-engine"
    '';
  };

in
{
  # Only export the necessary wrapped execution path! No more scripts.
  bin = "${litellmWrapped}/bin/litellm";
  
  meta = with pkgs.lib; {
    description = "LiteLLM pre-configured with generated Prisma client safely for Nix closures";
    maintainers = with maintainers; [ chezmoi ];
    platforms = platforms.darwin;
  };
}
