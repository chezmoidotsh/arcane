# MIGR-20261114-00 Migrer vers la flotte

Faire passer le dépôt de `projects/<nom>/` à `fleet/`, élément par élément, jusqu'à la suppression de `projects/`.
Chaque étape dit ce qui change, de quelle nature est le changement (déplacement, migration manuelle, reconstruction), ce
qu'il faut vérifier après et comment revenir en arrière.

> [!NOTE]\
> **État au 2026-11-15 : en cours** (voir le tableau « Avancement »). Cette page n'a pas été rejouée. Les faits sur
> l'état actuel sont vérifiés dans le dépôt. Toute commande ou tout comportement marqué **à confirmer** n'a pas pu être
> vérifié (version de Pulumi, comportement du backend S3, état réel des clusters) et doit l'être avant l'étape
> concernée.

## Contexte

Le dépôt range tout ce qui est déployé par projet (`projects/<nom>/`), clé qui mélange des clusters, des machines et une
pile Pulumi globale (`chezmoi.sh`). La migration passe à une vue par flotte : un dossier par cluster et par machine sous
`fleet/`, un nom canonique par machine, un projet Pulumi par élément. L'état d'arrivée donne une place et un nom à
chaque machine, y compris celles qui portent plusieurs rôles. La raison du choix est dans l'ADR. Pendant la migration,
`fleet/` (éléments déjà déplacés) et `projects/` coexistent ; les noms issus du lore d'Arknights sont à apprendre,
chaque élément ayant son README.

