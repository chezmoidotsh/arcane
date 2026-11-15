---
status: "proposed"
date: 2026-11-15
decision-makers: ["Alexandre"]
assisted-by: ["claude-opus-5.5", "claude-sonnet-5.5", "claude-fable-5.2"]
informed: []
template-version: "3.0.0"
---

# ADR-021 Passer d'une vue projet à une vue flotte

## Contexte et problème

Le dépôt range tout ce qui est déployé sous `projects/<nom>/`. Cette clé est une vue **par projet** : on se demande « à
quel projet appartient ce fichier ? ». Elle a été commode tant qu'un projet correspondait à un cluster ou à une machine.
Elle ne correspond plus à ce que le dépôt contient.

| Nature de l'objet                          | Exemples sous `projects/`                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cluster Kubernetes                         | `lungmen.akn`, `rhodes.akn`                                                                                                                                                                                                                                                          |
| Machine configurée individuellement        | `kazimierz.akn` et `rimbilliton.akn` (VPS NixOS), `hass` (machine Home Assistant OS : sa configuration n'est pas as-code, seul son Pulumi l'est), et dans `chezmoi.sh` les 5 LXC Proxmox de `src/infrastructure/proxmox/lxc/` et les fichiers installés à la main de `proxmox/host/` |
| Pile Pulumi « racine » qui mélange le tout | `chezmoi.sh`                                                                                                                                                                                                                                                                         |

La pile `chezmoi.sh` montre le plus nettement la limite de la vue par projet. Elle porte des ressources vraiment
globales (Cloudflare, Tailscale, B2, les groupes Pocket-Id) à côté de la configuration de machines précises : le
datacenter Proxmox (accès, ACME, pare-feu, pools, SDN, stockage), PBS, TrueNAS, et les jetons DNS-01 et Tailscale des
LXC d'observabilité, d'Omni et du registre. Un projet qui regroupe huit machines n'est pas un projet, c'est un dossier
fourre-tout.

Le dépôt a déjà commencé à penser par machine : `kazimierz.akn` et `rimbilliton.akn` ont chacun
`platforms/{oci.a1,proxmox.kvm}.nix`, qui produisent deux `nixosConfigurations` à partir du même rôle.

**Le Mac Studio a révélé le problème, il n'en est pas la cause.** La machine de
l'[ADR-022](./ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md) portera plusieurs rôles
(l'appliance d'observabilité de `chezmoi.sh` et des charges d'IA). Dans une vue par projet, elle n'a pas de place : la
ranger sous l'observabilité fait dépendre les charges d'IA d'un projet qui n'est pas le leur. Le problème se posera de
nouveau à chaque machine qui sert plusieurs usages, et le statu quo ne le résout pas : la clé « projet » continue de
mélanger clusters, machines et piles globales, et les machines n'ont pas de nom, puisqu'une machine de `chezmoi.sh`
n'existe que comme un sous-dossier ou un fichier `.ts` d'un projet.

La question stratégique à laquelle cet ADR répond est la suivante : **comment organiser le dépôt pour que chaque cluster
et chaque machine ait un nom et un seul emplacement, y compris une machine qui porte plusieurs rôles ?**

## Hors périmètre

- **L'emplacement et l'exécution d'un Pulumi Operator** : l'organisation rend les chemins prévisibles, pas plus. Le
  choix relève d'un ADR séparé (voir #1514 et l'[ADR-015](./ADR-015-Migrer-Crossplane-vers-Pulumi.md)).
- **Le modèle de rendu des manifestes** : l'[ADR-011](./ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md) reste
  valable, avec un `dist/` par cluster.

## Décision

Le dépôt passe d'une vue par projet à une **vue par flotte** : chaque cluster et chaque machine est un élément, avec un
nom et un seul dossier.

- `catalog/` contient ce qui est partagé ; `fleet/` contient un dossier par cluster (`fleet/clusters/`) et par machine
  (`fleet/hosts/`), plus `fleet/base/` pour les ressources liées à aucune machine. Un service appartient à exactement un
  élément.
