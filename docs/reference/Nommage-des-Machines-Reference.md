# Nommage des machines Reference

Règle de nommage de chaque cluster et de chaque machine du dépôt, forme du nom selon l'endroit où il est utilisé, et
inventaire de tous les éléments. Cette page est la source de vérité des noms ; l'organisation du dépôt est dans
[Architecture du dépôt](Architecture-du-Depot-Reference.md), la raison du choix dans
[ADR-021](../decisions/ADR-021-Passer-d-une-Vue-Projet-a-une-Vue-Flotte.md).

## Règle

Chaque élément a un **nom canonique** `<nom>.<famille>`, dans l'ordre d'un FQDN. Le **dossier** sous `fleet/` est le
même nom avec les segments inversés (`a.b.c.d` devient `d.c.b.a`), pour que `ls` regroupe clusters et machines par
famille.

| Nom canonique | Dossier                     |
| ------------- | --------------------------- |
| `rhodes.akn`  | `fleet/clusters/akn.rhodes` |
| `closure.akn` | `fleet/hosts/akn.closure`   |
| `pve-01.core` | `fleet/hosts/core.pve-01`   |

La règle est mécanique : aucune annotation supplémentaire n'est nécessaire. Les ApplicationSets d'ArgoCD peuvent dériver
le dossier de la valeur de l'annotation `device.tailscale.com/hostname` des secrets de cluster, en inversant ses
segments dans le gabarit Go.

## Familles

| Famille          | Contenu                                                                                                                 | Noms                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `core`           | Ce qui tourne directement dans l'hyperviseur et dont le reste de la chaîne dépend : l'hyperviseur, ses LXC, PBS, le NAS | Fonctionnels (`pve-01`, `omni`, `nas`) |
| `akn` (clusters) | Les clusters Kubernetes                                                                                                 | Vaisseaux et lieux d'Arknights         |
| `akn` (hôtes)    | Les autres machines                                                                                                     | Personnages ou groupes d'Arknights     |

> [!NOTE]\
> Le lore d'Arknights est le fil rouge du nommage : les clusters et les hôtes de la famille `akn` portent des noms tirés
> de l'univers. Les noms de la famille `core` restent fonctionnels et n'ont rien à voir avec le lore.

Les clusters et les hôtes de la famille `akn` ont volontairement des catégories de noms différentes : le nom dit si l'on
parle d'un cluster ou d'un hôte. La vue est par machine, donc chaque machine a un nom.

## Où chaque forme du nom est utilisée

| Endroit                                         | Forme                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Dossier sous `fleet/`                           | Inversée : `akn.rhodes`                                                                                          |
| Nom Tailscale                                   | Canonique : `rhodes.akn`                                                                                         |
| OpenBao                                         | Canonique : montage `rhodes.akn/` (clusters), préfixe `hosts/closure.akn/` (hôtes)                               |
| Projet Pulumi (`name:` de `Pulumi.yaml`)        | Canonique, `.` remplacé par `-`, sans suffixe : `horn-akn`, `pve-01-core`. La fondation commune est `base`       |
| Pile Pulumi                                     | Proposition : canonique, `.` remplacé par `_`, suffixe `.live` : `horn_akn.live` (`base.live` pour la fondation) |
| Nom d'hôte NixOS et nom Tailscale d'une machine | Canonique (`horn.akn`)                                                                                           |
| Contexte kube (clusters)                        | Le nom canonique du cluster                                                                                      |
| Scope de commit                                 | `fleet:<nom canonique>` (`fleet:rhodes.akn`)                                                                     |

## Inventaire

