# Réflexion sur le déploiement Kubernetes de Kazimierz

Ce document retraçait les tentatives de déploiement de Pangolin sur Kubernetes pour `kazimierz.akn`, jusqu'au choix
d'abandonner Kubernetes. Il est archivé : la décision est prise et documentée dans les ADR.

> [!NOTE]\
> **Archivée le 2026-10-11.** La réflexion est close ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

Le document consignait huit itérations d'architecture pour faire tourner la pile Pangolin sur Kubernetes, puis le
changement de cap vers Ansible et Docker Compose (daté du 2025-01-13).

Les itérations Kubernetes déplaçaient Pangolin vers `apps/`, installaient Traefik et CloudNative-PG par Helm et
donnaient à Gerbil un déploiement dédié. Le document y ajoutait le plugin Barman Cloud pour les sauvegardes, CrowdSec
avec le bouncer Traefik et cert-manager avec Let's Encrypt. Le changement de cap passait ensuite à Pangolin en Docker
Compose déployé par Ansible, en gardant un ArgoCD minimal pour la visibilité GitOps, après une comparaison d'Ansible et
de pyinfra et le choix d'`ansible-pull` pour un déploiement par tirage.

Quatre arguments l'emportaient contre Kubernetes. Il ajoute de la complexité sans bénéfice pour une pile unique.
Pangolin est conçu autour de Docker Compose, et l'adapter à Kubernetes crée une charge de maintenance. Les besoins
d'IPTables de Gerbil contournent de toute façon le réseau Kubernetes. Enfin, les ressources du VPS sont limitées : K3s
et ArgoCD représentent environ 25 % de surcoût.

## Pourquoi il est archivé

La décision de ne pas utiliser Kubernetes pour `kazimierz.akn` est formalisée dans
l'[ADR-008](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md). Le choix d'Ansible et de Docker
Compose qui en découlait a ensuite été remplacé par NixOS (`nixos-anywhere` et `sops-nix`) dans
l'[ADR-016](../decisions/016-kazimierz-nixos-over-ansible.md), qui a supprimé le code Ansible. Ce texte n'est plus qu'un
historique de réflexion : les manifestes Kubernetes et les étapes manuelles qu'il décrit ne correspondent plus à aucun
état du dépôt.

## Texte intégral

Le texte d'origine, en anglais, est figé à
[`projects/kazimierz.akn/docs/archives/REFLEXION-KUBERNETES-DEPLOYMENT.md`](https://github.com/chezmoidotsh/arcane/blob/996fced241ffce850399e83fbca2755549fbd40f/projects/kazimierz.akn/docs/archives/REFLEXION-KUBERNETES-DEPLOYMENT.md)
(commit `996fced2`, dernière version avant la migration de la documentation, issue #1257). Le lien pointe sur un commit
: il reste valable après la suppression du fichier.

## Pour aller plus loin

- [ADR-008 Ansible plutôt que Kubernetes pour Kazimierz](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md)
  : la décision de ne pas déployer `kazimierz.akn` sous Kubernetes.
- [ADR-016 NixOS plutôt qu'Ansible](../decisions/016-kazimierz-nixos-over-ansible.md) : le remplacement d'Ansible et de
  Docker Compose par NixOS.
