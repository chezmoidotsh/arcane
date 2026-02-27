# Shodan Infrastructure (Nix)

Configuration darwin-nix pour Caddy, LiteLLM et Kokoro.

## Installation

1. Installer Nix : `curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install`
2. Installer SOPS et Age : `brew install sops age`
3. Configurer la clé de déchiffrement :
   - `mkdir -p ~/.config/sops/age`
   - Si tu as déjà une clé publique dans `.sops.yaml`, assure-toi que la clé privée correspondante est dans `~/.config/sops/age/keys.txt`.
   - Sinon, génère une clé : `age-keygen -o ~/.config/sops/age/keys.txt` et ajoute la clé publique dans `.sops.yaml`.
4. Éditer les secrets : `sops secrets/secrets.yaml`
5. Appliquer la config : `nix run nix-darwin -- switch --flake .#shodan-mac`
