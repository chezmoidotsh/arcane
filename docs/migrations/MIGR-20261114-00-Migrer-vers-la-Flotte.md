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

| Étape | Contenu                                                             | État                                                                                                                       |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | Ajouter les scopes de commit `fleet:*` et le label `fleet`          | faite                                                                                                                      |
| 2     | Créer les bases de catalogue manquantes                             | faite                                                                                                                      |
| 3     | Activer le lint de structure                                        | faite                                                                                                                      |
| 4     | Déplacer le catalogue                                               | faite                                                                                                                      |
| 5     | Les petits hôtes du groupe `core`                                   | code prêt, état Pulumi à déplacer                                                                                          |
| 6     | Déplacer le compartiment OCI parent `chezmoi.sh` vers `base`        | code prêt, état Pulumi à déplacer                                                                                          |
| 7     | Les hôtes du groupe `akn`                                           | code prêt (A, B, C), états Pulumi à déplacer                                                                               |
| 8     | Les clusters (`akn.lungmen`, puis `akn.rhodes`)                     | `lungmen.akn` : PR 1, 2 et 4 code prêt, état Pulumi à déplacer ; `rhodes.akn` : PR 1 à 4 code prêt, état Pulumi à déplacer |
| 9     | Scinder les piles lourdes de `chezmoi_sh`                           | `core.pbs`, `core.nas` et `core.pve-01` code prêt, états Pulumi à déplacer ; `base` à faire                                |
| 10    | Séquencer `core.o11y-datastore` avec l'ADR-022                      | à faire                                                                                                                    |
| 11    | Documentation, suppression des scopes `project:*` et de `projects/` | à faire                                                                                                                    |

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

