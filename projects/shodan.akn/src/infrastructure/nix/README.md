# Shodan Infrastructure (Nix)

Configuration nix-darwin user-level pour Caddy, LiteLLM et Kokoro (chemins XDG dans le home).

## Installation

1. Installer Lix : `curl -sSf -L https://install.lix.systems/lix | sh -s -- install`
2. Installer mise : `curl https://mise.run | sh`
3. Installer Caffeine (pour éviter la mise en veille au démarrage) : `brew install --cask caffeine`
4. Aller dans le dossier : `cd projects/shodan.akn/src/infrastructure/nix`
5. Configurer `username` dans `flake.nix`.
6. Appliquer la config : `nix run nix-darwin -- switch --flake .#shodan`
7. Se reconnecter pour lancer les services `launchd` user-level.

Chemins XDG :
- Config : `~/.config`
- Données : `~/.local/share`
- Logs : `~/.local/state/log`

## Build & Apply (nix-darwin)

Run these commands from the repo root:

- Build only (no system changes):
  - `nix build ./projects/shodan.akn/src/infrastructure/nix#darwinConfigurations.shodan.system`

- Apply to the system:
  - `nix run nix-darwin -- switch --flake ./projects/shodan.akn/src/infrastructure/nix#shodan`

## Lint (Nix)

Run these commands from the repo root:

1. `nix run nixpkgs#statix -- check projects/shodan.akn/src/infrastructure/nix`
2. `nix run nixpkgs#deadnix -- projects/shodan.akn/src/infrastructure/nix`
3. `nix run nixpkgs#alejandra -- --check projects/shodan.akn/src/infrastructure/nix`

To auto-format:

- `nix run nixpkgs#alejandra -- projects/shodan.akn/src/infrastructure/nix`
