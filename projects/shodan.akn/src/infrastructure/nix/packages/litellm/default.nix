{ pkgs ? import <nixpkgs> {} }:

let
  # On utilise le paquet upstream litellm (qui peut inclure les overlays locaux pour résoudre "backoff")
  rawLitellm = pkgs.litellm;

  # On enrobe simplement le binaire pour injecter NodeJS et les variables Prisma
  # sans AUCUN override du paquet Python, pour ne pas casser l'environnement.
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
    description = "LiteLLM pre-configured with NodeJS and Prisma Engines safely for Nix closures";
    maintainers = with maintainers; [ chezmoi ];
    platforms = platforms.darwin;
  };
}