| Cible lue                                             | Lue par                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization/chezmoi-sh-infra/chezmoi_sh.live`       | `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn` (`stack/pocket-id/index.ts`), `rimbilliton.akn` (`stack/pocket-id.ts`), `kazimierz.akn` et `rimbilliton.akn` (`chezmoiShCompartmentId`, après l'étape 6) |
| `organization/kazimierz-akn-infra/kazimierz_akn.live` | `catalog/pulumi/lib/src/pangolin.ts` (règles `edgeAccess`, lues par `rhodes.akn` et `lungmen.akn`)                                                                                                            |
| `organization/amiya-akn-infra/amiya_akn.live`         | `rhodes.akn` (`stack/cloudnative-pg.ts`) : référence vers un projet qui n'existe plus, à supprimer plutôt qu'à renommer (à confirmer)                                                                         |

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
- **Retour arrière** : retirer le workflow.
- **Constaté** : le lint est `scripts/fleet:structure:lint`, lancé en CI par
  `.github/workflows/pull_request.fleet-structure-lint.yaml`. `scripts/fleet:structure:lint --self-test` couvre les
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
  modèles ne changent de chemin qu'à leur prochaine mise à jour de SHA (vérifié sur les trois fichiers concernés :
  `catalog/omni/clustertemplates/base.yaml` et les modèles de `lungmen` et de `rhodes`, laissés inchangés).
- **Reconstruction** : les images construites par `catalog/flakes` (`n8n`, `openbao`) : les flakes déplacés n'ont aucune
  entrée `path:` relative et leur `flake.lock` ne change pas ; les images n'ont pas été reconstruites. Le workflow
  `flakes` déduisait le fabricant GHCR de la position d'un segment du chemin : corrigé.
- **Vérification** : `opa test policies/opa/ -v` réussit, la CI de conformité passe, `docs` ne référence plus
  `catalog/opa`.
- **Retour arrière** : `git revert`.
- **Constaté** : `catalog/talos/` n'existe plus (`catalog/talos/README.md` est parti avec `manifests`). `policies/opa/`
  contient les 12 fichiers `.rego` à plat, `rules/` et `README.md`. `opa test policies/opa/ -v` : 91 tests réussis,
  autant qu'avant le déplacement ; `conftest` donne le même résultat sur un dossier rendu de chaque cluster ;
  `dist:render --check --all` : rien de périmé ; `nix flake metadata` évalue les flakes déplacés.

### 5. Les petits hôtes du groupe `core`

Concerne `core.omni`, `core.oci-registry`, `core.talosnet-dns`, `core.omni-infra-provider-proxmox`.

- **Déplacement simple** : le dossier du LXC (`flake.nix`, `configuration.nix`, `modules/`, `secrets/`) vers
  `fleet/hosts/core.<nom>/nix/` ; le README, le `.mise.toml` et `.mise/` du LXC vont à la racine de
  `fleet/hosts/core.<nom>/`, comme dans la [page de référence](../reference/Architecture-du-Depot-Reference.md).
- **Reconstruction** : chacun de ces flakes déclare `inputs.arcane.url = "path:../../../../../../../catalog/nix"` et son
  `flake.lock` enregistre ce chemin relatif. Le chemin change avec la profondeur : mettre à jour l'entrée, puis
  `nix flake lock` et reconstruire l'image avec `nix:build:lxc`. Le conteneur déjà déployé n'est pas touché ; la
  reconstruction sert au prochain déploiement. Le résultat est comparé à l'image précédente (voir **Constaté**).
- **Manuel (Pulumi, `core.omni` et `core.oci-registry` seulement)** : scinder `stack/omni.ts` et `stack/zot-registry.ts`
  hors de `chezmoi_sh`, dans de nouveaux projets `omni-core` et `oci-registry-core` (motif `<nom>-<famille>`). Chaque
  nouveau projet a son `Pulumi.yaml` (même backend S3 que les autres), sa pile (`<nom>_core.live`), sa propre
  `PULUMI_CONFIG_PASSPHRASE` dans un `.mise/env.yaml` chiffré par SOPS
  ([ADR-017](../decisions/ADR-017-Conserver-une-Phrase-Secrete-Pulumi-par-Projet-et-Interdire-le-Partage-par-StackReference.md))
  et son entrée dans `pnpm-workspace.yaml`. Le transfert de l'état se fait avec `pulumi state move` (**à confirmer** :
  comportement entre deux piles dont les phrases secrètes diffèrent ; la commande existe dans la version épinglée par
  `mise`). Les tâches `lxc:secrets:sync` des LXC (jeton DNS-01) lisent la sortie de la nouvelle pile.
- **Vérification** : `pulumi preview` vide **dans la pile source et dans la pile destination** après chaque `state move`
  ; `mise run lxc:secrets:sync` rend les mêmes valeurs ; l'image reconstruite se déploie sur un LXC de test si
  disponible (**à confirmer**).
- **Retour arrière** : `pulumi state move` dans l'autre sens, ou restauration de l'état exporté avant l'étape
  (`pulumi stack import`) ; `git revert` pour les fichiers.
- **Constaté** : les quatre dossiers LXC sont dans `fleet/hosts/core.<nom>/nix/`, avec `README.md`, `.mise.toml` et
  `.mise/` à la racine de l'hôte. Dans les flakes, l'entrée `arcane` est `path:../../../../catalog/nix` ; la dérivation
  de l'image (`packages.x86_64-linux.default`, ce que construit `nix:build:lxc`) est identique avant et après le
  déplacement pour les quatre hôtes (comparée par `drvPath`, aucune image n'a été reconstruite). Les entrées des
  `flake.lock` ont été modifiées à la main, car Nix refuse les fichiers non suivis : `nix flake lock` dans chaque
  dossier après la fusion ne doit montrer aucune différence. Côté Pulumi, les projets `omni-core` (pile
  `omni_core.live`) et `oci-registry-core` (pile `oci-registry_core.live`) sont créés ; chacun ne porte que son jeton
  Cloudflare DNS-01 (`caddy-dns01-omni`, `caddy-dns01-zot` : un composant et son `AccountToken`). Les noms logiques, les
  types et les parents sont inchangés et le fournisseur Cloudflare est celui par défaut : aucun alias n'est nécessaire.
  Les projets lisent l'identifiant du compte et celui de la zone Cloudflare dans leur propre configuration, sans
  `StackReference`. `pulumi state move` existe dans la version épinglée par `mise` (v3.268.0) ; son comportement entre
  deux piles à phrases secrètes différentes reste **à confirmer** et doit être essayé d'abord sur une copie de l'état.
  `lxc:secrets:sync` de `core.omni` et de `core.oci-registry` lit la sortie de sa propre pile. La bibliothèque commune
  des LXC (`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/.mise/lib/lxc.sh`) reste à côté de `o11y-datastore` et
  est référencée par les hôtes déplacés ; elle bouge à l'étape 10.
- **Manuel, avant la fusion** : créer la phrase secrète de chaque projet (`.mise/env.yaml`, SOPS), `pulumi stack init`,
  renseigner les deux clés de configuration secrètes, lancer les deux `state move`, vérifier que les trois
  `pulumi preview` sont vides.
- **Risque** : tant que le déplacement d'état n'est pas fait, aucun `pulumi up` ne doit tourner dans `chezmoi_sh` depuis
  cette branche : le code ne déclare plus les deux jetons, un `up` les révoquerait.
- **À trancher** : l'ADR-017 dit que les piles d'avant le bootstrap sont isolées et regroupées dans `chezmoi.sh`, alors
  que le plan en scinde deux : amender l'ADR ou confirmer la formulation.
- **À trancher** : les identifiants de composant Oripathy de ces hôtes changent (`chezmoi.sh/…` vers `omni.core/…`,
  etc.) ; les issues Oripathy existantes indexées sur les anciens identifiants risquent d'être dupliquées.

### 6. Déplacer le compartiment OCI parent `chezmoi.sh` vers `base`

À faire avant tout ce qui pourrait détruire ou reconstruire `horn.akn`. Le projet `kazimierz-akn-infra` porte
aujourd'hui le compartiment parent `chezmoi.sh` (importé dans son état, `stack/oci/compartments.ts`), dont les
compartiments `kazimierz.akn` et `rimbilliton.akn` sont des enfants ; `rimbilliton.akn` lit son identifiant par une
`StackReference` (`chezmoiShCompartmentId`). Il est décidé que ce compartiment passe dans le projet `base`.

- **Ce qui change** : le code du compartiment `chezmoiSh` passe de la pile de `kazimierz` à celle de `chezmoi_sh`, qui
  devient `base` à l'étape 9 ; `kazimierz` et `rimbilliton` le lisent depuis cette pile (`chezmoiShCompartmentId`).
- **Nature** : migration manuelle, un `pulumi state move` du compartiment de la pile de `kazimierz` vers celle de
  `chezmoi_sh` (**à confirmer** : comportement entre deux piles à phrases secrètes différentes, même point ouvert qu'à
  l'étape 5, à essayer sur une copie de l'état).
- **Vérification** : `pulumi preview` sans `replace` ni `delete` sur un compartiment dans les trois piles. Les aperçus
  ne sont pas strictement vides : `chezmoi_sh` gagne une sortie, `kazimierz` en perd une, `rimbilliton` perd une
  `StackReference` en lecture seule.
- **Retour arrière** : `pulumi state move` inverse, ou `pulumi stack import` de l'état exporté avant l'étape.
- **Constaté** : le compartiment est déclaré dans `projects/chezmoi.sh/src/infrastructure/pulumi/stack/oci.ts`
  (ressource `chezmoiSh`, même type, même nom logique, sans parent ni option : aucun alias nécessaire) et exporté sous
  `chezmoiShCompartmentId`. `kazimierz.akn` et `rimbilliton.akn` le lisent par la `StackReference` vers `chezmoi_sh`
  qu'ils avaient déjà (groupes Pocket-Id), avec `requireOutput` : si la sortie manque, le programme échoue au lieu de
  planifier le déplacement des compartiments enfants à la racine du tenancy. `kazimierz` n'exporte plus
  `chezmoiShCompartmentId` et `rimbilliton` n'a plus de `StackReference` vers `kazimierz` : `exusiai` ne dépend plus
  d'`horn`. Le fournisseur est celui par défaut (`@pulumi/oci` 4.20.0) dans les deux piles ; `chezmoi_sh` n'en avait pas
  : la dépendance et la clé de configuration `oci:region` (`eu-paris-1`) sont ajoutées. Le `compartmentId` d'un
  compartiment OCI se modifie en place (même OCID) : changer sa source ne peut pas remplacer les compartiments enfants.
  Le compartiment n'a pas de `protect` et `enableDelete` n'est pas positionné : d'après la documentation du fournisseur,
  le retirer d'un programme le sort de l'état sans le supprimer dans OCI, et en créer un adopte le compartiment existant
  de même nom (comportement documenté, non essayé). Reste **à confirmer** ce que `state move` rapporte sur la dépendance
  du compartiment enfant à `chezmoiSh`.
- **Manuel, avant la fusion**, dans cet ordre : terminer le `state move` de l'étape 5 ; sauvegarder les trois états ;
  ajouter à la main les cinq variables `TF_VAR_*` d'accès OCI au `.mise/env.yaml` (SOPS) de `chezmoi.sh` (elles sont
  dans ceux de `kazimierz.akn` et `rimbilliton.akn` ; dès lors, chaque exécution de `chezmoi_sh` les exige) ;
  `pulumi state move` du compartiment de `kazimierz_akn.live` vers `chezmoi_sh.live` ; `preview` puis `up` de
  `chezmoi_sh` (la sortie doit exister) ; `preview` puis `up` de `kazimierz` et de `rimbilliton`. Arrêt au moindre
  `replace` ou `delete` sur un compartiment. Le déroulé détaillé est dans la pull request de l'étape.
- **Risque** : l'ordre compte.
  - Un `pulumi up` de `chezmoi_sh` depuis cette branche avant le `state move` de l'étape 5 révoquerait les jetons Omni
    et du registre.
  - Un `pulumi up` de `chezmoi_sh` avant le `state move` du compartiment l'adopterait par son nom : deux piles le
    porteraient.
  - Un `pulumi up` de `kazimierz` après l'export par `chezmoi_sh` mais avant le `state move` planifierait la suppression
    de `chezmoiSh` de son état.
- **À trancher** : l'ADR-017 côté producteur est respecté (la pile d'amorçage `chezmoi.sh` exporte une valeur non
  secrète), mais l'ADR dit qu'après l'amorçage les données partagées passent par OpenBao, jamais par `StackReference` :
  confirmer que lire cet OCID depuis `chezmoi.sh` est permis, ou prévoir son passage dans OpenBao avec les identifiants
  des groupes Pocket-Id.
- **À trancher** : `protect: true` sur le compartiment parent, non ajouté ici (il apparaîtrait dans un aperçu censé ne
  porter aucun changement de ressource) ; proposé en suite.
- **À trancher** : la clé d'API OCI vit désormais dans trois fichiers chiffrés ; la tâche `oci:apikey:rotate` de
  `kazimierz` supprime l'ancienne clé dans OCI, ce qui révoquerait les autres copies : décider où se fait la rotation.

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
  (`exusiai-akn` au tour B, `horn-akn` au tour C). Pour `horn.akn`, ce nom fait partie de l'URL de l'API de Pangolin
  (`pangolin:url`) : voir le détail du tour C.
- **Constaté** (tour A, `closure.akn`) : `projects/hass` est devenu `fleet/hosts/akn.closure` (`.mise.toml`,
  `.sops.yaml` et `README.md` à la racine, code Pulumi dans `pulumi/`), le projet `closure-akn` et la pile
  `closure_akn.live` (fichier `Pulumi.closure_akn.live.yaml`). Aucune `StackReference` ne lit `hass-infra` ; il n'y a ni
  schéma d'architecture ni Nix à rendre (`hass` n'a aucune configuration de machine dans le dépôt). Le propriétaire du
  jeton Cloudflare reste `hass` : le nom du jeton, `(hass) - Home Assistant`, ne change pas. Aucun nom côté cloud ne
  dérive du nom du projet ou de la pile : l'aperçu attendu après le renommage est vide. Le fichier `.mise/env.yaml` est
  déplacé tel quel, sans être déchiffré. Les tours B (`rimbilliton.akn` vers `exusiai.akn`) et C (`kazimierz.akn` vers
  `horn.akn`) sont décrits plus bas.
- **Manuel, avant la fusion** (tour A), depuis l'ancienne arborescence (celle de l'étape 6) :
  1. sauvegarder l'état (`pulumi stack export`) ;
  2. répéter l'opération sur un backend `file://` (import de la sauvegarde, puis le renommage ci-dessous) ;
  3. `pulumi stack rename organization/closure-akn/closure_akn.live` ; à défaut, export, réécriture des URN
     (`hass-infra` vers `closure-akn`, `hass.live` vers `closure_akn.live`), `pulumi stack init` puis
     `pulumi stack import` ;
  4. `sops set pulumi/.mise/env.yaml '["PULUMI_STACK"]' '"closure_akn.live"'` ;
  5. `mise run pulumi:diff` : l'aperçu doit être vide (tout `create` ou `delete` arrête l'opération) ;
  6. fusionner.
- **Risque** : ne jamais lancer `pulumi stack init` ni `pulumi up` depuis le nouveau dossier avant le renommage : cela
  créerait un second jeton Cloudflare et un second client Pocket-Id. Entre le renommage et la fusion, la pile référencée
  par `main` n'existe plus : ses commandes échouent, sans rien planifier. La pull request #1514
  (`feat/pulumi-operator-prep`, qui modifie le `.mise.toml` Pulumi de `hass` et ajoute `scripts/pulumi:stack`) est
  fusionnée : le tour A part de `main`.
- **À confirmer** : le comportement de `pulumi stack rename` entre deux projets sur le backend S3 maison ; l'emplacement
  des états dans le bucket (`.pulumi/stacks/<projet>/<pile>.json`) ; la validité de la phrase secrète et du sel après le
  renommage.
- **À corriger ensuite** (défaut antérieur, non traité ici) : les tâches `pulumi:cloudflare-token` et
  `pulumi:oidc-client` de l'hôte ne définissent que `dir` et ne chargent pas `pulumi/.mise/env.yaml` ; `core.omni` passe
  par `mise exec --`.