| Élément            | Lien                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Décision d'origine | [ADR-021 Passer d'une vue projet à une vue flotte](../decisions/ADR-021-Passer-d-une-Vue-Projet-a-une-Vue-Flotte.md) (`proposed`)                                                                                                                                                                                    |
| État cible         | [Architecture du dépôt](../reference/Architecture-du-Depot-Reference.md) et [Nommage des machines](../reference/Nommage-des-Machines-Reference.md)                                                                                                                                                                   |
| Suivi              | Aucune issue ni pull request de suivi à ce jour. Migration liée : [MIGR-20261115-00 Migrer l'observabilité vers le Mac Studio](MIGR-20261115-00-Migrer-l-Observabilite-vers-le-Mac-Studio.md) ([ADR-022](../decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md), étape 10 ci-dessous) |

## Avancement

| Étape | Contenu                                                             | État    |
| ----- | ------------------------------------------------------------------- | ------- |
| 1     | Ajouter les scopes de commit `fleet:*` et le label `fleet`          | faite   |
| 2     | Créer les bases de catalogue manquantes                             | faite   |
| 3     | Activer le lint de structure                                        | faite   |
| 4     | Déplacer le catalogue                                               | à faire |
| 5     | Les petits hôtes du groupe `core`                                   | à faire |
| 6     | Déplacer le compartiment OCI parent `chezmoi.sh` vers `base`        | à faire |
| 7     | Les hôtes du groupe `akn`                                           | à faire |
| 8     | Les clusters (`akn.lungmen`, puis `akn.rhodes`)                     | à faire |
| 9     | Scinder les piles lourdes de `chezmoi_sh`                           | à faire |
| 10    | Séquencer `core.o11y-datastore` avec l'ADR-022                      | à faire |
| 11    | Documentation, suppression des scopes `project:*` et de `projects/` | à faire |

## Avant de commencer

| Prérequis                                                                                                                                                                    | Pourquoi                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Une pull request par étape, fusionnée dans `main` (`push` direct interdit)                                                                                                   | Les `Application` ArgoCD suivent `main`                        |
| Accès à l'état Pulumi (`s3://pulumi-states`, Garage), voir [INF-20260705-00](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md) | Les étapes 5, 6, 7 et 9 modifient l'état                       |
| Une copie de l'état de chaque pile avant de la toucher (`pulumi stack export > <pile>.json`)                                                                                 | Seul retour arrière fiable d'un `state move` ou d'un renommage |
| Pas de bump de composant ni de modification de `rhodes.akn` en cours                                                                                                         | L'étape 8 déplace le hub ArgoCD                                |
| Les fichiers locaux non versionnés de `projects/` sauvegardés (`amiya.akn`, `shodan.akn`)                                                                                    | `rm -rf projects/` les supprimerait du disque                  |

Règle commune : chaque étape se termine par un `dist:render` sans différence inattendue, un `pulumi preview` vide pour
toute pile touchée, et un lint vert (`mise run lint`).

## Ce qui change

### Correspondance des anciens et des nouveaux chemins

| Aujourd'hui                                                  | Cible                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `projects/rhodes.akn/src/{apps,infrastructure/kubernetes}`   | `fleet/clusters/akn.rhodes/kubernetes/src/{apps,system}`               |
| `projects/rhodes.akn/src/argocd`, `dist/argocd`              | `fleet/clusters/akn.rhodes/kubernetes/{src,dist}/argocd`               |
| `projects/rhodes.akn/dist/{apps,infrastructure/kubernetes}`  | `fleet/clusters/akn.rhodes/kubernetes/dist/{apps,system}`              |
| `projects/rhodes.akn/src/infrastructure/{omni,pulumi}`       | `fleet/clusters/akn.rhodes/{omni,pulumi}`                              |
| `projects/lungmen.akn/…`                                     | Même schéma sous `fleet/clusters/akn.lungmen`                          |
| `projects/hass/src/infrastructure/pulumi`                    | `fleet/hosts/akn.closure/pulumi`                                       |
| `projects/kazimierz.akn/src/infrastructure/{nixos,pulumi}`   | `fleet/hosts/akn.horn/{nix,pulumi}`                                    |
| `projects/rimbilliton.akn/src/infrastructure/{nixos,pulumi}` | `fleet/hosts/akn.exusiai/{nix,pulumi}`                                 |
| `projects/chezmoi.sh/src/infrastructure/proxmox/host`        | `fleet/hosts/core.pve-01/fs`                                           |
| `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/<x>`     | `fleet/hosts/core.<x>/nix` (sauf `o11y-datastore`, voir l'étape 10)    |
| `projects/chezmoi.sh/src/infrastructure/pulumi/stack/<x>`    | `fleet/hosts/core.<hôte>/pulumi` ou `fleet/base/pulumi`                |
| `catalog/talos/manifests`                                    | `catalog/omni/manifests`                                               |
| `catalog/flakes`                                             | `catalog/nix/images`                                                   |
| `catalog/kustomize/tun-device-plugin`                        | `fleet/clusters/akn.lungmen/kubernetes/src/system/tun-device-plugin`   |
| `catalog/opa/{policies,rules}`, `README.md`                  | `policies/opa/*.rego`, `policies/opa/rules/`, `policies/opa/README.md` |

> [!NOTE]\
> Les dossiers du catalogue changent aussi (`catalog/talos/manifests`, `catalog/flakes`, `catalog/kustomize`,
> `catalog/opa`) : ce déplacement rend le catalogue plus cohérent, en plus du passage à `fleet/`.

### Correspondance des noms

| Aujourd'hui                                                                                                                       | Nom canonique                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `projects/rhodes.akn`                                                                                                             | `rhodes.akn`                                                                             |
| `projects/lungmen.akn`                                                                                                            | `lungmen.akn`                                                                            |
| `projects/hass`                                                                                                                   | `closure.akn`                                                                            |
| `projects/kazimierz.akn`                                                                                                          | `horn.akn`                                                                               |
| `projects/rimbilliton.akn`                                                                                                        | `exusiai.akn`                                                                            |
| Mac Studio ([ADR-022](../decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md), n'existe pas encore) | `ptilopsis.akn`                                                                          |
| `chezmoi.sh` : `proxmox/host`, `stack/proxmox`                                                                                    | `pve-01.core`                                                                            |
| `chezmoi.sh` : `stack/proxmox-backup-server`                                                                                      | `pbs.core`                                                                               |
| `chezmoi.sh` : `stack/truenas`                                                                                                    | `nas.core`                                                                               |
| `chezmoi.sh` : `lxc/o11y-datastore`, `observability.ts`                                                                           | `o11y-datastore.core` (reste sous `projects/chezmoi.sh`, puis `ptilopsis.akn`, étape 10) |
| `chezmoi.sh` : `lxc/omni`, `omni.ts`                                                                                              | `omni.core`                                                                              |
| `chezmoi.sh` : `lxc/oci-registry`, `zot-registry.ts`                                                                              | `oci-registry.core`                                                                      |
| `chezmoi.sh` : `lxc/omni-infra-provider-proxmox`                                                                                  | `omni-infra-provider-proxmox.core`                                                       |
| `chezmoi.sh` : `lxc/talosnet-dns`                                                                                                 | `talosnet-dns.core`                                                                      |
| `chezmoi.sh` : le reste du Pulumi (Cloudflare, Tailscale, B2, groupes de `pocket-id.ts`)                                          | `fleet/base` (pas de nom canonique)                                                      |

Ce qui ne change pas de nom : les noms canoniques des clusters (Tailscale), leurs montages OpenBao et leurs contextes
kube. Tous les projets et toutes les piles Pulumi changent de nom (voir « Renommer un projet Pulumi »).

### Chemins à mettre à jour

Inventaire vérifié le 2026-11-14. Chaque ligne est traitée dans l'étape de l'élément concerné ; les fichiers transverses
le sont à l'étape 11.

| Où                                                                                             | Ce qui référence `projects/`                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/rhodes.akn/src/argocd/seed.apps/`, `shoot.apps/`, `src/bootstrap.applications.yaml`  | Chemins en dur des ApplicationSets et des `Application` d'amorçage (étape 8)                                                                                                                                                  |
| `.commitlintrc.js`                                                                             | 8 scopes `project:*` ; les scopes `fleet:<nom canonique>` sont ajoutés à l'étape 1, les `project:*` supprimés à l'étape 11                                                                                                    |
| `.github/labels.yaml`                                                                          | Le label `project` (« Anything under projects/ ») : le label `fleet` est ajouté à l'étape 1, `project` supprimé à l'étape 11                                                                                                  |
| `.github/workflows/`                                                                           | `oripathy-inventory`, `dist-staleness-check`, `pr-agent`, `omni-template-lint`, `compliance-partial`, `tailscale-derp-update`                                                                                                 |
| `.github/scripts/check-zot-coverage.py`                                                        | Chemins `projects/`                                                                                                                                                                                                           |
| `scripts/`                                                                                     | `argocd:app:sync` (et `argocd:app:sync.d/main.py`), `bao:secret:audit`, `bao:smb:drift-check`, `velero:backup`, `omni:drift:check`, `oripathy:inventory`, `dist:render`, `nix:build:lxc`, `wiki:publish`                      |
| `.agents/skills/`                                                                              | 15 fichiers : `create-issue`, `cnpg-backup` (dont `scripts/discover-cnpg.sh`), `git-commit`, `bao-secret-audit`, `lxc-maintenance`, `triage-issues`, `create-pr`, `component-update`, et 6 fichiers de `documentation-writer` |
| `pnpm-workspace.yaml`                                                                          | `projects/*/src/infrastructure/pulumi`                                                                                                                                                                                        |
| `.rtunk/rtunk.yaml`                                                                            | SVG d'architecture, fichiers générés de `chezmoi.sh`, exclusion de `dist/`, déclencheurs de `dist:render`                                                                                                                     |
| `.gitignore`, `.gitattributes`                                                                 | `projects/*/src/**/charts/`, exceptions `.mise/env.yaml` et `dist/`, `dist/**` marqués générés                                                                                                                                |
| `.mise.toml`, `.mise/tasks/tailscale/derp/update`, `projects/*/.mise.toml`, `lxc/*/.mise.toml` | Commentaires et tâches qui désignent les chemins                                                                                                                                                                              |
| `projects/*/.sops.yaml`                                                                        | `path_regex` relatives au fichier (`src/infrastructure/pulumi/\.mise/env\.yaml`, `src/(apps\|infrastructure/kubernetes)/…`) : à réécrire pour la nouvelle profondeur. Ne demande pas de rechiffrement.                        |
| `catalog/opa/`, `catalog/kubernetes/README.md`                                                 | Commandes `conftest` sur `projects/*/dist`, motif d'usage                                                                                                                                                                     |
| `README.md`, `AGENTS.md`                                                                       | Structure du dépôt                                                                                                                                                                                                            |
| `docs/`                                                                                        | 66 pages mentionnent `projects/` (`grep -rl "projects/" docs --include='*.md'`)                                                                                                                                               |
| `renovate.json5`, flakes des LXC                                                               | `renovate.json5` : non relu en détail (**à confirmer**) ; flakes : entrée `path:` vers `catalog/nix` (étape 5)                                                                                                                |

Il n'y a pas de `CODEOWNERS`.

### Renommer un projet Pulumi

Tous les projets Pulumi sont renommés selon `<nom>-<famille>` sans suffixe, et la fondation commune devient `base`. Le
renommage est le dernier acte de la migration de chaque élément. Un projet est identifié par son `name:` et chaque URN
de l'état le contient : c'est une migration d'état, par pile.

| Aujourd'hui (projet, pile)                      | Cible (projet, pile proposée)     |
| ----------------------------------------------- | --------------------------------- |
| `hass-infra`, `hass.live`                       | `closure-akn`, `closure_akn.live` |
| `kazimierz-akn-infra`, `kazimierz_akn.live`     | `horn-akn`, `horn_akn.live`       |
| `rimbilliton-akn-infra`, `rimbilliton_akn.live` | `exusiai-akn`, `exusiai_akn.live` |
| `lungmen-akn-infra`, `lungmen_akn.live`         | `lungmen-akn`, `lungmen_akn.live` |
| `rhodes-akn-infra`, `rhodes_akn.live`           | `rhodes-akn`, `rhodes_akn.live`   |
| `chezmoi-sh-infra`, `chezmoi_sh.live`           | `base`, `base.live`               |

Les noms de pile sont une proposition (le motif actuel est conservé). Pour chaque pile, chaque point étant **à
confirmer** par un essai sur une copie de l'état :

1. exporter l'état (`pulumi stack export`) et en garder une copie ;
2. renommer le projet et la pile : `pulumi stack rename` avec le nom complet, ou, à défaut, export, remplacement du nom
   de projet dans les URN, création de la nouvelle pile puis `pulumi stack import`. Avec le backend S3, l'état est rangé
   par projet dans le bucket : vérifier l'emplacement réel avant ;
3. renommer le préfixe des clés de configuration dans `Pulumi.<pile>.yaml` (`hass-infra:cloudflare_account_id` devient
   `closure-akn:cloudflare_account_id`) ; les valeurs chiffrées dépendent du sel de la pile (ré-chiffrement nécessaire
   ou non : à confirmer) ;
4. mettre à jour les `StackReference` qui lisent ce projet (tableau ci-dessous) ;
5. renommer `name:` dans `Pulumi.yaml`, puis vérifier avec un `pulumi preview` vide.

`StackReference` à mettre à jour (vérifié le 2026-11-15, `grep -rn "organization/" --include='*.ts' projects catalog`) :

| Cible lue                                             | Lue par                                                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization/chezmoi-sh-infra/chezmoi_sh.live`       | `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn` (`stack/pocket-id/index.ts`), `rimbilliton.akn` (`stack/pocket-id.ts`)                         |
| `organization/kazimierz-akn-infra/kazimierz_akn.live` | `rimbilliton.akn` (`stack/oci/compartments.ts`), `catalog/pulumi/lib/src/pangolin.ts` (règles `edgeAccess`, lues par `rhodes.akn` et `lungmen.akn`) |
| `organization/amiya-akn-infra/amiya_akn.live`         | `rhodes.akn` (`stack/cloudnative-pg.ts`) : référence vers un projet qui n'existe plus, à supprimer plutôt qu'à renommer (à confirmer)               |

Ordre : mettre à jour les lecteurs et la cible dans la même fenêtre, et rejouer un `pulumi preview` sur chaque lecteur.

## Étapes

### 1. Ajouter les scopes de commit et le label `fleet`

Les scopes `fleet:*` et le label `fleet` sont ajoutés au début, pour que les commits de la migration puissent les
utiliser. Les scopes `project:*` restent valides jusqu'à l'étape 11.

- **Ce qui change** : dans `.commitlintrc.js`, ajout d'un scope `fleet:<nom canonique>` par élément (`fleet:rhodes.akn`,
  `fleet:horn.akn`, `fleet:pve-01.core`, …) ; dans `.github/labels.yaml`, ajout du label `fleet` ; mise à jour des
  skills `git-commit`, `create-pr` et `create-issue` (`.agents/skills/`).
- **Nature** : déplacement simple (configuration).
- **Vérification** : un commit de test avec un scope `fleet:<nom canonique>` passe `commitlint` ; les scopes `project:*`
  passent toujours.
- **Retour arrière** : `git revert`.
- **Constaté** : 14 scopes ajoutés (un par cluster et par hôte du nommage, plus `fleet:base`). `commitlint` n'est pas
  installé en local : la configuration a été chargée avec node et les scopes testés contre elle (`fleet:horn.akn`
  accepté, `project:rhodes.akn` toujours accepté). `scope-enum` est une règle de niveau avertissement : un scope inconnu
  avertit, il ne fait pas échouer.

### 2. Créer les bases de catalogue manquantes

- **Ce qui change** : `cilium`, `external-dns`, `newt`, `proxmox` et `toolhive` existent dans
  `projects/lungmen.akn/src/infrastructure/kubernetes/` et `projects/rhodes.akn/src/infrastructure/kubernetes/` sans
  base dans `catalog/kubernetes/`. Une base partagée est créée pour chacun, et les deux clusters la consomment. Les
  clusters, eux, gardent leurs surcouches propres. `catalog/kustomize/tun-device-plugin` n'est utilisé que par
  `lungmen.akn` : il est déplacé chez lui.
- **Déplacement simple** : `tun-device-plugin` (`git mv` vers le dossier système de `lungmen.akn`).
- **Manuel** : le découpage entre la base commune et la surcouche de chaque cluster (décision de contenu, pas de
  commande).
- **Reconstruction** : `dist:render` pour chaque cluster touché.
- **Vérification** : `dist:render` ne produit aucune différence dans `dist/` (ou seulement les différences voulues, lues
  une par une) ; `catalog/kubernetes/README.md` décrit la règle.
- **Retour arrière** : `git revert` de la pull request ; aucun état à défaire.
- **Constaté** : bases créées dans `catalog/kubernetes/` pour `cilium`, `external-dns`, `newt`, `proxmox` et `toolhive`
  ; les versions de chart, les images, les correctifs et les valeurs propres à un cluster restent dans chaque cluster.
  `tun-device-plugin` est intégré au composant de `lungmen.akn` et `catalog/kustomize/` est supprimé (il ne contenait
  rien d'autre). `dist:render --check --all` : rien de périmé, le `dist/` rendu est identique octet pour octet. Relevé
  et laissé tel quel (hors périmètre) : sur `lungmen.akn`, `newt/security/` contient deux politiques réseau
  (`allow-newt-to-jellyseerr`, `allow-newt-to-mealie`) que son `kustomization.yaml` ne liste pas : elles ne sont pas
  déployées.

### 3. Activer le lint de structure

- **Ce qui change** : un lint de structure en CI (sur le modèle de `omni:template:lint`) vérifie que chaque `system/<x>`
  présent sur deux clusters ou plus a sa base `catalog/kubernetes/<x>/`, et que les dossiers sous `fleet/hosts` et
  `fleet/clusters` portent une famille `core.` ou `akn.`. Le lint ne s'applique qu'à `fleet/` tant que `projects/`
  existe : les deux arborescences sont parcourues (`projects/<cluster>/src/infrastructure/kubernetes/` et
  `fleet/clusters/<famille>.<nom>/kubernetes/src/system/`) et un cluster présent dans les deux n'est compté qu'une fois.
- **Manuel** : écrire le lint ; il ne peut pas être activé avant l'étape 2.
- **Vérification** : le lint passe sur l'état courant, et échoue sur un `system/<x>` partagé auquel on retire sa base
  (test volontaire sur une branche).
- **Retour arrière** : retirer le linter `fleet-structure` de `.rtunk/rtunk.yaml`.
- **Constaté** : le lint est le linter rtunk `fleet-structure`
  (`.rtunk/local-plugin/linters/fleet-structure/`), lancé par `mise run lint` et donc par la CI. Son script avec
  `--self-test` couvre les
  quatre cas (composant partagé sans base : échec ; avec base : succès ; cluster présent dans les deux arborescences :
  compté une fois ; nom de dossier invalide : échec). En local, le lint peut signaler `tailscale` à cause d'un dossier
  `projects/amiya.akn/` non suivi resté sur le disque ; en CI ce dossier n'existe pas.

### 4. Déplacer le catalogue

- **Déplacement simple** : `catalog/talos/manifests` vers `catalog/omni/manifests`, `catalog/flakes` vers
  `catalog/nix/images`, `catalog/opa` vers `policies/opa` (voir la correspondance ci-dessus), puis mise à jour des
  chemins des workflows (`flakes`, `opa-test`, `compliance-*`), de `.rtunk/rtunk.yaml` et des commandes `conftest` et
  `opa test` des fiches de règles (`-p policies/opa/`).
- **Manuel** : aucun. Les modèles de cluster Omni référencent `catalog/talos/manifests` par des URL
  `raw.githubusercontent.com` épinglées sur un SHA de commit : elles continuent de fonctionner après le déplacement. Les
  modèles ne changent de chemin qu'à leur prochaine mise à jour de SHA (**à confirmer** sur chaque modèle).
- **Reconstruction** : les images construites par `catalog/flakes` (`n8n`, `openbao`) : le flake déplacé garde ses
  entrées, mais son `flake.lock` et les workflows qui le construisent sont à vérifier (**à confirmer**).
- **Vérification** : `opa test policies/opa/ -v` réussit, la CI de conformité passe, `docs` ne référence plus
  `catalog/opa`.
- **Retour arrière** : `git revert`.

### 5. Les petits hôtes du groupe `core`

Concerne `core.omni`, `core.oci-registry`, `core.talosnet-dns`, `core.omni-infra-provider-proxmox`.

- **Déplacement simple** : le dossier du LXC (`flake.nix`, `configuration.nix`, `modules/`, `secrets/`, README,
  `.mise.toml` du LXC) vers `fleet/hosts/core.<nom>/nix/`.
- **Reconstruction** : chacun de ces flakes déclare `inputs.arcane.url = "path:../../../../../../../catalog/nix"` et son
  `flake.lock` enregistre ce chemin relatif. Le chemin change avec la profondeur : mettre à jour l'entrée, puis
  `nix flake lock` et reconstruire l'image avec `nix:build:lxc`. Le conteneur déjà déployé n'est pas touché ; la
  reconstruction sert au prochain déploiement. Comparer le résultat avec l'image précédente pour confirmer qu'elle ne
  change pas (**à confirmer**).
- **Manuel (Pulumi, `core.omni` et `core.oci-registry` seulement)** : scinder `stack/omni.ts` et `stack/zot-registry.ts`
  hors de `chezmoi_sh`, dans de nouveaux projets `omni-core` et `oci-registry-core` (motif `<nom>-<famille>`). Chaque
  nouveau projet a son `Pulumi.yaml` (même backend S3 que les autres), sa pile (proposition : `<nom>_core.live`), sa
  propre `PULUMI_CONFIG_PASSPHRASE` dans un `.mise/env.yaml` chiffré par SOPS
  ([ADR-017](../decisions/ADR-017-Conserver-une-Phrase-Secrete-Pulumi-par-Projet-et-Interdire-le-Partage-par-StackReference.md))
  et son entrée dans `pnpm-workspace.yaml`. Le transfert de l'état se fait avec `pulumi state move` (**à confirmer** :
  disponibilité dans la version de Pulumi épinglée par `mise`, et comportement entre deux piles dont les phrases
  secrètes diffèrent). Les tâches `lxc:secrets:sync` des LXC (jetons DNS-01 et Tailscale) doivent viser la nouvelle
  pile.
- **Vérification** : `pulumi preview` vide **dans la pile source et dans la pile destination** après chaque `state move`
  ; `mise run lxc:secrets:sync` rend les mêmes valeurs ; l'image reconstruite se déploie sur un LXC de test si
  disponible (**à confirmer**).
- **Retour arrière** : `pulumi state move` dans l'autre sens, ou restauration de l'état exporté avant l'étape
  (`pulumi stack import`) ; `git revert` pour les fichiers.

### 6. Déplacer le compartiment OCI parent `chezmoi.sh` vers `base`

À faire avant tout ce qui pourrait détruire ou reconstruire `horn.akn`. Le projet `kazimierz-akn-infra` porte
aujourd'hui le compartiment parent `chezmoi.sh` (importé dans son état, `stack/oci/compartments.ts`), dont les
compartiments `kazimierz.akn` et `rimbilliton.akn` sont des enfants ; `rimbilliton.akn` lit son identifiant par une
`StackReference` (`chezmoiShCompartmentId`). Il est décidé que ce compartiment passe dans le projet `base`.

- **Ce qui change** : le code du compartiment `chezmoiSh` passe de la pile de `kazimierz` à celle de `chezmoi_sh`, qui
  devient `base` à l'étape 9 ; `kazimierz` et `rimbilliton` le lisent depuis cette pile (`chezmoiShCompartmentId`).
- **Nature** : migration manuelle, un `pulumi state move` du compartiment de la pile de `kazimierz` vers celle de
  `chezmoi_sh` (**à confirmer** : version de Pulumi, comportement entre deux piles à phrases secrètes différentes).
- **Risque** : tant que ce déplacement n'est pas fait, détruire la pile de `kazimierz` (`pulumi destroy`) ou supprimer
  cette ressource ferait détruire le parent d'`exusiai`. Après le déplacement, `exusiai` ne dépend plus d'`horn`.
- **Vérification** : `pulumi preview` vide dans les trois piles (`kazimierz`, `chezmoi_sh`, `rimbilliton`), sans
  `replace` ni `delete` sur un compartiment.
- **Retour arrière** : `pulumi state move` inverse, ou `pulumi stack import` de l'état exporté avant l'étape.

### 7. Les hôtes du groupe `akn`

Concerne `akn.closure` (`hass`), `akn.horn` (`kazimierz.akn`), `akn.exusiai` (`rimbilliton.akn`). Ordre : `closure`,
puis `exusiai`, puis `horn` en dernier, car les deux autres dépendent de lui (voir plus bas, après l'étape 6).

- **Déplacement simple** : `src/infrastructure/nixos/` (qui devient `nix/`), `pulumi/`, `architecture.d2`, `assets/`
  (anciennement `docs/assets/`), `.mise.toml`, `.mise/tasks/`, `.sops.yaml`. Les flakes de `kazimierz.akn` et
  `rimbilliton.akn` n'ont pas d'entrée `path:` vers `catalog` : ils ne demandent pas de reconstruction pour ce
  déplacement. `hass` n'a aucune configuration de machine dans le dépôt.
- **Manuel, renommage du projet Pulumi** (dernier acte de l'élément, voir
  [Renommer un projet Pulumi](#renommer-un-projet-pulumi)) : `hass` devient `closure-akn`, `kazimierz-akn-infra` devient
  `horn-akn`, `rimbilliton-akn-infra` devient `exusiai-akn`.
- **Manuel, noms d'hôte** : le nom d'hôte NixOS et le nom du nœud Tailscale sont alignés sur le nom canonique
  (`horn.akn`, `exusiai.akn`) pendant la migration. Vérifier avant les références au nom actuel dans les ACL Tailscale,
  les enregistrements DNS et Pangolin (**à confirmer**).
- **Vérification** : `pulumi preview` vide dans chaque pile renommée ; `nix eval` du flake (la tâche `nixos/oci/install`
  évalue déjà le système avant d'agir) ; les piles qui lisent les sorties d'`horn.akn` ont un `pulumi preview` vide.
- **Retour arrière** : l'état exporté avant renommage est la référence ; renommer en sens inverse ou le réimporter.

### Détail de l'étape 7 : `horn.akn`, reconstruction possible

`kazimierz` peut être reconstruit de zéro, avec la tâche `nixos/oci/install` existante (réinstallation par
nixos-anywhere, qui repartitionne le volume de démarrage : destructif pour la machine, pas pour Pulumi). Une
réinstallation ne touche pas aux ressources OCI, et le compartiment parent `chezmoi.sh` n'est plus dans la pile d'`horn`
depuis l'étape 6.

### Détail de l'étape 7 : `exusiai.akn`, renommage en place

`rimbilliton` porte des données : il n'est pas reconstruit. D'après la documentation du fournisseur Terraform OCI, dont
le fournisseur Pulumi est issu, le `name` d'un compartiment, le `display_name` d'une instance, d'un VCN, d'un
sous-réseau, d'un NSG et d'une liste de sécurité, et le `hostname_label` des VNIC sont modifiables sur place. Le
`dns_label` d'un VCN et d'un sous-réseau ne l'est pas (le changer force le remplacement) : `dnsLabel: "rimbillitonvcn"`,
dans `stack/oci/network.ts`, **reste inchangé**. Ordre :

1. renommer le compartiment et les noms d'affichage dans le code Pulumi ;
2. `pulumi preview` : seules des mises à jour (`update`) sont attendues. **Toute ligne `replace` ou `delete` arrête
   l'opération**, en particulier sur l'instance, le VCN et le volume ;
3. appliquer, puis changer le nom d'hôte NixOS et le nom du nœud Tailscale, sans réinstaller.

### 8. Les clusters

`akn.lungmen` d'abord, `akn.rhodes` en dernier (c'est le hub ArgoCD). Le déplacement de chaque cluster se fait en pull
requests successives, en dupliquant le code : rien ne casse entre deux pull requests, et on ne déplace pas un cluster
puis l'autre en une seule fois.

Faits vérifiés dans `projects/rhodes.akn/src/argocd/` :

- les deux ApplicationSets de `shoot.apps/` (`system`, `applications`) nomment leurs `Application` par
  `{{ .path.basename }}` et déduisent l'espace de noms du même basename : déplacer un dossier ne change que
  `sources[].path`, les noms sont stables ;
- les deux ApplicationSets ont `preserveResourcesOnDeletion: true`, et les gabarits d'`Application` ne portent aucun
  finalizer `resources-finalizer.argocd.argoproj.io` : supprimer une `Application` ne supprime pas ses ressources ;
- `seed.apps/shoot.applicationset.yaml` écrit en dur `projects/rhodes.akn/src/argocd/shoot.apps` et compose les chemins
  de génération (`…/dist/infrastructure/kubernetes/*`, `…/dist/apps/*`) à partir de l'annotation
  `device.tailscale.com/hostname` des secrets de cluster ;
- `projects/rhodes.akn/src/bootstrap.applications.yaml` définit les `Application` `argocd` et `seed` avec les chemins
  `projects/rhodes.akn/dist/argocd`, `projects/rhodes.akn/src/argocd/sops` et `projects/rhodes.akn/src/argocd/seed.apps`
  ; d'après `projects/rhodes.akn/src/argocd/README.md`, ce fichier est appliqué **à la main** avec `kubectl`.

Un déplacement en une seule pull request laisserait les générateurs Git des ApplicationSets sans dossier : les
`Application` générées seraient supprimées puis recréées, sans supprimer les ressources déployées. La duplication évite
ce cas. Pour chaque cluster :

### Les quatre pull requests de l'étape 8

1. **Dupliquer.** Le code (`src/`) et le `dist/` du cluster sont copiés sous `fleet/clusters/<dossier>/`, avec `omni/`,
   `pulumi/`, `architecture.d2`, `assets/`, `.mise.toml` et `.sops.yaml`. `dist:render` connaît les deux arborescences
   (le script découpe aujourd'hui les chemins `projects/<cluster>/src/…`). L'ancien code reste la référence : rien ne
   pointe vers la copie.
   - Vérification : `dist:render` sur la copie ne diffère pas de l'ancien `dist/` ; aucune `Application` n'a changé.
   - Retour arrière : `git revert`.
2. **Pointer les ApplicationSets `system` et `applications` vers les nouveaux fichiers.** Le gabarit du `seed` compose,
   pour ce cluster, les chemins de génération vers `fleet/…/kubernetes/dist/…`. Tant qu'un cluster est encore sous
   `projects/`, il produit les deux formes de chemin (par exemple par une condition sur le nom du cluster). L'inversion
   des segments des noms canoniques est une expression de gabarit Go **à valider** avant l'étape (piste :
   `splitList "." | reverse | join "."` avec sprig, non testée).
   - Vérification : `argocd app list` donne les mêmes noms d'`Application` ; aucune n'est supprimée ni recréée ; leur
     état de synchronisation est inchangé ; les `sources[].path` pointent vers `fleet/`.
   - Retour arrière : `git revert`, les chemins reviennent vers l'ancien code, toujours présent.
3. **Pointer les `shoots` vers les nouveaux chemins** (`rhodes.akn` seulement : ces fichiers n'existent que dans le hub,
   cette pull request n'a pas d'équivalent pour `lungmen.akn`, à confirmer). `seed.apps/shoot.applicationset.yaml` et
   `bootstrap.applications.yaml` (`Application` `argocd` et `seed`) pointent vers les copies sous
   `fleet/clusters/akn.rhodes/`.
   - Vérification : les `Application` `argocd` et `seed` sont `Synced` sur les nouveaux chemins ; mêmes `Application`
     qu'avant.
   - Retour arrière : `git revert` et, si le fichier d'amorçage a été réappliqué, le réappliquer depuis l'ancien commit.
4. **Supprimer l'ancien code.** Le code et le `dist/` sous `projects/<cluster>/` sont supprimés.
   - Vérification : `argocd app list` inchangé ; plus aucune référence aux anciens chemins (`grep`).
   - Retour arrière : `git revert`, l'ancien code revient.

### Ce qui reste à confirmer à l'étape 8

Comme `bootstrap.applications.yaml` est appliqué à la main, les `Application` `argocd` et `seed` du cluster gardent
leurs anciens chemins tant que le fichier n'est pas réappliqué. Un `kubectl apply` manuel serait alors nécessaire
**avant la pull request 4** (sinon ces `Application` pointent vers des chemins supprimés), mais plus dans une fenêtre
serrée, puisque l'ancien code existe encore : **à confirmer**. Commandes actuelles du README d'ArgoCD de `rhodes.akn`
(les chemins cibles sont à confirmer après déplacement) :

```sh
kubectl apply --server-side --force-conflicts -f fleet/clusters/akn.rhodes/kubernetes/dist/argocd/
kustomize build --enable-alpha-plugins --enable-exec fleet/clusters/akn.rhodes/kubernetes/src/argocd/sops \
  | kubectl apply --server-side -f -
kubectl apply --server-side -f <emplacement de bootstrap.applications.yaml>
```

L'emplacement de `bootstrap.applications.yaml` après le déplacement est à trancher (proposition :
`fleet/clusters/akn.rhodes/kubernetes/bootstrap.applications.yaml`). Entre la pull request 1 et la pull request 4, geler
les modifications du cluster, ou les appliquer aux deux copies. Les projets Pulumi des clusters sont renommés à la fin
de leur migration (`lungmen-akn-infra` devient `lungmen-akn`, `rhodes-akn-infra` devient `rhodes-akn`, voir
[Renommer un projet Pulumi](#renommer-un-projet-pulumi)).

### 9. Scinder les piles lourdes de `chezmoi_sh`

Concerne `core.pbs`, `core.nas`, puis `core.pve-01` (le plus critique : SDN, pare-feu, accès, volumes), dans cet ordre.
`fleet/base` reçoit ce qui reste de la pile, et le projet `chezmoi-sh-infra` devient `base` en dernier (voir
[Renommer un projet Pulumi](#renommer-un-projet-pulumi)).

- **Déplacement simple** : `proxmox/host` vers `core.pve-01/fs`, `stack/proxmox`, `stack/proxmox-backup-server`,
  `stack/truenas` vers le `pulumi/` de chaque hôte, avec les documents générés (`PROXMOX-VE.md`,
  `PROXMOX_BACKUP_SERVER.md`, `TRUENAS.md`) et les lignes correspondantes de `.rtunk/rtunk.yaml`.
- **Manuel** : un `pulumi state move` par hôte vers un projet nouveau (`pve-01-core`, `pbs-core`, `nas-core`) avec sa
  pile, sa phrase secrète et son entrée `pnpm-workspace.yaml` (mêmes réserves que pour l'étape 5). Les secrets des
  amorçages de clusters (`proxmox/access/{rhodes,lungmen}-akn-bootstrap.ts`) sont lus par des tâches `mise` : ces tâches
  doivent viser la pile de `core.pve-01`. Les secrets SMB que `chezmoi.sh` pousse dans le montage `lungmen.akn/`
  d'OpenBao continuent de l'être depuis la pile de `core.nas` ; `bao:smb:drift-check` est à adapter.
- **Vérification** : `pulumi preview` vide dans la pile source et dans la destination après **chaque** `state move`,
  avant de passer au suivant ; `bao:smb:drift-check` sans dérive.
- **Retour arrière** : `pulumi state move` inverse ou `pulumi stack import` de l'état exporté avant l'étape.

### 10. Séquencer `core.o11y-datastore` avec l'ADR-022

Le LXC `o11y-datastore` et sa pile (`observability.ts`) ne sont pas déplacés dans `fleet/` : ils restent dans
`projects/chezmoi.sh` jusqu'à ce que
l'[ADR-022](../decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md) déplace l'appliance
sur `akn.ptilopsis`. Il y a alors un seul `pulumi state move`, directement vers `ptilopsis-akn`. Tant que l'ADR-022
n'est pas réalisé et le LXC retiré, `projects/` ne peut pas être supprimé : la fin de la migration en dépend. Les étapes
de cette migration sont dans
[Migrer l'observabilité vers le Mac Studio](MIGR-20261115-00-Migrer-l-Observabilite-vers-le-Mac-Studio.md).

- **Nature** : migration manuelle (un seul `pulumi state move`, voir l'étape 4 de l'autre migration).
- **Vérification** : `pulumi preview` vide dans les deux piles.
- **Retour arrière** : celui de l'étape 4 de l'autre migration.

### 11. Documentation, suppression des scopes `project:*` et de `projects/`

- **Manuel, scopes de commit** : supprimer les 8 scopes `project:*` de `.commitlintrc.js` (ceux d'`amiya.akn` et de
  `shodan.akn` disparaissent sans remplacement), le label `project` de `.github/labels.yaml`, et leurs mentions dans
  `.agents/skills/git-commit/SKILL.md`. Les scopes `fleet:*` et le label `fleet` existent depuis l'étape 1.
- **Manuel, OpenBao** : amender l'[ADR-002](../decisions/ADR-002-Topologie-des-Secrets-OpenBao.md),
  l'[ADR-003](../decisions/ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md),
  l'[ADR-004](../decisions/ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md) et la documentation d'OpenBao
  (montage `hosts/` et préfixes par nom canonique) ; créer le montage `hosts/` et ses politiques quand un hôte a un
  premier secret à y mettre ; migrer les secrets concernés vers `hosts/<nom canonique>/` s'il y en a. Le nom de la
  politique d'hôte et le chemin sous `hosts/<nom canonique>/` sont fixés dans l'ADR-003 et l'ADR-004 amendés ; une page
  de référence dédiée au nommage dans Vault (chemins, métadonnées, montages, politiques) est à écrire ensuite, et non
  dans cette migration. État vérifié dans le dépôt le 2026-11-14 : aucun hôte n'a de montage ni de chemin dans OpenBao ;
  les secrets de `hass`, `kazimierz.akn` et des LXC de `chezmoi.sh` (Omni, registre, observabilité, PBS) sont
  volontairement des sorties de pile Pulumi, car OpenBao tourne dans `rhodes.akn` et ces machines ne peuvent pas en
  dépendre pour démarrer ; la seule écriture OpenBao liée à une machine est le secret SMB que `chezmoi.sh` pousse dans
  le montage de `lungmen.akn/` (`immich`, `jellyfin`, `paperless-ngx`), qui vit chez son consommateur.
- **Déplacement simple** : mise à jour des fichiers transverses du tableau « Chemins à mettre à jour » (workflows,
  scripts, skills, `AGENTS.md`, `README.md`, pages de `docs/`).
- **Suppression** : `projects/` ne contient plus rien de suivi par Git ; le supprimer du disque (dont les fichiers de
  planification de `shodan.akn`) après avoir sauvegardé les fichiers locaux non versionnés.
- **Vérification** : `grep -rn "projects/" .` (hors `node_modules`) ne remonte aucune référence à un chemin existant ;
  `mise run lint` et `scripts/wiki:lint` passent.
- **Retour arrière** : sans objet, c'est le point d'arrivée ; la fin de la migration est la disparition de `projects/`.

## Critère de fin

```sh
ls projects 2>&1   # → No such file or directory
ls fleet/clusters fleet/hosts
```

Une liste groupée par famille (`akn.*` puis `core.*`) et l'absence de `projects/` prouvent que la migration est
terminée. `argocd app list` doit montrer les mêmes `Application` qu'avant l'étape 8. Le critère dépend de l'ADR-022 : le
LXC `o11y-datastore` doit être retiré (étape 10). Une fois atteint, archiver la page.

## Pour aller plus loin

- [Architecture du dépôt](../reference/Architecture-du-Depot-Reference.md) : la cible de la migration.
- [Nommage des machines](../reference/Nommage-des-Machines-Reference.md) : les noms, et l'inventaire des éléments.
- [ADR-021 Passer d'une vue projet à une vue flotte](../decisions/ADR-021-Passer-d-une-Vue-Projet-a-une-Vue-Flotte.md) :
  la décision et les raisons du choix.
- [Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
  : les commandes d'état utilisées aux étapes 5, 6, 7 et 9.
- [MIGR-20261115-00 Migrer l'observabilité vers le Mac Studio](MIGR-20261115-00-Migrer-l-Observabilite-vers-le-Mac-Studio.md)
  : la migration qui conditionne la fin de celle-ci.
- [Restaurer Rhodes](../plan-de-reprise/brouillon/Restaurer-Rhodes.md) : l'amorçage d'ArgoCD de `rhodes.akn`, à rejouer
  à l'étape 8.
