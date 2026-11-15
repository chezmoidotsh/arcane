<p align="center">
  <img alt="Ptilopsis, logo animé" src="./assets/logo.webp" height="150">
</p>

<h1 align="center">「ptilopsis.akn」</h1>

<p align="center"><strong>Mac Studio — là où sont stockées les données d'observabilité</strong></p>

<p align="center">
  <img alt="host: Mac Studio M1" src="https://img.shields.io/badge/host-Mac_Studio_M1-000000?logo=apple&logoColor=white">
  <img alt="os: macOS" src="https://img.shields.io/badge/os-macOS-000000?logo=macos&logoColor=white">
  <img alt="arch: aarch64-darwin" src="https://img.shields.io/badge/arch-aarch64--darwin-blue">
  <img alt="config: nix-darwin" src="https://img.shields.io/badge/config-nix--darwin-5277C3?logo=nixos&logoColor=white">
  <img alt="deploy: mise" src="https://img.shields.io/badge/deploy-mise_%2B_darwin--rebuild-orange">
</p>

<p align="center">
  <a href="#rôle">Rôle</a> ·
  <a href="#accès">Accès</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#déploiement">Déploiement</a> ·
  <a href="#contribuer">Contribuer</a> ·
  <a href="#pour-aller-plus-loin">Pour aller plus loin</a>
</p>

> [!NOTE]\
> **Ptilopsis** (Rhine Lab, médecin) a servi de cobaye à un prototype qui utilisait un humain comme support de calcul
> pour décoder l'information stockée dans l'Originium. L'expérience a mal tourné : on lui a implanté une puce qui prend
> en charge une partie de son cerveau, et elle est la première personne de Columbia à avoir survécu à une telle
> opération. _Seul le langage machine apaise ses troubles, un bon nom pour la machine qui lit tous les logs du homelab._
> ([source](https://arknights.wiki.gg/wiki/Ptilopsis))

## Rôle

Ptilopsis garde les données d'observabilité du homelab : métriques, logs et traces y sont stockés, et c'est de là que
partent les alertes. Elle vit volontairement en dehors des clusters Kubernetes, pour que les signaux et le heartbeat
continuent d'arriver quand l'un d'eux tombe
([ADR-022](../../../docs/decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md)).

## Accès

VictoriaMetrics, VictoriaLogs, VictoriaTraces et Alertmanager y tourneront. La machine elle-même ne se pilote qu'en
partage d'écran : pas de SSH.

## Configuration

Pour l'instant, `nix/configuration.nix` ne pose que le minimum d'un serveur nix-darwin : le nom de la machine, la
plateforme, les réglages Nix et un utilisateur `admin` provisoire. Les données iront sur un volume APFS dédié, plafonné
à 250 Go (une limite, pas une réservation), à créer sur le bon disque et jamais sur le disque système.

## Déploiement

La première installation se fait à la main, une seule fois : installer macOS, créer le compte admin, activer le partage
d'écran, générer la clé de la machine (`sudo ssh-keygen -A`), installer Nix et cloner le dépôt. Remplacer ensuite
l'utilisateur provisoire `admin` dans `configuration.nix` par le vrai compte, puis, depuis `nix/` :

```sh
sudo nix run nix-darwin/nix-darwin-26.05#darwin-rebuild -- switch --flake .#ptilopsis
```

Ensuite, `mise run nix:switch` suffit : il demande confirmation puis lance `sudo darwin-rebuild switch`. La commande est
ignorée hors macOS et tant que nix-darwin n'est pas installé, c'est pour ça que la première installation reste manuelle.

## Contribuer

`mise run nix:eval` évalue la configuration sans la construire ni l'activer, sur n'importe quelle machine avec Nix : il
doit passer avant chaque commit. Ce dossier ne contient que ce qui est propre à cette machine, les modules partagés vont
dans `catalog/nix`. Les commits suivent la convention du dépôt (`+[fleet:ptilopsis.akn]: …`), voir
[AGENTS.md](../../../AGENTS.md).

## Pour aller plus loin

- [ADR-022](../../../docs/decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md) : pourquoi
  l'observabilité vit sur un Mac Studio dédié.
- [Plan de migration](../../../docs/migrations/MIGR-20261115-00-Migrer-l-Observabilite-vers-le-Mac-Studio.md) : les
  étapes pour y arriver.
- [ADR-013](../../../docs/decisions/ADR-013-Observabilite-Centralisee-VictoriaMetrics-sur-LXC.md) : l'observabilité
  centralisée sur la stack VictoriaMetrics.
- [ADR-018](../../../docs/decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md)
  : OTLP comme seul protocole d'ingestion.
- [README de l'appliance](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/o11y-datastore/README.md) : les
  chemins exposés et le test de fumée.
- [Agent d'observabilité](../../../catalog/nix/modules/o11y-agent/README.md) : ce qui envoie les données.
- [Nommage des machines](../../../docs/reference/Nommage-des-Machines-Reference.md) : d'où vient le nom `ptilopsis`.