| Nom canonique                      | Dossier                                        | Nature                                                           | Origine du nom                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rhodes.akn`                       | `fleet/clusters/akn.rhodes`                    | Cluster Talos, plateforme centrale, hub ArgoCD                   | Rhodes Island, le vaisseau-île de la faction                                                                                                                                                                                    |
| `lungmen.akn`                      | `fleet/clusters/akn.lungmen`                   | Cluster Talos, applications domestiques                          | Lungmen, lieu d'Arknights                                                                                                                                                                                                       |
| `closure.akn`                      | `fleet/hosts/akn.closure`                      | Machine Home Assistant OS ; seul son Pulumi est dans le dépôt    | Closure, ingénieure de Rhodes Island qui fait tourner la base : la domotique                                                                                                                                                    |
| `horn.akn`                         | `fleet/hosts/akn.horn`                         | VPS OCI NixOS, passerelle Pangolin                               | Horn, défenseuse de Victoria en armure lourde qui tient la ligne de front : la passerelle exposée                                                                                                                               |
| `exusiai.akn`                      | `fleet/hosts/akn.exusiai`                      | VPS OCI NixOS, serveur de jeux                                   | Exusiai, la fêtarde de Penguin Logistics qui ne pense qu'à s'amuser                                                                                                                                                             |
| `ptilopsis.akn`                    | `fleet/hosts/akn.ptilopsis`                    | Mac Studio, appliance d'observabilité et charges d'IA            | Ptilopsis, médecin de Rhine Lab qui soigne plusieurs alliés à la fois et parle comme un système informatique, en rapports d'état : la machine veille sur la santé de la flotte (observabilité) et fait tourner les modèles d'IA |
| `pve-01.core`                      | `fleet/hosts/core.pve-01`                      | Hyperviseur Proxmox                                              | Nom fonctionnel                                                                                                                                                                                                                 |
| `pbs.core`                         | `fleet/hosts/core.pbs`                         | Proxmox Backup Server                                            | Nom fonctionnel                                                                                                                                                                                                                 |
| `nas.core`                         | `fleet/hosts/core.nas`                         | TrueNAS                                                          | Nom fonctionnel                                                                                                                                                                                                                 |
| `omni.core`                        | `fleet/hosts/core.omni`                        | LXC Omni                                                         | Nom fonctionnel                                                                                                                                                                                                                 |
| `oci-registry.core`                | `fleet/hosts/core.oci-registry`                | LXC du registre Zot                                              | Nom fonctionnel                                                                                                                                                                                                                 |
| `omni-infra-provider-proxmox.core` | `fleet/hosts/core.omni-infra-provider-proxmox` | LXC du fournisseur d'infrastructure Omni                         | Nom fonctionnel                                                                                                                                                                                                                 |
| `talosnet-dns.core`                | `fleet/hosts/core.talosnet-dns`                | LXC DNS BIND de Talosnet                                         | Nom fonctionnel                                                                                                                                                                                                                 |
| (aucun)                            | `fleet/base`                                   | Fondation commune (Cloudflare, Tailscale, B2, groupes Pocket-Id) | Sans objet                                                                                                                                                                                                                      |

La nature de `lungmen` dans le lore (cité ou vaisseau) n'a pas été vérifiée dans le dépôt.

## Nommer une nouvelle machine

1. Choisir la famille : `core` si la machine tourne directement dans l'hyperviseur et que le reste de la chaîne en
   dépend, `akn` sinon.
2. `core` : un nom fonctionnel court (`omni`, `nas`). `akn` : un nom de personnage ou de groupe d'Arknights pour un
   hôte, un nom de vaisseau ou de lieu pour un cluster. Vérifier qu'il n'est pas déjà dans l'inventaire.
3. Écrire le nom canonique (`<nom>.<famille>`), puis le dossier en inversant les segments, et ajouter la ligne à
   l'inventaire ci-dessus.
4. Si la machine a du Pulumi, nommer le projet `<nom>-<famille>` et la pile `<nom>_<famille>.live` (proposition).

## Pour aller plus loin

- [Architecture du dépôt](Architecture-du-Depot-Reference.md) : où se range chaque élément et ce qu'il contient.
- [Migrer vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md) : comment passer des anciens noms aux
  noms canoniques.
- [ADR-021 Passer d'une vue projet à une vue flotte](../decisions/ADR-021-Passer-d-une-Vue-Projet-a-une-Vue-Flotte.md) :
  pourquoi la vue devient par machine.
- [ADR-022 Héberger l'appliance d'observabilité sur un Mac Studio dédié](../decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md)
  : la machine `ptilopsis.akn`.