- Toute machine reçoit un nom. Le nom canonique suit l'ordre d'un FQDN (`rhodes.akn`, `closure.akn`, `pve-01.core`) et
  sert à Tailscale et à OpenBao ; le dossier est le même nom avec les segments inversés (`akn.rhodes`), pour que `ls`
  regroupe par famille.
- Un projet Pulumi correspond à un élément, et porte son nom canonique sans suffixe (`horn-akn`, `pve-01-core`) ; la
  fondation commune est le projet `base`. Les projets existants sont renommés, et la pile `chezmoi.sh` est éclatée par
  machine.
- Les scopes de commit `project:<nom>` deviennent `fleet:<nom canonique>`.

Le détail est dans [Architecture du dépôt](../reference/Architecture-du-Depot-Reference.md) (le découpage, l'agencement
d'un élément, OpenBao, l'arborescence cible) et [Nommage des machines](../reference/Nommage-des-Machines-Reference.md)
(la règle, l'inventaire). Le plan, étape par étape, est dans
[Migrer vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md). La migration est terminée quand
`projects/` n'existe plus.

## Pourquoi ce choix

La réponse devait donner une place à une machine multi-rôles, donner un nom à chaque machine, et rendre les chemins
prévisibles pour ArgoCD (et, plus tard, pour un Pulumi Operator). Elle devait aussi se migrer élément par élément, avec
trois contraintes réelles : un projet Pulumi ne change pas de nom sans migration d'état, chaque projet a sa phrase
secrète
([ADR-017](./ADR-017-Conserver-une-Phrase-Secrete-Pulumi-par-Projet-et-Interdire-le-Partage-par-StackReference.md)), et
le hub ArgoCD de `rhodes.akn` est amorcé à la main.

L'argument central est que la clé de rangement est mauvaise : une vue par projet suppose qu'une machine appartient à un
projet, et le Mac Studio comme la pile `chezmoi.sh` montrent que ce n'est plus vrai. On la remplace donc, au lieu de lui
ajouter une exception. Un dossier par élément, avec un projet Pulumi par dossier, donne un emplacement unique et un nom
unique, sans double nommage entre le dossier, Tailscale, OpenBao et Pulumi. Le prix accepté est une migration d'état
lourde (éclatement de `chezmoi_sh`, renommage des projets existants) : une migration complète et documentée vaut mieux
qu'un état intermédiaire permanent. Le choix serait différent si le dépôt ne comptait qu'un cluster et aucune machine
partagée entre usages.

### Alternatives écartées

**Un `hosts/` racine à côté de `projects/`.** Créer `hosts/` pour le Mac Studio et les futures machines multi-rôles, et
laisser le reste sous `projects/`. C'est le déplacement minimal, mais la vue par projet reste la vue principale : on
ajoute une exception, pas un changement de vision, et la pile `chezmoi.sh` reste mélangée. La coexistence de deux
conventions n'a pas de fin, alors que celle de la solution retenue se termine avec `projects/`.

**Deux arbres parallèles, `fleet/` (où) et `services/` (quoi).** Chaque service déclare son placement, ou la flotte
consomme les services par des surcouches kustomize, des entrées `path:` de flakes Nix ou des instances de programmes
Pulumi. Un service appartient pourtant à exactement un élément : la surcouche est un poids sans contrepartie, tout ce
qu'un service partage va de toute façon dans `catalog/`, et il faut parcourir deux arbres et trois mécanismes
d'assemblage pour comprendre un déploiement.

---

## Conséquences

### Positives

- (+) **Chaque élément existe sous un nom et à un seul endroit** : cluster, machine ou fondation, tout se trouve sous
  `fleet/`, et `ls` regroupe par famille.
- (+) **Une machine multi-rôles a un foyer** : le Mac Studio n'appartient plus à un projet.
- (+) **Globs prévisibles** pour ArgoCD et un futur Pulumi Operator.
- (+) **Un nom, un dossier, un projet Pulumi** : plus de double nommage.
- (+) **Catalogue clarifié** : `catalog/` ne contient que du partagé et déployable ; sa règle (deux clusters ou plus)
  est vérifiée par un lint. La validation de CI est dans `policies/`.
- (+) **Modèle ArgoCD et ADR-011 inchangés** : un `dist/` par cluster.

### Négatives

- (-) **Une phrase secrète Pulumi de plus par pile créée** dans OpenBao
  ([ADR-017](./ADR-017-Conserver-une-Phrase-Secrete-Pulumi-par-Projet-et-Interdire-le-Partage-par-StackReference.md)),
  et des identifiants de fournisseurs à fournir par pile : c'est le prix durable d'un projet Pulumi par élément.

### Neutres

- (\~) **`core.o11y-datastore` est séquencé avec
  l'[ADR-022](./ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md)** : le LXC et sa pile restent
  sous `projects/chezmoi.sh` jusqu'à ce que l'appliance passe sur le Mac Studio, ce qui donne un seul
  `pulumi state move`, directement vers `akn.ptilopsis`. La fin de la migration dépend donc de l'ADR-022.

---

## Historique des modifications

- **2026-11-15** : **CLARIFICATION** : Restructuration sur le gabarit d'ADR 3.0.0 : plus de grille d'options (les
  alternatives réellement envisagées sont deux), section `Pourquoi ce choix`, statu quo traité dans le contexte. Retrait
  des points hors périmètre sans lien avec la décision, des questions ouvertes (tranchées : projet `base`, projets
  Pulumi sans suffixe `-infra` y compris pour `lungmen.akn` et `rhodes.akn`, scopes `fleet:<nom canonique>`, noms d'hôte
  alignés sur les noms canoniques) et des détails de mise en œuvre, renvoyés au guide.
- **2026-11-14** : **CLARIFICATION** : Réécriture du cadrage. La décision est un changement de vue (du projet à la
  flotte de machines), pas une réponse à deux déclencheurs (le Mac Studio et le Pulumi Operator). Titre renommé, règle
  de nommage par FQDN inversé, `hass` classé comme machine, `core.o11y-datastore` séquencé avec l'ADR-022, règle OpenBao
  des hôtes, étape des bases de catalogue manquantes, risque d'amorçage d'ArgoCD sur `rhodes.akn`, critère de fin de
  migration, renommage des projets Pulumi existants inclus. Le détail est réparti entre
  [Architecture du dépôt](../reference/Architecture-du-Depot-Reference.md),
  [Nommage des machines](../reference/Nommage-des-Machines-Reference.md) et
  [Migrer vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md).
- **2026-11-14** : **FEATURE** : Création de l'ADR avec le statut `proposed`. Aligne
  l'[ADR-022](./ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md) sur cette organisation.

---

## Pour aller plus loin

- [Architecture du dépôt](../reference/Architecture-du-Depot-Reference.md) : la cible décrite en détail.
- [Nommage des machines](../reference/Nommage-des-Machines-Reference.md) : les noms et l'inventaire.
- [Migrer vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md) : le plan de migration.
- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](./ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md) :
  le modèle `src/` puis `dist/`, conservé.
- [ADR-015 Migrer Crossplane vers Pulumi](./ADR-015-Migrer-Crossplane-vers-Pulumi.md) : la cible Pulumi Operator,
  différée.
- [ADR-017 Une phrase secrète Pulumi par projet](./ADR-017-Conserver-une-Phrase-Secrete-Pulumi-par-Projet-et-Interdire-le-Partage-par-StackReference.md)
  : la contrainte qui pèse sur l'éclatement de `chezmoi_sh`.
- [ADR-022 Héberger l'appliance d'observabilité sur un Mac Studio dédié](./ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md)
  : la machine qui a révélé le problème, première à naître dans `fleet/`.
