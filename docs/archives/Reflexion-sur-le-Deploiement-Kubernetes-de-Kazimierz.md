# Réflexion sur le déploiement Kubernetes de Kazimierz

Ce document retraçait les tentatives de déploiement de Pangolin sur Kubernetes pour `kazimierz.akn`, jusqu'au choix
d'abandonner Kubernetes. Il est archivé : la décision est prise et documentée dans les ADR.

> [!NOTE]\
> **Archivée le 2026-10-11.** La réflexion est close ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

Le document consignait huit itérations d'architecture pour faire tourner la pile Pangolin sur Kubernetes, puis le
changement de cap vers Ansible et Docker Compose (daté du 2025-01-13).

| Thème                 | Contenu                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Itérations Kubernetes | Déplacement de Pangolin vers `apps/`, Traefik et CloudNative-PG via Helm, Gerbil en déploiement dédié       |
| Composants ajoutés    | Plugin Barman Cloud pour les sauvegardes, CrowdSec avec le bouncer Traefik, cert-manager avec Let's Encrypt |
| Bascule vers Ansible  | Pangolin en Docker Compose déployé par Ansible, ArgoCD minimal conservé pour la visibilité GitOps           |
| Choix de l'outil      | Comparaison d'Ansible et de pyinfra, `ansible-pull` pour le déploiement par tirage (pull)                   |

Les arguments retenus contre Kubernetes :

- Kubernetes ajoute de la complexité sans bénéfice pour une pile unique.
- Pangolin est conçu autour de Docker Compose ; l'adapter à Kubernetes crée une charge de maintenance.
- Les besoins d'IPTables de Gerbil contournent de toute façon le réseau Kubernetes.
- Les ressources du VPS sont limitées : K3s et ArgoCD représentent environ 25 % de surcoût.

## Pourquoi il est archivé

La décision de ne pas utiliser Kubernetes pour `kazimierz.akn` est formalisée dans
l'[ADR-008](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md). Le choix d'Ansible et de Docker
Compose qui en découlait a ensuite été remplacé par NixOS (`nixos-anywhere` et `sops-nix`) dans
l'[ADR-016](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md), qui a supprimé le code Ansible. Ce texte
n'est plus qu'un historique de réflexion : les manifestes Kubernetes et les étapes manuelles qu'il décrit ne
correspondent plus à aucun état du dépôt.

## Texte intégral

Le texte d'origine est dans l'historique Git, sous le chemin
`projects/kazimierz.akn/docs/archives/REFLEXION-KUBERNETES-DEPLOYMENT.md`, dans le dernier commit qui précède son
archivage (issue #1257).

## Pour aller plus loin

- [ADR-008 Ansible + Docker Compose plutôt que Kubernetes](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md)
  : la décision de ne pas déployer `kazimierz.akn` sous Kubernetes.
- [ADR-016 NixOS plutôt qu'Ansible](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md) : le remplacement
  d'Ansible et de Docker Compose par NixOS.