- **Vérification** : `pulumi preview` vide dans chaque pile renommée ; `nix eval` du flake (la tâche `nixos/oci/install`
  évalue déjà le système avant d'agir) ; les piles qui lisent les sorties d'`horn.akn` ont un `pulumi preview` vide.
- **Retour arrière** : l'état exporté avant renommage est la référence ; renommer en sens inverse ou le réimporter.

### Détail de l'étape 7 : `horn.akn`, renommage en place

`kazimierz` pourrait être reconstruit de zéro avec la tâche `nixos/oci/install` (réinstallation par nixos-anywhere, qui
repartitionne le volume de démarrage : destructif pour la machine, pas pour Pulumi), et le compartiment parent
`chezmoi.sh` n'est plus dans sa pile depuis l'étape 6. Mais c'est l'unique passerelle publique (Pangolin, Gerbil,
Traefik, tunnels Newt de `lungmen.akn` et `rhodes.akn`, IP publique derrière `*.chezmoi.sh`) : une reconstruction
recréerait l'état de Pangolin, la clé WireGuard et les certificats sans gain fonctionnel. L'hôte est donc renommé en
place, comme `exusiai.akn`. **Aucune reconstruction n'est nécessaire à cette étape**, malgré la remarque antérieure du
propriétaire.

- **Constaté** (tour C) : `projects/kazimierz.akn` devient `fleet/hosts/akn.horn` (`nix/`, `pulumi/`, `assets/`), le
  projet Pulumi `horn-akn` et la pile `horn_akn.live` (fichier `Pulumi.horn_akn.live.yaml`), les sorties de flake
  `horn-akn-{aarch64,x86_64}`, le nom d'hôte NixOS `horn-akn` (le nœud Tailscale le suit) et `pangolin:url` =
  `https://horn-akn.tail831c5d.ts.net` dans les piles `horn`, `rhodes.akn` et `lungmen.akn`. `nixos:oci:update` et
  `nixos:backup` visent par défaut `root@horn-akn` (`nixos:oci:update` accepte une cible facultative).
  - **Renommage en place possible.** Vérifié sur le schéma de `@pulumi/oci` 4.20.0 : le `name` et la `description` du
    compartiment, le `displayName` de l'instance (`horn-pangolin`), du VCN, de la liste de sécurité et du NSG
    (`horn-akn-*`) et les `freeformTags.project` sont modifiables sur place : cinq `update` OCI. Le sous-réseau, la
    table de routage et la passerelle Internet n'ont pas de nom d'affichage dans le code.
  - **Changement d'`url` sans remplacement.** Les trois piles utilisent le fournisseur Pangolin par défaut
    (`@pulumi/pangolin` 1.6.1, ponté dynamiquement). Le `DiffConfig` du pont ne remplace le fournisseur que pour les
    champs `ForcesProviderReplace`, et aucun n'est posé : changer l'`url` est une mise à jour du fournisseur, aucune
    ressource Pangolin n'est remplacée et les identifiants Newt ne changent pas. Aucun autre usage du nom Tailscale :
    les ACL passent par des étiquettes et Newt par `pangolin.chezmoi.sh`.
  - **Conservé volontairement** : `dnsLabel: "kazimierzaknvcn"` (non modifiable : le changer remplacerait le VCN, le
    sous-réseau et l'instance), les noms logiques (URN), l'IP publique (éphémère), les enregistrements Cloudflare
    `kazimierz.akn` et `*.kazimierz.akn` (noms publics), le propriétaire du jeton Traefik DNS-01, la description de la
    clé Tailscale (remplacement de la clé), les noms du dossier et des fichiers de sauvegarde.
  - **Preuve côté NixOS** : `nix eval` de `…toplevel.drvPath` identique après le déplacement et le changement de nom des
    sorties ; après le renommage de l'hôte, égal à l'ancien système avec le seul `networking.hostName` changé.
  - **Seule `StackReference` qui lit cette pile** : `catalog/pulumi/lib/src/pangolin.ts`, qui lit désormais
    `organization/horn-akn/horn_akn.live` en gardant son nom logique, donc sans changement d'URN dans `rhodes.akn` ni
    `lungmen.akn`.
- **Manuel, avant la fusion** (tour C), depuis l'ancienne arborescence pour les points 1 à 3 :
  1. sauvegarder l'état (`pulumi stack export`, `pulumi stack --show-urns`) de `horn`, de `rhodes.akn` et de
     `lungmen.akn`, et copier à chaud l'état de Pangolin (`mise run nixos:backup root@kazimierz-akn`, ancien nom, sans
     interruption) ;
  2. répéter le renommage sur un backend `file://` (import de la sauvegarde) ;
  3. `pulumi stack rename organization/horn-akn/horn_akn.live` ; à défaut, export, réécriture des URN
     (`kazimierz-akn-infra` vers `horn-akn`, `kazimierz_akn.live` vers `horn_akn.live`), `pulumi stack init` puis
     `pulumi stack import` ;
  4. `sops set pulumi/.mise/env.yaml '["PULUMI_STACK"]' '"horn_akn.live"'` ;
  5. basculer l'hôte : `mise run nixos:binding-ip`, `nixos-rebuild dry-activate` (aucune unité `docker-*` ne doit être
     redémarrée), puis `mise run nixos:oci:update root@kazimierz-akn` ; contrôler que le nœud s'appelle `horn-akn` dans
     le tailnet et que `tailscaled`, `pangolin-tailscale-serve`, `docker-pangolin`, `docker-gerbil` et `docker-traefik`
     sont actifs ;
  6. **barrière** : `https://horn-akn.tail831c5d.ts.net/` doit répondre avec un certificat valide (tout code HTTP, 401
     ou 404 compris), `pangolin.chezmoi.sh` répondre et les deux sites Newt être en ligne. Ne pas continuer sans cette
     réponse (si le certificat manque : redémarrer `pangolin-tailscale-serve`) ;
  7. `mise run pulumi:diff -- --diff` dans `horn` : exactement cinq `update` OCI (compartiment : `name` et `description`
     ; instance et NSG : `displayName` et `freeformTags.project` ; VCN et liste de sécurité : `displayName`) plus un
     `update` du fournisseur Pangolin par défaut (propriété `url`) ; **tout `create`, `replace` ou `delete` (en
     particulier un `replace` du fournisseur ou d'une ressource `pangolin:*`), tout `update` sur une autre ressource ou
     toute autre propriété arrête l'opération** ; puis `mise run pulumi:apply` et un second `mise run pulumi:diff` vide
     ;
  8. `mise run pulumi:diff -- --diff` dans `rhodes.akn` et `lungmen.akn` : **uniquement** l'`update` du fournisseur
     Pangolin (`url`), même condition d'arrêt (un `replace` ferait tourner les identifiants Newt) ; puis
     `mise run pulumi:apply` dans les deux, pour que l'état référence la nouvelle URL ;
  9. fusionner, avec `pulumi/.mise/env.yaml` commité. Contrôles : `pangolin.chezmoi.sh` répond, les deux sites Newt sont
     en ligne, un service public de chaque cluster répond.
- **Risque** : ne jamais lancer `pulumi stack init` ni `pulumi up` depuis le nouveau dossier avant le renommage : un
  état vide planifierait une seconde passerelle (instance, VCN, enregistrements DNS, dont l'écrasement de
  `*.chezmoi.sh`, IdP, organisation et rôle Pangolin). Ne jamais lancer `nixos:oci:install` ni `nixos:e2e` (elles
  repartitionnent la cible). Entre le renommage de la pile et la fusion, `rhodes.akn` et `lungmen.akn` sur `main`
  échouent sur leur `StackReference` : fusionner vite. Entre la bascule de l'hôte (point 5) et les trois `apply` (points
  7 et 8), les piles gardent l'ancienne URL, qui ne répond plus : ne rien appliquer dans les clusters dans cet
  intervalle. Dans l'aperçu de `lungmen.akn`, ne juger que les lignes liées à Pangolin.
- **À confirmer** : le comportement de `pulumi stack rename` entre deux projets sur le backend S3 maison et
  l'emplacement de l'état dans le bucket ; la validité de la phrase secrète et du sel après le renommage ; la réécriture
  par OCI des politiques IAM qui nomment le compartiment (aucune n'est déclarée dans le dépôt) ; le nœud Tailscale suit
  bien le nom d'hôte (sinon, il a été renommé à la main dans la console : le renommer en `horn-akn`, et supprimer un
  éventuel ancien nœud `horn-akn` si le nouveau devient `horn-akn-1`) ; `tailscale serve` obtient un certificat pour le
  nouveau nom au premier usage ; la répétition du renommage sur une copie de l'état, pas encore faite.
- **Décidé** : le propriétaire a choisi de renommer à la fois l'hôte et le nom Tailscale (`horn-akn`), avec
  `pangolin:url` mis à jour dans les trois piles. Les options écartées étaient de garder `kazimierz-akn`, ou de renommer
  l'OS en épinglant l'ancien nom Tailscale. Les identifiants de composants d'Oripathy passent de `kazimierz.akn/…` à
  `horn.akn/…` (`pangolin`, `gerbil`, `traefik`, `error-pages`, `nix/disko`, `nix/sops-nix`) : des issues déjà indexées
  peuvent être dupliquées (même point que l'étape 5).
- **Retour arrière** : côté hôte, `nixos-rebuild switch --rollback` revient à la génération précédente (`kazimierz-akn`)
  ; renommer le nœud dans la console Tailscale s'il ne suit pas ; les trois piles doivent alors garder (ou retrouver)
  `pangolin:url: https://kazimierz-akn.tail831c5d.ts.net`. Avant l'application, renommer la pile en sens inverse (ou
  réimporter la sauvegarde) et rétablir `PULUMI_STACK` ; après, relancer `pulumi up` avec l'ancien code et la pile
  renommée en sens inverse remet les anciens noms (cinq `update`) et l'ancienne URL ; dans `rhodes.akn` et
  `lungmen.akn`, un `pulumi up` avec l'ancien code remet l'ancienne URL (un `update` chacun). Aucune ressource n'est
  recréée. Côté fichiers : `git revert`.

