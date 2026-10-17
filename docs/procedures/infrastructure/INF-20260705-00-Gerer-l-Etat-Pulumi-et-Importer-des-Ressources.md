# INF-20260705-00 Gérer l'état Pulumi et importer des ressources

Cette procédure décrit où les stacks Pulumi du dépôt stockent leur état, ce que cela implique pour la reprise après
sinistre, et comment placer sous gestion Pulumi une ressource créée à la main (« clickops ») sans la recréer, grâce à
`pulumi import`.

Elle s'applique à tous les projets Pulumi du dépôt, dont les `Pulumi.yaml` pointent vers le même backend auto-hébergé.

> [!WARNING]\
> Vérifiée contre le dépôt le 2026-10-17 ; les commandes n'ont pas été rejouées. Les commandes `garage` de l'étape 1 ne
> figurent nulle part dans le dépôt : elles viennent de la CLI Garage et restent à confirmer sur le NAS.

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
  qui tourne sur `nas.chezmoi.sh` (voir [TrueNAS](../../../projects/chezmoi.sh/docs/TRUENAS.md)). Pulumi Cloud
  n'intervient pas : l'état, l'historique et les secrets vivent tous dans ce bucket.
- **Fournisseur de secrets** : le fournisseur par passphrase, par défaut. Chaque projet garde sa passphrase dans
  `src/infrastructure/pulumi/.mise/env.yaml`, chiffré avec SOPS (`PULUMI_CONFIG_PASSPHRASE`, plus `PULUMI_STACK` pour
  choisir la stack), déchiffré de façon transparente par `mise` quand les commandes s'exécutent depuis ce répertoire :
  les tâches `pulumi:*` ne demandent jamais de saisie.
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
> - **Hôte perdu** : suivre « Rebuild the host » dans [Proxmox VE](../../../projects/chezmoi.sh/docs/PROXMOX-VE.md). La
>   VM du NAS (et Garage avec elle) doit être restaurée **avant** tout `pulumi up`.
> - **Stockage du NAS perdu aussi** : le dataset Garage fait partie de la synchronisation quotidienne hors site de
>   `/mnt/zp1hs01/applications/truenas` vers Backblaze B2 (voir [TrueNAS](../../../projects/chezmoi.sh/docs/TRUENAS.md),
>   « Backups », couche 3). L'état survit donc à la perte du site, avec au plus un jour de décalage. Restaurer le
>   dataset depuis B2, relancer Garage, puis `pulumi login`.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `mise` (avec `mise install` exécuté
dans le répertoire du projet cible, ce qui fournit Node et la CLI `pulumi`), `sops` et la clé age référencée par
`SOPS_AGE_KEY_FILE`, `jq`.

Les accès suivants sont également nécessaires :

- une clé d'application Garage sur `pulumi-states`, exportée dans `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY` ;
- pour `projects/chezmoi.sh` en particulier, des identifiants de fournisseur au-delà des valeurs par défaut : toute
  ressource **ACME** de Proxmox VE exige une vraie session `root@pam` (nom d'utilisateur et mot de passe), car ces
  points d'accès rejettent les jetons d'API. Le stockage du mot de passe dans le Keychain macOS est décrit dans
  [`stack/proxmox/README.md`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/README.md), section «
  Bootstrapping ».

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles. `URN` se lit dans la
sortie de l'étape 2 ; `TYPE_TOKEN`, `NAME` et `ID` ne servent qu'à l'import (étape 3).

```sh
export PROJECT_DIR=<répertoire Pulumi du projet>      # ex. projects/chezmoi.sh/src/infrastructure/pulumi
export KEY_YEAR=<année de la clé Garage>              # ex. 2026
export URN=<URN de la ressource>                      # ex. urn:pulumi:<stack>::<projet>::<type>::<nom>
export TYPE_TOKEN=<jeton de type Pulumi>              # ex. proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole
export NAME=<nom logique dans le code>                # ex. pve-role-exporter
export ID=<identifiant de l'objet existant>           # ex. Exporter
```

Toutes les commandes `pulumi` s'exécutent depuis `$PROJECT_DIR`, pour que `mise` injecte `PULUMI_STACK` et
`PULUMI_CONFIG_PASSPHRASE`. Ne jamais deviner un `URN` : le lire dans l'état.

## Étape 1 — Créer ou renouveler l'identifiant d'accès à l'état

Cette étape ne concerne que le cas où la clé d'application est perdue ou doit être renouvelée. Créer une nouvelle clé
depuis la CLI Garage du NAS, dans le conteneur de l'application Garage.

```sh
garage key create pulumi-state-$KEY_YEAR
garage bucket allow pulumi-states --read --write --key pulumi-state-$KEY_YEAR
```

Exporter ensuite la nouvelle paire dans `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`, puis vérifier l'accès depuis
n'importe quel répertoire de projet.

```sh
pulumi stack ls
# → la liste des stacks du backend, sans erreur d'authentification
```

Retirer ensuite l'ancienne clé : `garage bucket deny` pour lui retirer l'accès au bucket, puis `garage key delete` pour
la supprimer. Les arguments exacts de ces deux commandes ne sont pas vérifiés dans le dépôt ; se référer à
`garage bucket deny --help` et `garage key delete --help`.

## Étape 2 — Inspecter et corriger l'état

```sh
cd $PROJECT_DIR

# Lire l'état
pulumi stack
# → stack courante et résumé des ressources
pulumi stack export > state.json
jq -r '.deployment.resources[].urn' state.json
# → un URN par ligne : celui qu'attendent les commandes state et import

# Corriger l'état
pulumi state taint $URN       # marque une ressource pour remplacement au prochain apply
pulumi state delete $URN      # retire une ressource de l'état sans toucher à l'objet réel

# Réconcilier avec la réalité (les tâches pulumi:* passent déjà --refresh)
pulumi refresh
```

> [!NOTE]\
> `scripts/puuluumi` propose un sélecteur interactif de ressources : `puuluumi state taint` (ou `untaint`, `protect`,
> `unprotect`) ouvre le sélecteur et transmet l'URN choisi à `pulumi state`.

## Étape 3 — Importer une ressource existante sans la recréer

Cette étape s'applique quand un objet existe déjà sur le système cible (créé à la main, ou par une recette antérieure à
la stack) et doit passer sous gestion Pulumi sans cycle destruction/création.

