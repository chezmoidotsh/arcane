# INF-20260705-00 Gérer l'état Pulumi et importer des ressources

Cette procédure décrit où les stacks Pulumi du dépôt stockent leur état, ce que cela implique pour la reprise après
sinistre, et comment placer sous gestion Pulumi une ressource créée à la main (« clickops ») sans la recréer, grâce à
`pulumi import`.

Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées pour cette migration. Elle s'applique à
tous les projets Pulumi du dépôt, dont les `Pulumi.yaml` pointent vers le même backend auto-hébergé.

## Cadre technique et conventions

Les six projets Pulumi du dépôt déclarent le même backend dans leur `Pulumi.yaml`
(`projects/<projet>/src/infrastructure/pulumi/`) :

| Projet            | Nom Pulumi              |
| ----------------- | ----------------------- |
| `chezmoi.sh`      | `chezmoi-sh-infra`      |
| `hass`            | `hass-infra`            |
| `kazimierz.akn`   | `kazimierz-akn-infra`   |
| `lungmen.akn`     | `lungmen-akn-infra`     |
| `rhodes.akn`      | `rhodes-akn-infra`      |
| `rimbilliton.akn` | `rimbilliton-akn-infra` |

```yaml
backend:
  url: "s3://pulumi-states?endpoint=s3.chezmoi.sh&region=fr-par-1"
```

