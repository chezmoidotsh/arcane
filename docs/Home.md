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

| Page                                                                     | Rôle                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [Procédures](procedures/README.md)                                       | Runbooks pas à pas : mises à jour, sauvegardes et restaurations, Omni, Proxmox |
| [Initialiser Lungmen](../projects/lungmen.akn/docs/HOW_TO_BOOTSTRAP.md)  | Création, configuration et amorçage du cluster des applications domestiques    |
| [Initialiser Kazimierz](../projects/kazimierz.akn/docs/BOOTSTRAP.md)     | Création et installation de la passerelle d'accès public (Gateway)             |
| [Initialiser Rimbilliton](../projects/rimbilliton.akn/docs/BOOTSTRAP.md) | Création et installation du serveur Pelican (gaming)                           |

## Reprendre après une panne

| Page                                                                        | Rôle                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Restaurer Rhodes](../projects/rhodes.akn/docs/disaster-recovery/README.md) | Reprise après sinistre du cluster de la plateforme centrale |
| [Incidents](incidents/README.md)                                            | Post-mortems des incidents de production passés             |

## Référence

| Page                                                                       | Rôle                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------- |
| [Architecture & Documentation Réseau](network/README.md)                   | Topologie, plan d'adressage, passerelles et DNS |
| [Renovate](RENOVATE.md)                                                    | Configuration des mises à jour de dépendances   |
| [Décisions d'Architecture](decisions/001-centralized-secret-management.md) | Pourquoi le dépôt est construit ainsi (ADR)     |

## Pour aller plus loin

- [README du dépôt](../README.md) : le projet en un coup d'œil et son histoire.
- [Skill : écrire la documentation](../.agents/skills/documentation-writer/SKILL.md) : comment une page est écrite et le
  guide de style associé.
