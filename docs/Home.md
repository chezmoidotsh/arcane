# Home

Arcane est un homelab personnel géré via du code : deux clusters Kubernetes Talos Linux et quelques hôtes autonomes,
déployés en GitOps (ArgoCD), avec Pulumi pour l'infrastructure et OpenBao pour les secrets. Ce répertoire contient la
documentation du dépôt. Il fait foi, se lit directement dans Git et est reflété sur le GitHub Wiki à chaque fusion dans
`main`.

> [!NOTE]\
> La documentation est en cours de migration vers un standard commun (issue
> [#1257](https://github.com/chezmoidotsh/arcane/issues/1257)). Les pages listées dans [`.wiki-legacy`](.wiki-legacy) ne
> sont pas encore migrées : elles sont liées ci-dessous depuis leur emplacement actuel.

## Exploiter les clusters

| Page                                                                                                                                          | Rôle                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Créer un cluster Talos avec Omni](procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md)                                      | Monter un cluster Talos sur Proxmox, du provisionnement à l'enregistrement GitOps |
| [Mettre à jour Talos avec Omni](procedures/infrastructure/INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md)                                   | Changer la version de Talos d'un cluster                                          |
| [Mettre à jour Kubernetes avec Omni](procedures/infrastructure/INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md)                         | Changer la version de Kubernetes d'un cluster                                     |
| [Mettre à jour un LXC par échange du rootfs](procedures/infrastructure/INF-20260605-00-Mettre-a-Jour-un-LXC-par-Echange-du-Rootfs.md)         | Déployer une nouvelle image d'un conteneur LXC                                    |
| [Provisionner le SDN Proxmox](procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md)                                       | Réseau défini par logiciel des clusters Talos                                     |
| [Gérer l'état Pulumi et importer des ressources](procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md) | Backend d'état Pulumi et import de ressources existantes                          |
| [Initialiser Lungmen](guides/Initialiser-Lungmen.md)                                                                                          | Création, configuration et amorçage du cluster des applications domestiques       |
| [Initialiser Kazimierz](guides/Initialiser-Kazimierz.md)                                                                                      | Création et installation de la passerelle d'accès public (Gateway)                |
| [Initialiser Rimbilliton](guides/Initialiser-Rimbilliton.md)                                                                                  | Création et installation du serveur Pelican (gaming)                              |

## Reprendre après une panne

| Page                                                                                          | Rôle                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Plan de reprise après sinistre](plan-de-reprise/brouillon/Plan-de-Reprise-apres-Sinistre.md) | Carte des interdépendances et ordre de reconstruction de toute la flotte |
| [Restaurer Rhodes](plan-de-reprise/brouillon/Restaurer-Rhodes.md)                             | Reprise après sinistre du cluster de la plateforme centrale              |
| [Restaurer OpenBao](plan-de-reprise/brouillon/Restaurer-OpenBao.md)                           | Restaurer la base de données d'OpenBao après la perte de rhodes          |
| [Restaurer Pocket-Id](plan-de-reprise/brouillon/Restaurer-Pocket-Id.md)                       | Restaurer la base de données de Pocket-Id après la perte de rhodes       |
| [Incidents](incidents/README.md)                                                              | Post-mortems des incidents de production passés                          |

## Référence

| Page                                                                       | Rôle                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Architecture & Documentation Réseau](reference/Reseau-Reference.md)       | Topologie, plan d'adressage, passerelles et DNS             |
| [Plan d'adressage (IPAM)](reference/IPAM-Reference.md)                     | Réseaux, VLAN, pools d'adresses et identifiants de clusters |
| [Passerelles et DNS](reference/Passerelles-et-DNS-Reference.md)            | Passerelles interne et externe, répartition du DNS          |
| [Renovate](reference/Renovate-Reference.md)                                | Configuration des mises à jour de dépendances               |
| [Décisions d'Architecture](decisions/001-centralized-secret-management.md) | Pourquoi le dépôt est construit ainsi (ADR)                 |

## Pour aller plus loin

- [README du dépôt](../README.md) : le projet en un coup d'œil et son histoire.
- [Skill : écrire la documentation](../.agents/skills/documentation-writer/SKILL.md) : comment une page est écrite et le
  guide de style associé.