### Détail de l'étape 7 : `exusiai.akn`, renommage en place

`rimbilliton` porte des données (les mondes Minecraft) : il n'est pas reconstruit, et tout ce qui forcerait un
remplacement garde son ancienne valeur.

- **Constaté** (tour B) : `projects/rimbilliton.akn` devient `fleet/hosts/akn.exusiai` (`nix/`, `pulumi/`, `assets/`),
  le projet Pulumi `exusiai-akn` et la pile `exusiai_akn.live` (fichier `Pulumi.exusiai_akn.live.yaml`), le nom d'hôte
  NixOS `exusiai-akn` et les sorties de flake `exusiai-akn-{aarch64,x86_64}`. `nixos:oci:update` accepte une cible
  facultative (par défaut `root@exusiai-akn`), pour atteindre l'hôte sous son ancien nom Tailscale au premier
  basculement.
  - **Renommage en place possible.** Vérifié sur le schéma de `@pulumi/oci` 4.20.0 (`Args` des ressources, mention «
    Updatable ») : le `name` et la `description` du compartiment, le `displayName` de l'instance, du VCN, de la liste de
    sécurité, du sous-réseau et du NSG, et les `freeformTags.project` sont modifiables sur place. Le `dnsLabel` du VCN
    ne l'est pas : `dnsLabel: "rimbillitonvcn"` **reste inchangé** (commentaire dans `stack/oci/network.ts`). Le
    sous-réseau n'a pas de `dnsLabel` et la VNIC de l'instance n'a pas de `hostnameLabel` dans le code.
  - **Conservé volontairement** : les noms logiques (ils font partie des URN), le nom du bucket B2 et de sa clé (le
    bucket ne se renomme pas, la clé serait remplacée), la description de la clé Tailscale (remplacement de la clé), les
    commentaires des enregistrements DNS, le fichier `nix/secrets/rimbilliton.sops.yaml` et les libellés du schéma
    d'architecture (les SVG ne sont pas re-rendus ; à corriger au prochain redessin).
  - **Preuve côté NixOS** : `nix eval` de `…toplevel.drvPath` pour les deux sorties. Après le simple déplacement, le
    résultat est identique ; après le renommage, il est égal à celui de l'ancienne configuration avec le seul
    `networking.hostName` changé. Le nom d'hôte est la seule modification du système.
  - **Aucune `StackReference` ne lit cette pile** ; elle lit `organization/chezmoi-sh-infra/chezmoi_sh.live`, inchangée.
- **Manuel, avant la fusion** (tour B), depuis l'ancienne arborescence pour les points 1 à 3 :
  1. sauvegarder l'état (`pulumi stack export`, `pulumi stack --show-urns`) et prendre un snapshot restic neuf des
     mondes ;
  2. répéter le renommage sur un backend `file://` (import de la sauvegarde) ;
  3. `pulumi stack rename organization/exusiai-akn/exusiai_akn.live` ; à défaut, export, réécriture des URN
     (`rimbilliton-akn-infra` vers `exusiai-akn`, `rimbilliton_akn.live` vers `exusiai_akn.live`), `pulumi stack init`
     puis `pulumi stack import` ;
  4. `sops set pulumi/.mise/env.yaml '["PULUMI_STACK"]' '"exusiai_akn.live"'` ;
  5. `mise run pulumi:diff -- --diff` : exactement six `update` (compartiment : `name` et `description` ; instance, NSG
     : `displayName` et `freeformTags.project` ; VCN, liste de sécurité, sous-réseau : `displayName`). **Tout `create`,
     `replace` ou `delete`, tout autre changement, ou toute autre propriété sur ces six ressources arrête l'opération**,
     en particulier `dnsLabel`, `compartmentId`, `sourceDetails` et le volume de démarrage ;
  6. `mise run pulumi:apply`, puis `mise run pulumi:diff` (aucun changement attendu) ;
  7. `mise run nixos:oci:update root@rimbilliton-akn` (bascule du nom d'hôte, sans réinstaller), puis contrôles : nœud
     `exusiai-akn` dans le tailnet, `tailscaled`, `docker` et `caddy` actifs, `minecraft.chezmoi.sh` répond sur les
     ports de jeu, connexion au Panel par Pocket-Id, prochaine sauvegarde restic réussie ;
  8. fusionner, avec `pulumi/.mise/env.yaml` commité.
- **Risque** : ne jamais lancer `pulumi stack init` ni `pulumi up` depuis le nouveau dossier avant le renommage : un
  état vide planifierait une seconde instance, un second VCN, un second bucket B2 et de nouveaux enregistrements DNS. Ne
  jamais lancer `nixos:oci:install` ni `nixos:e2e` (elles repartitionnent la cible). Après le basculement, le nom
  MagicDNS `rimbilliton-akn` ne résout plus : la cible par défaut de `nixos:oci:update` est `root@exusiai-akn`.
- **À confirmer** : le comportement de `pulumi stack rename` entre deux projets sur le backend S3 maison, et
  l'emplacement de l'état dans le bucket (`.pulumi/stacks/<projet>/<pile>.json`) ; la validité de la phrase secrète et
  du sel après le renommage ; la réécriture par OCI des politiques IAM qui nomment le compartiment (à regarder dans la
  console avant et après l'application ; aucune politique n'est déclarée dans le dépôt) ; le nom du nœud Tailscale, qui
  suit le nom d'hôte sauf s'il a été renommé à la main dans la console d'administration.
- **À trancher** : les identifiants de composants d'Oripathy passent de `rimbilliton.akn/…` à `exusiai.akn/…` (`disko`,
  `sops-nix`, `panel`, `wings`, `pelican-plugins`, `pelican-pocketid-provider`), et des issues déjà indexées sur
  l'ancien identifiant peuvent être dupliquées (même point que l'étape 5) ; supprimer ou garder le groupe de snapshots
  restic de l'ancien nom d'hôte (`rimbilliton-akn`), qui ne reçoit plus de sauvegardes et garde sa dernière série de
  rétention (`restic forget --host rimbilliton-akn --keep-last 1 --prune`) ; relabeller le schéma d'architecture au
  prochain redessin.
- **Retour arrière** : avant l'application, renommer la pile en sens inverse (ou réimporter la sauvegarde) et rétablir
  `PULUMI_STACK` ; après, relancer `pulumi up` avec l'ancien code et la pile renommée en sens inverse remet les anciens
  noms (six `update`, aucune ressource recréée). Côté hôte : `nixos-rebuild switch --rollback`.

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
   `architecture.d2`, `assets/`, `.mise.toml` et `.sops.yaml`. `pulumi/` n'est **pas** dupliqué : une copie serait un
   second dossier avec le même projet, la même pile et le même état, donc il se déplace directement en pull request 4.
   Les outils (`dist:render`, lints, CI) connaissent les deux arborescences. L'ancien code reste la référence : rien ne
   pointe vers la copie.
   - Vérification : `dist:render` sur la copie ne diffère pas de l'ancien `dist/` ; aucune `Application` n'a changé.
   - Retour arrière : `git revert`.
2. **Pointer les ApplicationSets `system` et `applications` vers les nouveaux fichiers.** Le gabarit du `seed` compose,
   pour ce cluster, les chemins de génération vers `fleet/…/kubernetes/dist/…`. Tant qu'un cluster est encore sous
   `projects/`, il produit les deux formes de chemin (par exemple par une condition sur le nom du cluster). L'inversion
   des segments des noms canoniques se fait avec `splitList "." | reverse | join "."` (sprig v3, vérifié avec
   `helm template` : `lungmen.akn` donne `akn.lungmen`) ; un dernier contrôle avec `argocd appset generate` reste **à
   confirmer**. Les patches du `seed` doivent produire `fleet/clusters/<nom inversé>/kubernetes/dist/{system,apps}/*`
   (et `.application.patch`) ; `infrastructure/kubernetes` devient `system`.
   - Vérification : `argocd app list` donne les mêmes noms d'`Application` ; aucune n'est supprimée ni recréée ; leur
     état de synchronisation est inchangé ; les `sources[].path` pointent vers `fleet/`.
   - Retour arrière : `git revert`, les chemins reviennent vers l'ancien code, toujours présent.