### Déclarer la ressource dans le code

Déclarer d'abord la ressource, avec des paramètres aussi proches que possible de l'objet réel, et rester à plat : ne pas
renseigner l'option de ressource `parent`. Un import fait sans `--parent` correspondant produit un URN différent de
celui d'une ressource déclarée avec `parent`, ce qui apparaît ensuite comme un delete+create parasite (cas rencontré sur
la stack Proxmox VE ; voir
[`stack/proxmox/README.md`](../../../projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/README.md), « Adding a
new identity or ACL binding »).

### Importer dans l'état

Utiliser le format d'identifiant documenté par le fournisseur pour ce type de ressource. Le jeton de type et ce format
figurent dans la documentation de chaque ressource du fournisseur ; pour les fournisseurs issus d'un pont, la
documentation d'import du fournisseur Terraform amont fait foi. `NAME` est le nom logique de la ressource dans le code.

```sh
pulumi import $TYPE_TOKEN $NAME $ID --yes
# → la ressource est ajoutée à l'état, avec le code correspondant affiché
```

### Converger vers un diff nul

Lancer `pulumi preview` et ajuster le code jusqu'à ce que la ressource importée n'affiche aucun changement. Ne jamais
accepter un `preview` qui remplace la ressource qui vient d'être importée : c'est la recréation que cette procédure sert
à éviter.

```sh
pulumi preview
# → aucune modification sur la ressource importée
```

### Lever la protection automatique

`pulumi import` marque la ressource `protect: true` dans l'état. Une fois le diff propre, l'aligner sur le reste de la
stack (le dépôt n'utilise pas `protect` par défaut).

```sh
pulumi state unprotect $URN
```

### Appliquer

Fournir à ces tâches les identifiants de fournisseur que la ressource exige, par exemple la paire `root@pam` pour les
ressources ACME de Proxmox VE. Les tâches `pulumi:diff` (`pulumi preview --refresh`) et `pulumi:apply`
(`pulumi up --refresh`) existent dans le `.mise.toml` de chaque projet Pulumi.

```sh
mise run pulumi:diff
# → aucun changement destructif sur la ressource importée
mise run pulumi:apply
```

## Exemple complet : importer le rôle `Exporter` de Proxmox VE

Le rôle `Exporter` est déclaré dans `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/access/pve-exporter.ts`
sous le nom logique `pve-role-exporter`. Exemple de forme, non rejoué.

```sh
export PROJECT_DIR=projects/chezmoi.sh/src/infrastructure/pulumi
export TYPE_TOKEN=proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole
export NAME=pve-role-exporter
export ID=Exporter

cd $PROJECT_DIR
pulumi import $TYPE_TOKEN $NAME $ID --yes
pulumi preview
# → aucune modification sur le rôle importé
```

## Vérifications rapides

- **Accès au backend** : `pulumi stack ls` — la liste des stacks s'affiche sans erreur d'authentification.
- **Import abouti** : `pulumi preview` — aucun changement sur la ressource importée.
- **Protection levée** : `pulumi stack export` — `"protect": true` absent de la ressource importée.

## Retour arrière

`pulumi state delete $URN` retire la ressource de l'état sans toucher à l'objet réel : c'est l'annulation d'un import.
Reprendre ensuite la déclaration dans le code (la retirer, ou la corriger avant un nouvel import).

```sh
pulumi state delete $URN
# → la ressource n'apparaît plus dans pulumi stack export
```

## Historique

- _2026-10-17_ : Alignement sur le gabarit de procédure v2 : état de vérification en callout, entrées en bloc `export`
  utilisées dans les commandes, exemple complet, chemin exact de `.mise/env.yaml`, nom logique de l'exemple d'import
  corrigé (`pve-role-exporter`) et commandes `garage` signalées comme non vérifiées dans le dépôt.
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
- [Documentation Pulumi sur l'import de ressources](https://www.pulumi.com/docs/iac/adopting-pulumi/import/) : référence
  officielle.