- **Backend** : le bucket `pulumi-states` de [Garage](https://garagehq.deuxfleurs.fr/), le stockage objet compatible S3
  qui tourne sur `nas.chezmoi.sh` (voir
  [`projects/chezmoi.sh/docs/TRUENAS.md`](../../../projects/chezmoi.sh/docs/TRUENAS.md)). Pulumi Cloud n'intervient pas
  : l'état, l'historique et les secrets vivent tous dans ce bucket.
- **Fournisseur de secrets** : le fournisseur par passphrase, par défaut. Chaque projet garde sa passphrase dans un
  `.mise/env.yaml` chiffré avec SOPS (`PULUMI_CONFIG_PASSPHRASE`, plus `PULUMI_STACK` pour choisir la stack), déchiffré
  de façon transparente par `mise` quand les commandes s'exécutent depuis le répertoire du projet : les tâches
  `pulumi:*` ne demandent jamais de saisie.
- **Identifiants S3** : la CLI Pulumi s'authentifie auprès de Garage avec les variables d'environnement AWS standard
  (`AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`), qui portent une **clé d'application** Garage autorisée sur le bucket
  `pulumi-states`. Cet identifiant relève de la configuration de l'opérateur ; il n'est versionné nulle part dans le
  dépôt.

> [!IMPORTANT]\
> La chaîne de disponibilité de l'état est plus longue qu'elle n'en a l'air. Garage tourne sur le NAS
> (`zp1hs01/applications/truenas/fr.deuxfleurs.garage`), le NAS est une VM de `pve-01`, et `pve-01` est aussi ce que les
> stacks gèrent. Perdre le NAS (ou l'hôte qui le porte) fait échouer toute commande `pulumi` dès le `login`.
>
> - **NAS arrêté, hôte intact** : restaurer d'abord la VM du NAS depuis sa sauvegarde PBS ; l'état Pulumi revient avec
>   elle.
> - **Hôte perdu** : suivre « Rebuild the host » dans
>   [`PROXMOX-VE.md`](../../../projects/chezmoi.sh/docs/PROXMOX-VE.md). La VM du NAS (et Garage avec elle) doit être
>   restaurée **avant** tout `pulumi up`.
> - **Stockage du NAS perdu aussi** : le dataset Garage fait partie de la synchronisation quotidienne hors site de
>   `/mnt/zp1hs01/applications/truenas` vers Backblaze B2 (voir `TRUENAS.md`, « Backups », couche 3). L'état survit donc
>   à la perte du site, avec au plus un jour de décalage. Restaurer le dataset depuis B2, relancer Garage, puis
>   `pulumi login`.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `mise` (avec `mise install` exécuté
dans le répertoire du projet cible, ce qui fournit Node et la CLI `pulumi`), `sops` et la clé age référencée par
`SOPS_AGE_KEY_FILE`.

Les accès suivants sont également nécessaires :

- une clé d'application Garage sur `pulumi-states`, exportée dans `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY` ;
- pour `projects/chezmoi.sh` en particulier, des identifiants de fournisseur au-delà des valeurs par défaut : toute
  ressource **ACME** de Proxmox VE exige une vraie session `root@pam` (nom d'utilisateur et mot de passe), car ces
  points d'accès rejettent les jetons d'API. Le motif de stockage dans le Keychain est décrit dans
  [`stack/proxmox/README.md`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/README.md), section «
  Bootstrapping ».

## Entrées requises

- `<PROJECT_DIR>` : répertoire Pulumi du projet cible, par exemple `projects/chezmoi.sh/src/infrastructure/pulumi`.
- `<URN>` : URN de la ressource visée, lu dans la sortie de `pulumi stack export` (étape 2). Ne jamais en deviner un.
- `<TYPE_TOKEN>`, `<NAME>`, `<ID>` : jeton de type Pulumi, nom logique et identifiant de la ressource existante, pour
  l'import (étape 3).
- `<ANNEE>` : année du suffixe de la clé Garage (étape 1).

Toutes les commandes `pulumi` s'exécutent depuis `<PROJECT_DIR>`, pour que `mise` injecte `PULUMI_STACK` et
`PULUMI_CONFIG_PASSPHRASE`.

## Étape 1 — Créer ou renouveler l'identifiant d'accès à l'état

Cette étape ne concerne que le cas où la clé d'application est perdue ou doit être renouvelée. Créer une nouvelle clé
depuis la CLI Garage du NAS, dans le conteneur de l'application Garage.

```sh
garage key create pulumi-state-<ANNEE>
garage bucket allow pulumi-states --read --write --key pulumi-state-<ANNEE>
```

Exporter ensuite la nouvelle paire dans `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`, puis vérifier l'accès depuis
n'importe quel répertoire de projet.

```sh
pulumi stack ls
# → la liste des stacks du backend, sans erreur d'authentification
```

Retirer ensuite l'ancienne clé : `garage bucket deny` pour lui retirer l'accès au bucket, puis `garage key delete` pour
la supprimer.

## Étape 2 — Inspecter et corriger l'état

```sh
pulumi stack                       # stack courante et résumé des ressources
pulumi stack export > state.json   # instantané complet : le moyen le plus rapide de lire URN, identifiants et sorties
pulumi state taint <URN>           # marque une ressource pour remplacement au prochain apply
pulumi state delete <URN>          # retire une ressource de l'état sans toucher à l'objet réel
pulumi refresh                     # réconcilie l'état avec la réalité (les tâches pulumi:* passent déjà --refresh)
```

`pulumi stack export` donne aussi l'URN exact qu'attendent les commandes `state` et `import`.

> [!NOTE]\
> `scripts/puuluumi` propose un sélecteur interactif de ressources : `puuluumi state taint` (ou `untaint`, `protect`,
> `unprotect`) ouvre le sélecteur et transmet l'URN choisi à `pulumi state`.

## Étape 3 — Importer une ressource existante sans la recréer

Cette étape s'applique quand un objet existe déjà sur le système cible (créé à la main, ou par une recette antérieure à
la stack) et doit passer sous gestion Pulumi sans cycle destruction/création.

### Déclarer la ressource dans le code

Déclarer d'abord la ressource, avec des paramètres aussi proches que possible de l'objet réel. Rester à plat : **ne pas
renseigner l'option de ressource `parent`**. Un import fait sans `--parent` correspondant produit un URN différent de
celui d'une ressource déclarée avec `parent`, ce qui apparaît ensuite comme un delete+create parasite (cas rencontré sur
la stack Proxmox VE ; voir `stack/proxmox/README.md`, « Adding a new identity or ACL binding »).

### Importer dans l'état

Utiliser le format d'identifiant documenté par le fournisseur pour ce type de ressource.

```sh
pulumi import <TYPE_TOKEN> <NAME> <ID> --yes
# exemple : pulumi import proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole exporter Exporter
```

Le jeton de type et le format d'identifiant figurent dans la documentation de chaque ressource du fournisseur ; pour les
fournisseurs issus d'un pont, la documentation d'import du fournisseur Terraform amont fait foi.

### Converger vers un diff nul

Lancer `pulumi preview` et ajuster le code jusqu'à ce que la ressource importée n'affiche **aucun changement**.

```sh
pulumi preview
# → aucune modification sur la ressource importée
```

> [!WARNING]\
> Ne jamais accepter un `preview` qui remplace la ressource qui vient d'être importée : c'est la recréation que cette
> procédure sert à éviter.

### Lever la protection automatique

`pulumi import` marque la ressource `protect: true` dans l'état. Une fois le diff propre, l'aligner sur le reste de la
stack (le dépôt n'utilise pas `protect` par défaut).

```sh
pulumi state unprotect <URN>
```

### Appliquer

```sh
mise run pulumi:diff
mise run pulumi:apply
# → aucun changement destructif sur la ressource importée
```

Fournir à ces tâches les identifiants de fournisseur que la ressource exige, par exemple la paire `root@pam` pour les
ressources ACME de Proxmox VE. Les tâches `pulumi:diff` (`pulumi preview --refresh`) et `pulumi:apply`
(`pulumi up --refresh`) existent dans le `.mise.toml` de chaque projet Pulumi.

## Vérifications rapides

- **Accès au backend** : `pulumi stack ls` — la liste des stacks s'affiche sans erreur d'authentification.
- **Import abouti** : `pulumi preview` — aucun changement sur la ressource importée.
- **Protection levée** : `pulumi stack export` — `"protect": true` absent de la ressource importée.

## Retour arrière

`pulumi state delete <URN>` retire la ressource de l'état sans toucher à l'objet réel : c'est l'annulation d'un import.
Reprendre ensuite la déclaration dans le code (la retirer, ou la corriger avant un nouvel import).

## Historique

- _2026-10-11_ : Ajout de la tâche `scripts/puuluumi` pour sélectionner l'URN (`state taint|untaint|protect|unprotect`),
  de la section « Retour arrière » (`pulumi state delete`), et suppression de la ligne
  `garage key deny ... / garage key delete ...` non copiable, remplacée par une phrase décrivant les deux commandes
  (arguments exacts non vérifiés).
- _2026-10-11_ : Projets concernés corrigés. La page citait `projects/amiya.akn/src/infrastructure/pulumi`, qui n'existe
  plus ; les `Pulumi.yaml` de `chezmoi.sh`, `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn` et `rimbilliton.akn`
  déclarent tous l'URL de backend `s3://pulumi-states?endpoint=s3.chezmoi.sh&region=fr-par-1`.
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français et structure
  alignée sur le gabarit de procédure.
- _2026-07-05_ : Création initiale.

## Pour aller plus loin

- [Pulumi du projet `chezmoi.sh`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/README.md) : la stack
  `chezmoi-sh-infra` et ses tâches `mise`.
- [Proxmox VE](../../../projects/chezmoi.sh/docs/PROXMOX-VE.md) : « Import an existing object » et « Rebuild the host ».
- [TrueNAS](../../../projects/chezmoi.sh/docs/TRUENAS.md) : l'emplacement physique de Garage, et donc de l'état.
- [Provisionner le SDN Proxmox](INF-20260627-00-Provisionner-le-SDN-Proxmox.md) : autre procédure appliquée par la stack
  `chezmoi-sh-infra`.
- [Documentation Pulumi sur les backends S3 auto-gérés](https://www.pulumi.com/docs/iac/concepts/state-and-backends/) et
  [sur l'import de ressources](https://www.pulumi.com/docs/iac/adopting-pulumi/import/) : références officielles.