3. **Pointer les `shoots` vers les nouveaux chemins** (`rhodes.akn` seulement : ces fichiers n'existent que dans le hub,
   cette pull request n'a pas d'équivalent pour `lungmen.akn`, qui n'a pas de `src/argocd/`).
   `seed.apps/shoot.applicationset.yaml` et `bootstrap.applications.yaml` (`Application` `argocd` et `seed`) pointent
   vers les copies sous `fleet/clusters/akn.rhodes/`.
   - Vérification : les `Application` `argocd` et `seed` sont `Synced` sur les nouveaux chemins ; mêmes `Application`
     qu'avant.
   - Retour arrière : `git revert` et, si le fichier d'amorçage a été réappliqué, le réappliquer depuis l'ancien commit.
4. **Supprimer l'ancien code.** Le code et le `dist/` sous `projects/<cluster>/` sont supprimés.
   - Vérification : `argocd app list` inchangé ; plus aucune référence aux anciens chemins (`grep`).
   - Retour arrière : `git revert`, l'ancien code revient.

### Détail de l'étape 8 : `lungmen.akn`, pull request 1

- **Constaté** : `projects/lungmen.akn` est copié (depuis l'arbre git de la pile, pas l'arbre de travail) sous
  `fleet/clusters/akn.lungmen/` : `src/apps` devient `kubernetes/src/apps`, `src/infrastructure/kubernetes` devient
  `kubernetes/src/system`, idem pour `dist/` ; le modèle Omni va dans `omni/`, `docs/assets` dans `assets/`, et
  `README.md`, `architecture.d2`, `.mise.toml` et `.sops.yaml` restent à la racine. `.sops.yaml` ne demande qu'une
  réécriture de `path_regex`, sans rechiffrement. Le `dist/` copié est identique octet à octet à l'ancien,
  `dist:render --check --all` et les lints passent. Les outils lisent les deux arborescences : `scripts/dist:render`,
  `oripathy:inventory` (lit `projects/<cluster>` tant qu'il existe, puis la copie, sans double comptage),
  `omni:template:lint`, `omni:drift:check`, la tâche de mise à jour des DERP, les workflows (fraîcheur du `dist`,
  conformité partielle et complète, lint Omni, Oripathy, PR Agent, DERP), `.rtunk/rtunk.yaml`, `.gitignore` et
  `.gitattributes`. Le modèle Omni est dupliqué mais inerte (la synchronisation est manuelle, à faire depuis `projects/`
  jusqu'à la pull request 4). `external-dns/.application.patch` de la copie garde les anciens chemins `projects/…` pour
  que le `dist` reste identique ; la pull request 2 le réécrit.
- **Constaté** : restent sur `projects/` jusqu'à la pull request 4 : `argocd:app:sync`, `bao:secret:audit`,
  `velero:backup`, `bao:smb:drift-check`, `wiki:publish` et `.agents/skills/cnpg-backup/scripts/discover-cnpg.sh`.
- **Risque** : les deux copies divergent si quelqu'un ne modifie que l'une d'elles (`--check` ne compare chaque copie
  qu'à sa propre `src/`). Geler les changements de `lungmen.akn` entre les pull requests 1 et 4, ou les appliquer aux
  deux. La conformité partielle lance une matrice sur 23 dossiers `dist` de plus, et `dist:render --check --all` est
  plus lent.
- **À confirmer** : `argocd appset generate` avec l'expression d'inversion des noms (pull request 2).

### Détail de l'étape 8 : `lungmen.akn`, pull request 2

- **Constaté** : `projects/rhodes.akn/src/argocd/seed.apps/shoot.applicationset.yaml` calcule `$dist` par cluster. Par
  défaut : `projects/<hôte>/dist/{infrastructure/kubernetes,apps}`. Si `has $host (list "lungmen.akn")` :
  `fleet/clusters/<hôte | splitList "." | reverse | join ".">/kubernetes/dist/{system,apps}`. La pull request 2 de
  `rhodes.akn` ajoute `"rhodes.akn"` à la liste ; la condition disparaît quand tous les clusters ont été déplacés. Le
  `.application.patch` de `external-dns` de la copie est réécrit (c'est le seul de `lungmen.akn` qui contient des
  chemins).
- **Constaté** (simulation hors ligne : `helm template` et expansion des générateurs sur une archive git, avec quatre
  faux secrets de cluster) : noms, espaces de noms et correspondances de patches identiques (23 `Application` pour
  `lungmen.akn`, 13 pour `rhodes.akn`) ; seuls les 23 chemins de `lungmen.akn` changent. Les espaces de noms viennent du
  basename, donc le renommage `infrastructure/kubernetes` vers `system` est sans effet. Dans le cluster, le
  `spec.sources[].path` de chaque `Application` est mis à jour en place, rien n'est recréé.
- **Risque** (à vérifier avant la fusion) : les applications tournent avec `prune: true` automatique. Avant de
  fusionner, `diff -r` entre les deux copies doit être vide, et toute branche ouverte qui touche le cluster doit être
  portée sur la copie. Sinon, ce qui n'existe que sous `projects/` est élagué à la bascule : les `Application`
  correspondantes sont supprimées et les objets des bases sont élagués.
- **Risque** : après la fusion, seule la copie sous `fleet/` est déployée : modifier `projects/lungmen.akn` ne fait
  silencieusement rien. Geler les changements jusqu'à la pull request 4.
- **À confirmer** : `argocd appset generate` avec les vrais secrets de cluster ; après la fusion, `argocd app list`
  donne les mêmes noms, aucune `Application` n'est supprimée ni recréée, l'état de synchronisation est inchangé et les
  `sources[].path` pointent vers `fleet/`.
- **Retour arrière** : `git revert`, les chemins reviennent vers l'ancien code, toujours présent.

### Détail de l'étape 8 : `lungmen.akn`, pull request 4

- **Constaté** : `projects/lungmen.akn/` est supprimé (892 fichiers suivis). Depuis la pull request 2, ArgoCD lit
  `fleet/clusters/akn.lungmen/kubernetes/` : plus rien ne lit l'ancien arbre. Le programme Pulumi, volontairement absent
  de la pull request 1, se déplace ici de `projects/lungmen.akn/src/infrastructure/pulumi/` vers
  `fleet/clusters/akn.lungmen/pulumi/`. Le projet est renommé `lungmen-akn-infra` en `lungmen-akn` (`Pulumi.yaml`,
  `package.json`, les quatre clés de configuration du projet dans `Pulumi.lungmen_akn.live.yaml`) ; le nom de pile
  `lungmen_akn.live` ne change pas. Aucune `StackReference` ne lit `lungmen-akn-infra`. Le `.sops.yaml` du cluster gagne
  la règle `pulumi/\.mise/env\.yaml$` (même destinataire age, sans rechiffrement) ; l'espace de travail pnpm gagne
  `fleet/clusters/*/pulumi`, le verrou et le `tsconfig` sont ajustés comme pour les hôtes.
- **Constaté** : les outils lisent `lungmen.akn` depuis `fleet/` seulement : `argocd:app:sync`, `bao:secret:audit`,
  `velero:backup`, le script de découverte de `cnpg-backup`, la tâche et le workflow DERP. Le modèle Omni s'utilise
  depuis `fleet/clusters/akn.lungmen/omni/`. Le code à double arborescence reste, pour `rhodes.akn`.
- **Constaté** : `wiki:lint` vérifie les liens de chaque page, donc cette pull request corrige les liens qui visaient
  l'arbre supprimé dans trois pages (`Initialiser-Lungmen`, `Plan-de-Reprise-apres-Sinistre`, l'expérimentation Proxmox
  CSI et CCM). Les 24 autres mentions textuelles de `projects/lungmen.akn` attendent l'étape 11.
- **Risque** : toute branche ouverte qui touche `projects/lungmen.akn` entre en conflit et doit être rebasée sur
  `fleet/`. Entre le renommage de l'état et la fusion, ne pas lancer Pulumi pour `lungmen.akn` depuis `main` : le nom du
  projet ne correspond plus à l'état.
- **À confirmer** : `pulumi stack rename` d'un projet à l'autre sur le backend S3 (à défaut : export, remplacement du
  nom de projet dans les URN, `pulumi stack init` puis `pulumi stack import`, ancienne pile supprimée après la
  vérification) ; le déchiffrement des clés de configuration après le renommage de leur préfixe ; un `preview` vide.
- **Manuel avant la fusion** :
  1. contrôler qu'aucun changement n'est arrivé sur `projects/lungmen.akn` depuis la pull request 2 (sinon le porter
     sous `fleet/`) ;
  2. sauvegarder l'état (`pulumi stack export`), puis répéter l'opération sur une copie ;
  3. renommer la pile (`pulumi stack rename organization/lungmen-akn/lungmen_akn.live`) ;
  4. vérifier `pulumi stack --show-name` (attendu : `lungmen_akn.live`, variable `PULUMI_STACK`) et que la configuration
     se déchiffre ;
  5. `pulumi preview` vide : tout `create`, `replace`, `delete` ou `update` arrête l'opération ;
  6. fusionner, puis `omnictl cluster template diff` depuis `fleet/clusters/akn.lungmen/omni/` (attendu : aucun écart).
- **Retour arrière** : avant la fusion, renommer la pile vers `lungmen-akn-infra` ou réimporter l'export ; après,
  `git revert` puis le même renommage. ArgoCD n'est pas touché dans les deux cas.
- **À faire à la fin de l'étape 8** (après `rhodes.akn`) : retirer la moitié `projects/` du code à double arborescence
  et la condition du `seed`. Fait par la pull request 4 de `rhodes.akn`.

### Détail de l'étape 8 : `rhodes.akn`, pull request 1

- **Constaté** : `projects/rhodes.akn` est copié (depuis l'arbre git de la pile, pas l'arbre de travail) sous
  `fleet/clusters/akn.rhodes/` (693 fichiers) : `src/apps` devient `kubernetes/src/apps`,
  `src/infrastructure/kubernetes` devient `kubernetes/src/system`, `src/argocd` devient `kubernetes/src/argocd`, idem
  pour `dist/` ; `src/bootstrap.applications.yaml` va dans `kubernetes/bootstrap.applications.yaml` ; le modèle Omni va
  dans `omni/` (dupliqué mais inerte) et `docs/assets` dans `assets/`. Les quatre tâches `dr:*` de
  `docs/disaster-recovery/.mise.toml` sont fusionnées dans le `.mise.toml` racine, et `patch-recovery-source` va dans
  `.mise/tasks/dr/cnpg/`. `.sops.yaml` ne demande qu'une réécriture de `path_regex`, sans rechiffrement. Le `dist/`
  copié est identique octet à octet à l'ancien, les `kustomize build` de `seed.apps` et de `shoot.apps` donnent le même
  résultat, et la simulation des ApplicationSets avec et sans la copie est identique : aucun ne pointe vers
  `akn.rhodes`, et aucun motif de génération ne couvre `fleet/clusters/*`.
- **Constaté** : `pulumi/` n'est pas dupliqué (même raison que pour `lungmen.akn`) : il se déplace en pull request 4,
  avec le renommage `rhodes-akn-infra` en `rhodes-akn`.
- **Constaté** : la copie garde les anciens chemins `projects/rhodes.akn/…` à cinq endroits, pour que le `dist/` reste
  identique et que rien ne change dans le cluster : `bootstrap.applications.yaml`,
  `seed.apps/shoot.applicationset.yaml`, les chemins factices de `shoot.apps` et les trois `.application.patch`
  (`pocket-id`, `vault`, `external-dns`). La pull request 2 réécrit les patches et ajoute `"rhodes.akn"` à la liste
  `has $host (list …)` du `seed` ; la pull request 3 pointe la source des `shoots` vers le `shoot.apps` de la copie et
  les `Application` `argocd` et `seed` du `bootstrap` vers
  `fleet/clusters/akn.rhodes/kubernetes/{dist/argocd,src/argocd/sops,src/argocd/seed.apps}`, puis applique à la main
  `kubectl apply --server-side -f fleet/clusters/akn.rhodes/kubernetes/bootstrap.applications.yaml`.
- **Constaté** : un seul changement d'outil partagé : `discover-cnpg.sh` lit depuis `projects/` seul un cluster présent
  dans les deux arborescences, pour ne pas lister deux fois les trois clusters CNPG de `rhodes.akn`. Les autres outils
  (dont `oripathy:inventory`) connaissent déjà les deux arborescences.
- **Risque** : les deux copies divergent si quelqu'un ne modifie que l'une d'elles (`--check` ne compare chaque copie
  qu'à sa propre `src/`). `rhodes.akn` est la production et le hub : geler ses changements entre les pull requests 1 et
  4, ou les appliquer aux deux. La conformité complète lance une matrice sur 25 dossiers `dist` de plus.
- **À trancher** : l'emplacement des outils de reprise après sinistre (`.mise/tasks/` de la copie, ou un dossier du
  style de `docs/`) ; les pages de procédure de reprise visent toujours `projects/`.
- **Retour arrière** : `git revert`, l'ancien code reste la référence et rien ne pointe vers la copie.

### Détail de l'étape 8 : `rhodes.akn`, pull request 2

- **Constaté** : le `seed` (`projects/rhodes.akn/src/argocd/seed.apps/shoot.applicationset.yaml`, et sa copie sous
  `fleet/clusters/akn.rhodes/kubernetes/src/argocd/seed.apps/`, gardées identiques) ajoute `"rhodes.akn"` à
  `has $host (list "lungmen.akn" "rhodes.akn")` dans les deux patches (`system`, `applications`). Le secret de cluster
  du hub s'appelle `rhodes.akn` (`clusterCredentials` de `helmvalues/default.yaml`) sans annotation
  `device.tailscale.com/hostname`, donc `$host` vaut `rhodes.akn` et les générateurs lisent
  `fleet/clusters/akn.rhodes/kubernetes/dist/{system,apps}/*`.
- **Constaté** : les trois `.application.patch` de la copie (`apps/pocket-id`, `apps/vault`, `system/external-dns`, src
  et dist via `dist:render`) visent maintenant `fleet/clusters/akn.rhodes/kubernetes/dist/…` et `…/src/…/sops`. Après
  rendu, les `dist/` des deux arborescences ne diffèrent que par ces trois fichiers. Les `Application` gardent leurs
  noms et espaces de noms (basename) : seul `sources[].path` change.
- **Constaté** : le `seed` lui-même est toujours servi depuis `projects/rhodes.akn/src/argocd/seed.apps`
  (l'`Application` `seed` du `bootstrap` n'est repointée qu'en pull request 3), c'est pourquoi les deux copies du `seed`
  sont modifiées.
- **Manuel avant la fusion** : `diff -r projects/rhodes.akn/dist/apps fleet/clusters/akn.rhodes/kubernetes/dist/apps` et
  `diff -r projects/rhodes.akn/dist/infrastructure/kubernetes fleet/clusters/akn.rhodes/kubernetes/dist/system` ne
  montrent que les trois `.application.patch` (les applications élaguent) ; geler `rhodes.akn` ; après la fusion et la
  synchro du `seed`, `argocd app list` : mêmes noms, aucune `Application` supprimée ni recréée, `sources[].path` vers
  `fleet/`, `pocket-id`, `vault` et `external-dns` `Synced`/`Healthy`.
- **Risque** : `rhodes.akn` est la production (OpenBao, Pocket-Id) ; un `dist/` divergent entre les copies serait
  appliqué avec élagage. Les sources `sops` des trois patches changent de dossier : le déchiffrement KSOPS ne dépend pas
  de `path_regex`, rien à rechiffrer.
- **À confirmer** : `argocd appset generate` sur le `seed` (comme pour `lungmen.akn`).
- **Retour arrière** : `git revert` ; les chemins reviennent vers `projects/`, toujours présent.

### Détail de l'étape 8 : `rhodes.akn`, pull request 3

- **Constaté** : le `seed` (les deux copies, `projects/rhodes.akn/src/argocd/seed.apps/` et
  `fleet/clusters/akn.rhodes/kubernetes/src/argocd/seed.apps/`, identiques) fait lire aux `Application` `shoot` (une par
  cluster, `lungmen.akn` compris) `fleet/clusters/akn.rhodes/kubernetes/src/argocd/shoot.apps` au lieu de
  `projects/rhodes.akn/src/argocd/shoot.apps`. `fleet/clusters/akn.rhodes/kubernetes/bootstrap.applications.yaml` pointe
  l'`Application` `argocd` vers `…/kubernetes/dist/argocd` et `…/kubernetes/src/argocd/sops`, et l'`Application` `seed`
  vers `…/kubernetes/src/argocd/seed.apps`. Les commandes d'amorçage du README d'ArgoCD de la copie visent la copie.
- **Constaté** : `shoot.apps`, `dist/argocd` et `src/argocd/sops` sont identiques entre les deux arborescences
  (`diff -r`), donc aucun manifeste ne change ; `dist:render --check` sur `src/argocd` passe. Les chemins factices
  `projects/{{ … }}/…` des générateurs de `shoot.apps` restent : les patches du `seed` les remplacent, ils partent en
  pull request 4.
- **Constaté** : les `Application` `argocd` et `seed` n'ont pas de synchronisation automatique, et
  `bootstrap.applications.yaml` n'est lu par aucune `Application` : la fusion seule ne change que les `shoot` (via le
  `seed` encore servi depuis `projects/`, une fois synchronisé à la main).
- **Manuel après la fusion** : `argocd app sync argocd/seed` (les `shoot` passent sur le `shoot.apps` de la copie, mêmes
  ApplicationSets) ; puis
  `kubectl apply --server-side -f fleet/clusters/akn.rhodes/kubernetes/bootstrap.applications.yaml` (les objets ont été
  créés en server-side, pas d'annotation `last-applied-configuration`) ; puis `argocd app sync argocd/argocd` et
  `argocd app sync argocd/seed` ; vérifier `argocd app get argocd/argocd -o json | jq '.spec.sources[].path'` et idem
  pour `seed` (chemins `fleet/`), les deux `Synced`, `argocd app list` inchangé.
- **Risque** : `argocd` gère ArgoCD lui-même ; une erreur de chemin le laisse `Unknown`/`ComparisonError` sans rien
  supprimer (`Prune=confirm`, `Delete=confirm`). Ne pas lancer de synchronisation avec élagage pendant la bascule.
- **Retour arrière** : `git revert`, puis réappliquer `projects/rhodes.akn/src/bootstrap.applications.yaml`
  (`--server-side`), toujours présent jusqu'à la pull request 4.

### Détail de l'étape 8 : `rhodes.akn`, pull request 4

- **Constaté** : `projects/rhodes.akn/` est supprimé (719 fichiers suivis, dont les 25 du programme Pulumi déplacés). Le
  programme Pulumi va de `projects/rhodes.akn/src/infrastructure/pulumi/` à `fleet/clusters/akn.rhodes/pulumi/` ; le
  projet `rhodes-akn-infra` devient `rhodes-akn` (`Pulumi.yaml`, `package.json`, préfixe des trois clés de configuration
  de `Pulumi.rhodes_akn.live.yaml`), la pile reste `rhodes_akn.live`. Le `.sops.yaml` de la copie gagne une règle pour
  `pulumi/.mise/env.yaml` (même destinataire age, pas de rechiffrement). Aucune `StackReference` ne lit
  `rhodes-akn-infra` : rien à renommer ailleurs.
- **Constaté** : le code à double arborescence est retiré pour les clusters : la condition `has $host` du `seed`
  disparaît (`$dist` vise toujours `fleet/clusters/<nom inversé>/kubernetes/dist/{system,apps}`), les chemins factices
  de `shoot.apps` prennent la forme `fleet/`, et la moitié `projects/` est retirée de `dist:render`,
  `oripathy:inventory`, `argocd:app:sync`, `bao:secret:audit` (dossiers `dist` seulement), `fleet:structure:lint`,
  `omni:template:lint`, `omni:drift:check`, `discover-cnpg.sh`, `.gitattributes`, `.gitignore`, `.rtunk/rtunk.yaml` et
  des workflows (staleness, conformité, pr-agent, inventaire, lint Omni, lint de structure). `projects/` garde
  `chezmoi.sh` et `shodan.akn` jusqu'aux étapes 9 à 11. La simulation des ApplicationSets donne exactement le même
  résultat qu'après la pull request 2.
- **Constaté** : seuls les liens signalés par `wiki:lint` sont corrigés dans `docs/` (8 liens). Restent pour l'étape 11
  : 122 lignes mentionnant `projects/rhodes.akn` dans 33 pages, et `rhodes-akn-infra` dans `Restaurer-OpenBao`,
  `Restaurer-Rhodes`, `DB-20260723` et le tableau de `INF-20260705`.
- **Manuel avant la fusion** :
  1. vérifier que les `Application` `argocd` et `seed` lisent déjà `fleet/` (pull request 3 appliquée), sinon elles
     pointeraient vers des chemins supprimés ;
  2. sauvegarder l'état (`pulumi stack export`) depuis l'ancien dossier sur `main` ;
  3. `pulumi stack rename organization/rhodes-akn/rhodes_akn.live` ;
  4. depuis `fleet/clusters/akn.rhodes/pulumi` (après `mise trust`) : `pulumi stack --show-name` donne
     `rhodes_akn.live`, la configuration se déchiffre, `pulumi preview` sans aucun changement.

  Entre le renommage et la fusion, ne pas lancer Pulumi pour `rhodes.akn` depuis `main`.

- **Manuel après la fusion** : `argocd app sync argocd/seed` (texte du gabarit changé, résultat identique),
  `argocd app list` inchangé,
  `omnictl cluster template diff -f fleet/clusters/akn.rhodes/omni/rhodes.clustertemplate.yaml` sans différence.
- **Risque** : `rhodes.akn` est la production et le hub ; un `pulumi preview` non vide après le renommage doit tout
  arrêter.
- **À trancher** : l'emplacement des outils de reprise après sinistre (aujourd'hui
  `fleet/clusters/akn.rhodes/.mise.toml` et `.mise/tasks/dr/`) ; `detect_argocd_server` de
  `scripts/argocd:app:sync.d/main.py` cherche encore l'ancienne disposition `projects/*/src/apps/*argocd/` (repli sur la
  détection par URL).
