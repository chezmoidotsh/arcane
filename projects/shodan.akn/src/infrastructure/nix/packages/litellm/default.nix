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
        --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.nodejs ]}
    '';
  };

  # Extrait schema.prisma depuis le tarball source upstream de litellm.
  # Le fichier se trouve à la racine du repo BerriAI/litellm.
  prismaSchema = pkgs.runCommand "litellm-schema-prisma" {} ''
    cp ${rawLitellm.src}/schema.prisma $out
  '';

in
{
  # Only export the necessary wrapped execution path! No more scripts.
  bin = "${litellmWrapped}/bin/litellm";

  # Le schema.prisma extrait du source upstream, prêt à être copié au runtime.
  schema = prismaSchema;

  meta = with pkgs.lib; {
    description = "LiteLLM pre-configured with NodeJS and Prisma Engines safely for Nix closures";
    maintainers = with maintainers; [ chezmoi ];
    platforms = platforms.darwin;
  };
}
