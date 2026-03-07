{
  description = "Infinity embedding server - quick prototyping flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        infinity = pkgs.callPackage ./default.nix { };
      in
      {
        packages = {
          default = infinity;
          infinity = infinity;
        };

        apps = {
          default = {
            type = "app";
            program = "${infinity}/bin/infinity_emb";
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [ infinity ];
          shellHook = ''
            echo "🚀 Infinity embedding server available"
            echo "Run: infinity_emb --help"
            echo ""
            echo "Example usage:"
            echo "  infinity_emb v2 --model-id BAAI/bge-small-en-v1.5"
          '';
        };
      }
    );
}