- **Retour arrière** : avant la fusion, renommer la pile vers `rhodes-akn-infra` ou réimporter l'export ; après,
  `git revert` puis le même renommage.

### Ce qui reste à confirmer à l'étape 8

Comme `bootstrap.applications.yaml` est appliqué à la main, les `Application` `argocd` et `seed` du cluster gardent
leurs anciens chemins tant que le fichier n'est pas réappliqué. Un `kubectl apply` manuel serait alors nécessaire
**avant la pull request 4** (sinon ces `Application` pointent vers des chemins supprimés), mais plus dans une fenêtre
serrée, puisque l'ancien code existe encore : **à confirmer**. Commandes actuelles du README d'ArgoCD de `rhodes.akn`
(les chemins cibles sont ceux de la copie) :

```sh
kubectl apply --server-side --force-conflicts -f fleet/clusters/akn.rhodes/kubernetes/dist/argocd/
kustomize build --enable-alpha-plugins --enable-exec fleet/clusters/akn.rhodes/kubernetes/src/argocd/sops \
  | kubectl apply --server-side -f -
kubectl apply --server-side -f fleet/clusters/akn.rhodes/kubernetes/bootstrap.applications.yaml
```

`bootstrap.applications.yaml` se trouve désormais dans la copie, à
`fleet/clusters/akn.rhodes/kubernetes/bootstrap.applications.yaml` (emplacement tranché ; ses chemins visent encore
`projects/rhodes.akn/…` jusqu'à la pull request 3). Entre la pull request 1 et la pull request 4, geler les
modifications du cluster, ou les appliquer aux deux copies. Les projets Pulumi des clusters sont renommés à la fin de
leur migration (`lungmen-akn-infra` devient `lungmen-akn`, `rhodes-akn-infra` devient `rhodes-akn`, voir
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

### Détail de l'étape 9 : `core.pbs`

- **Constaté** : `stack/proxmox-backup-server/` devient le projet Pulumi `pbs-core` (pile `pbs_core.live`) sous
  `fleet/hosts/core.pbs/pulumi/`, sur le modèle de `core.omni` (`Pulumi.yaml`, `package.json`, `tsconfig*.json`,
  `.mocharc.json`, `.mise.toml`, `.sops.yaml` avec une règle pour `pulumi/.mise/env.yaml`) ; `pnpm-workspace.yaml`
  couvre déjà `fleet/hosts/*/pulumi`. Le générateur de documentation (`toolbox/proxmox-backup-server-docs/`) suit,
  `PROXMOX_BACKUP_SERVER.md` va à la racine de l'hôte (`.rtunk/rtunk.yaml` suit), le README du composant devient celui
  de l'hôte. Noms logiques, types et parents inchangés, fournisseurs par défaut : pas d'alias. 16 ressources déplacées,
  5 racines : `pbs-user-pve-backup` (utilisateur, jeton, quatre ACL), `acme-dns-pbs` (jeton Cloudflare DNS-01), le
  bucket B2 `pbs-vm-backup` (`protect` et `retainOnDelete`), la clé B2 `pbs-vm-backup` (point S3, datastore, tâches de
  purge et de vérification), `pbs-notify-slack` (webhook et son filtre).
- **Constaté** : une seule ressource traverse la frontière : `proxmox.StoragePbs` `pve-storage-pbs` reste dans
  `chezmoi_sh` (ressource de Proxmox VE). Sans `StackReference` (ADR-017), elle lit le nom du jeton en constante
  (`pve-backup@pbs!pve-storage`) et son secret dans une nouvelle clé secrète `chezmoi-sh-infra:pveBackupTokenSecret`.
  `chezmoi_sh` n'exporte plus `pbsDns01Token`, `pveBackupTokenId` ni `pveBackupTokenSecret` (aucun lecteur dans le
  code). Une rotation du jeton dans `pbs-core` oblige à mettre à jour cette clé puis à appliquer `chezmoi_sh`.
- **Manuel avant la fusion** :
  1. créer `fleet/hosts/core.pbs/pulumi/.mise/env.yaml` (SOPS, `PULUMI_STACK=pbs_core.live`, nouvelle
     `PULUMI_CONFIG_PASSPHRASE`) ;
  2. `pulumi stack init pbs_core.live` ;
  3. `pulumi config set --secret` de `pbs-core:cloudflare_account_id`, `pbs-core:cloudflare_zone_id` et
     `pbs-core:notificationsSlackWebhookUrl` (mêmes valeurs que dans `chezmoi_sh`) ; l'authentification des fournisseurs
     `pbs` et `b2` vient de l'environnement, comme avant ;
  4. dans `chezmoi_sh`, `pulumi config set --secret pveBackupTokenSecret` avec la sortie actuelle, par un pipe ;
  5. exporter les deux états ;
  6. `pulumi state move` des 5 racines de `organization/chezmoi-sh-infra/chezmoi_sh.live` vers
     `organization/pbs-core/pbs_core.live` ;
  7. `pulumi preview` vide dans la destination, et dans la source seulement la suppression des 3 sorties.

  Après : retirer de `chezmoi_sh` les clés orphelines `pbs:endpoint`, `pbs:insecure` et `notificationsSlackWebhookUrl`.

- **Risque** : aucun `pulumi up` dans `chezmoi_sh` depuis cette branche avant le `state move` : le code ne déclare plus
  les ressources PBS, un `up` détruirait le jeton, les ACL, le datastore et la clé B2 (seul le bucket est retenu).
- **À confirmer** (sur une copie de l'état) : le `state move` entre deux piles à phrases secrètes différentes ; le
  déplacement du bucket protégé (peut-être un `pulumi state unprotect` d'abord) ; la dépendance de `pve-storage-pbs`
  vers le jeton, qui reste dans la source.
- **À trancher** : la clé secrète `pveBackupTokenSecret` contredit la règle du README de `stack/proxmox` (« aucun
  identifiant dans la configuration Pulumi »), déjà enfreinte par `garage_*` et le webhook ; l'autre option, une
  variable d'environnement avec `ignoreChanges`, ne propagerait plus une rotation. L'emplacement de
  `PROXMOX_BACKUP_SERVER.md` à la racine de l'hôte n'a pas de précédent.
- **Retour arrière** : `pulumi state move` inverse ou `pulumi stack import` des exports ; `git revert`.

### Détail de l'étape 9 : `core.nas`

- **Constaté** : `stack/truenas/` (avec `users/` et `zpools/`) devient le projet `nas-core` (pile `nas_core.live`) sous
  `fleet/hosts/core.nas/pulumi/`, sur le modèle de `core.pbs`. Le générateur `toolbox/truenas-docs/` suit, `TRUENAS.md`
  va à la racine de l'hôte (`.rtunk/rtunk.yaml` suit), le README du composant devient celui de l'hôte. 91 ressources
  déplacées (40 racines) : jeux de données, partages SMB, services, utilisateurs et leurs mots de passe `random`,
  gabarits d'ACL, tâches, certificats, applications (`retainOnDelete`), les deux pools (`chezmoi:truenas:Pool`), le
  jeton DNS-01 `acme-dns-truenas`, les buckets B2 `nas-backup` et `truenas-backup` (`protect`, `retainOnDelete`), la clé
  `truenas-replication` et les trois `vault:kv/secretV2` `smb-secret-{jellyfin,immich,paperless}`. Noms logiques, types
  et parents inchangés : pas d'alias. Rien ne traverse la frontière : aucune ressource restante ne lit TrueNAS et aucune
  autre pile ne lit ses sorties.
- **Constaté** : les secrets SMB continuent d'aller dans le montage `lungmen.akn/` d'OpenBao, désormais depuis
  `nas-core`. `scripts/bao:smb:drift-check` lit `fleet/hosts/core.nas/pulumi` (sa tâche `mise` y est déplacée) et gagne
  `--help`. `chezmoi.sh` perd les dépendances `@pulumi/truenas`, `@pulumi/b2`, `@pulumi/random`, `@pulumi/vault` et le
  composant `truenas-pool`.
- **Manuel avant la fusion** :
  1. créer `fleet/hosts/core.nas/pulumi/.mise/env.yaml` (SOPS, `PULUMI_STACK=nas_core.live`, nouvelle
     `PULUMI_CONFIG_PASSPHRASE`) puis `mise trust` ;
  2. `pulumi stack init nas_core.live` ;
  3. `pulumi config set --secret` de `nas-core:cloudflare_account_id`, `nas-core:cloudflare_zone_id`,
     `nas-core:garage_admin_token`, `nas-core:garage_rpc_secret`, `nas-core:garage_web_ui_password` et
     `nas-core:garage_web_ui_username` (mêmes valeurs que dans `chezmoi_sh`) ; les fournisseurs `truenas`, `b2` et
     `vault` lisent l'environnement comme avant ;
  4. exporter les deux états et vérifier dans l'export les 91 URN ;
  5. `pulumi state move` des 40 racines vers `organization/nas-core/nas_core.live` ;
  6. `pulumi preview` vide dans la destination, et dans la source seulement la suppression des 6 sorties (mots de passe
     SMB, `nfs4AclAssignments`) et peut-être de fournisseurs par défaut devenus inutiles ;
  7. `bao:smb:drift-check` sans dérive.

  Après : retirer de `chezmoi_sh` `truenas:url`, `truenas:destroyProtection` et les quatre clés `garage_*`.

- **Risque** : aucun `pulumi up` dans `chezmoi_sh` depuis cette branche avant le `state move`.
  `truenas:destroyProtection` refuse les suppressions côté TrueNAS mais ne couvre ni la clé B2, ni les secrets OpenBao,
  ni les mots de passe, ni le jeton Cloudflare. Des mots de passe recréés casseraient les montages SMB de `lungmen.akn`.
  L'état source peut garder des fournisseurs qui demandent les greffons `truenas` ou `b2`, retirés du `package.json` : à
  vérifier dans l'aperçu.
- **À confirmer** : mêmes points que pour `core.pbs` (phrases secrètes différentes, buckets protégés).
- **Retour arrière** : `pulumi state move` inverse ou `pulumi stack import` des exports ; `git revert`.

### Détail de l'étape 9 : `core.pve-01`

- **Constaté** : `proxmox/host/fs/` va dans `fleet/hosts/core.pve-01/fs/` (et son `.mise.toml` à la racine de l'hôte,
  tâches `host:*` inchangées) ; `stack/proxmox/` (avec `access/`) devient le projet `pve-01-core` (pile
  `pve-01_core.live`) sous `fleet/hosts/core.pve-01/pulumi/`, avec le générateur `toolbox/proxmox-docs/` ;
  `PROXMOX-VE.md` va à la racine de l'hôte ; les deux README fusionnent dans celui de l'hôte ; la tâche
  `proxmox:acme:rotate` suit. 40 ressources déplacées (39 racines et le jeton enfant `acme-dns-pve-token`) : rôles,
  utilisateurs, jetons et ACL d'Omni et des amorçages de `rhodes.akn` et `lungmen.akn`, pools et appartenances, zone,
  VNet, sous-réseau et applicateur SDN, groupe de sécurité du pare-feu `pve-sg-talos`, compte, greffon DNS et certificat
  ACME, stockage `pve-storage-pbs`, les deux `Secret` Kubernetes d'amorçage et le jeton DNS-01 `acme-dns-pve`. Les deux
  fournisseurs `kubernetes` explicites (`rhodes-akn`, `lungmen-akn`) suivent (copie automatique par `state move` : à
  confirmer). Il reste 8 ressources dans `chezmoi_sh` : observabilité (jeton et client OAuth), compartiment OCI, groupes
  et revendications Pocket-Id.
- **Constaté** : rien ne traverse la frontière en dehors de valeurs de configuration copiées (identifiants Cloudflare,
  contextes Kubernetes). `pve-storage-pbs` part avec sa clé `pveBackupTokenSecret` (ajoutée à l'étape 9 `core.pbs`),
  désormais dans `pve-01-core` : une rotation du jeton dans `pbs-core` oblige à mettre à jour `pve-01-core`.
  Contrairement à ce que supposait le plan, aucune tâche `mise` ne lit de sortie pour les amorçages : les jetons
  arrivent aux clusters par les `Secret` `kube-system/{rhodes,lungmen}-akn-bootstrap-pve`, lus par `Secret.get` ; rien à
  recibler. `chezmoi.sh` perd `@pulumi/proxmox`, `@pulumi/kubernetes`, `@chezmoi.sh/pulumi-lib`, `handlebars` et toute
  sa configuration de test (plus aucun test).
- **Manuel avant la fusion** :
  1. créer `fleet/hosts/core.pve-01/pulumi/.mise/env.yaml` (SOPS, `PULUMI_STACK=pve-01_core.live`, nouvelle
     `PULUMI_CONFIG_PASSPHRASE`) ;
  2. `pnpm install` ;
  3. `pulumi stack init pve-01_core.live` ;
  4. `pulumi config set --secret` de `pve-01-core:cloudflare_account_id` et `pve-01-core:cloudflare_zone_id` (depuis
     `chezmoi_sh`) et de `pve-01-core:pveBackupTokenSecret` (depuis la sortie de `pbs-core`) ; `proxmox:endpoint`,
     `proxmox:insecure` et les deux contextes Kubernetes sont déjà en clair dans le fichier de pile ; la connexion
     `root@pam` vient de l'environnement ;
  5. exporter les deux états ;
  6. `pulumi state protect` des racines dans la source, par précaution ;
  7. `pulumi state move` des 39 racines vers `organization/pve-01-core/pve-01_core.live` ;
  8. `pulumi preview` vide dans la destination, et dans la source aucune sortie modifiée, au plus la suppression de
     fournisseurs devenus inutiles.

  Après : retirer de `chezmoi_sh` `proxmox:endpoint`, `proxmox:insecure`, les deux contextes Kubernetes et
  `pveBackupTokenSecret`.

- **Risque** : aucune des 40 ressources n'a `protect` ni `retainOnDelete`. Un `pulumi up` dans `chezmoi_sh` depuis cette
  branche avant le déplacement supprimerait le SDN (eth1 `talosnet` de tous les nœuds Talos et chemin SNAT du pilote CSI
  vers l'API Proxmox), l'utilisateur, les rôles et les ACL d'Omni, les jetons et `Secret` d'amorçage, les pools, le
  stockage PBS (sauvegardes arrêtées), l'ACME et le groupe de sécurité : d'où le `state protect` préalable. Un `up` dans
  `pve-01-core` avant le déplacement tenterait de créer des doublons.
- **À confirmer** : le `state move` entre phrases secrètes différentes avec le `kubeconfig` secret des fournisseurs
  Kubernetes ; la copie automatique des fournisseurs.
- **À trancher** : les commentaires des `proxmox-cloud-controller-manager.helmvalues/default.yaml` des deux clusters
  nomment encore `stack/proxmox` de `chezmoi.sh` (modifier `src/` demande un `dist:render`) ; l'identifiant Oripathy
  d'`otelcol-contrib` passe de `chezmoi.sh/…` à `pve-01.core/…` (issues existantes dupliquées) ; la suppression complète
  de la configuration de test de `chezmoi.sh`.
- **Retour arrière** : `pulumi state move` inverse ou `pulumi stack import` des exports ; `git revert`.

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
  `.agents/skills/git-commit/SKILL.md`. Les scopes `fleet:*` et le label `fleet` existent depuis l'étape 1. Les scopes
  `catalog:flakes`, `catalog:opa`, `catalog:talos` et `catalog:kustomize` nomment des chemins disparus : ils partent
  aussi.
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
