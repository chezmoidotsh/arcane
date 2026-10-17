# OMNI-20260629-03 Reépingler les SHA après un squash-merge

Cette procédure remplace le SHA épinglé dans les templates de cluster Omni par celui du commit présent sur `main`, après
le squash-merge d'une pull request. Sans cela, les URL `raw.githubusercontent.com` des manifests de bootstrap Talos
(Cilium, metric-server, kubelet-serving-cert-approver) renvoient une erreur 404, et le cluster reste bloqué sans réseau.

> [!WARNING] Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur Omni.

Les templates de cluster Omni référencent les manifests de bootstrap par un SHA de commit Git exact. Omni télécharge ces
URL à la création du cluster et à chaque réconciliation. Si le SHA est inaccessible, le manifest n'est jamais récupéré
et des composants critiques comme Cilium (le CNI) ne sont jamais installés, sans erreur visible : le cluster attend
indéfiniment un réseau qui n'arrive pas.

## Cadre technique et conventions

- **Pourquoi épingler un SHA** : la reproductibilité (deux clusters créés à des semaines d'écart amorcent exactement les
  mêmes octets de manifest), la sécurité (une référence de commit est immuable, modifier un manifest passe toujours par
  une mise à jour explicite du template) et l'auditabilité (la version exacte de chaque manifest appliqué se lit dans le
  template, à côté de l'URL).
- **Le problème du squash-merge** : le squash-merge de GitHub crée sur `main` un **nouveau** commit, dont le SHA diffère
  de celui de la pointe de la branche. Les commits d'origine, dont celui sur lequel le template était épinglé, ne sont
  plus référencés et GitHub finit par les supprimer. L'URL `raw.githubusercontent.com/<org>/<repo>/<sha>/...` renvoie
  alors 404, les nœuds Talos n'obtiennent pas Cilium et le cluster n'a aucun réseau.
- **URL épinglées** : elles embarquent un SHA de 40 caractères, sous la forme
  `https://raw.githubusercontent.com/chezmoidotsh/arcane/$NEW_SHA/catalog/talos/manifests/...`. Le SHA doit exister sur
  la branche `main` de GitHub pour que l'URL se résolve.
- **Outils** : `git` (lire le commit de fusion), `curl` (vérifier l'accessibilité des URL), `sed` (réécrire le SHA) et
  `omnictl` (valider et appliquer le template), installé par `mise`.

Fichiers concernés :

| Fichier                                                                 | Rôle                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `projects/<cluster>/src/infrastructure/omni/<nom>.clustertemplate.yaml` | Template d'un cluster (`lungmen.akn`, `rhodes.akn`) |
| `catalog/omni/clustertemplates/base.yaml`                               | Template de base de référence                       |
| `catalog/talos/manifests/`                                              | Manifests de bootstrap référencés par SHA           |

État au 2026-10-11 : les trois templates épinglent le SHA `934e67a9b70724c834bc1ac7c0221551bb7772e9` (commit
`^[catalog:talos]: Bump bootstrap manifests to Cilium 1.20.2 and latest add-ons`, présent sur `origin/main`). Les
versions de manifest diffèrent selon le template :

| Template                       | Cilium          | kubelet-serving-cert-approver | metric-server |
| ------------------------------ | --------------- | ----------------------------- | ------------- |
| `base.yaml`                    | `1.20.2-native` | `0.12.1`                      | `0.9.0`       |
| `lungmen.clustertemplate.yaml` | `1.20.0-native` | `0.12.1`                      | `0.9.0`       |
| `rhodes.clustertemplate.yaml`  | `1.19.5-native` | `0.12.1`                      | `0.9.0`       |

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `git`, `curl`, `omnictl`
(`mise install`).

Les accès suivants sont également nécessaires :

- la pull request est squash-mergée sur `main` et le commit de fusion est poussé sur `origin/main` ;
- accès local au dépôt `chezmoidotsh/arcane`, avec `main` récupérée (`git fetch origin`) ;
- connexion à Omni, pour l'étape 5 uniquement : `OMNICONFIG` est défini par le `.mise.toml` racine et se renseigne avec
  `omnictl config new` (première utilisation) ou `omnictl config add`.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export OLD_SHA=<SHA actuellement épinglé dans les templates>      # ex. 934e67a9b70724c834bc1ac7c0221551bb7772e9 ; l'étape 3 l'affiche
export NEW_SHA=<SHA complet du commit de fusion sur origin/main>  # 40 caractères, relevé à l'étape 1
export TEMPLATE=<template du cluster à valider et à appliquer>    # ex. projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml
```

## Étape 1 — Identifier le commit de fusion sur `main`

Après le squash-merge, relever le SHA du commit qui vit désormais sur `main` : c'est lui qui persiste et reste
accessible sur GitHub.

```sh
git fetch origin
git rev-parse origin/main
# → le SHA complet de 40 caractères du commit de fusion
git log --oneline -1 origin/main
# → a1b2c3d  *[scope]: Subject
```

Le SHA complet de 40 caractères affiché par `git rev-parse` est la valeur `NEW_SHA` sur laquelle repinner les templates.
`git log --oneline` ne sert qu'à contrôler qu'il s'agit bien du commit de fusion : il abrège le SHA.

Lire `origin/main` (le dépôt distant) plutôt que le `main` local garantit de lire le commit que GitHub sert réellement
via `raw.githubusercontent.com`.

## Étape 2 — Vérifier l'accessibilité

Avant de toucher aux templates, confirmer que chaque URL épinglée se résout avec le nouveau SHA. Chaque commande doit
renvoyer `HTTP/2 200` (adapter le chemin des manifests aux versions de l'état ci-dessus) :

```sh
curl -sI "https://raw.githubusercontent.com/chezmoidotsh/arcane/$NEW_SHA/catalog/talos/manifests/cilium/1.20.2-native.yaml" | head -1
# → HTTP/2 200
curl -sI "https://raw.githubusercontent.com/chezmoidotsh/arcane/$NEW_SHA/catalog/talos/manifests/metric-server/0.9.0.yaml" | head -1
# → HTTP/2 200
curl -sI "https://raw.githubusercontent.com/chezmoidotsh/arcane/$NEW_SHA/catalog/talos/manifests/kubelet-serving-cert-approver/0.12.1.yaml" | head -1
# → HTTP/2 200
```

Pour les templates qui épinglent une autre version de Cilium (`1.20.0-native` pour `lungmen.akn`, `1.19.5-native` pour
`rhodes.akn`), contrôler aussi cette URL.

> [!IMPORTANT] Ne pas continuer si une URL renvoie 404. Un 404 signifie que le SHA n'est pas encore accessible : soit le
> commit de fusion n'est pas poussé sur `main`, soit le CDN de GitHub ne s'est pas encore rafraîchi (en général moins
> d'une minute après le push). Relancer `git fetch origin`, confirmer que le commit est sur `origin/main`, puis
> réessayer. Repinner sur un SHA inaccessible reproduit exactement la panne que cette procédure corrige.

## Étape 3 — Mettre à jour les templates

Remplacer l'ancien SHA par le nouveau dans chaque template : un par cluster sous
`projects/<cluster>/src/infrastructure/omni/`, plus le template de base `catalog/omni/clustertemplates/base.yaml`, qui
porte aussi le SHA épinglé.

```sh
# Relever l'ancien SHA épinglé (un seul SHA doit apparaître)
grep -ohE '[0-9a-f]{40}' \
  projects/*/src/infrastructure/omni/*.clustertemplate.yaml \
  catalog/omni/clustertemplates/base.yaml | sort -u
# → $OLD_SHA

sed -i "s/$OLD_SHA/$NEW_SHA/g" \
  projects/*/src/infrastructure/omni/*.clustertemplate.yaml \
  catalog/omni/clustertemplates/base.yaml
```

> [!NOTE] Avec le `sed` BSD (celui de macOS), l'option `-i` exige un suffixe de sauvegarde : écrire `sed -i ''` au lieu
> de `sed -i`. Le `sed` GNU (Linux, Nix) accepte `sed -i`.

## Étape 4 — Valider le template

La validation hors ligne confirme que le template reste bien formé après l'édition :

```sh
omnictl cluster template validate -f $TEMPLATE
# → aucune erreur
```

Les projets `lungmen.akn` et `rhodes.akn` fournissent une tâche `mise` qui encapsule cette commande (à lancer depuis le
dossier du projet) :

```sh
mise run omni:clustertemplate:validate
```

Pour un nouveau projet de cluster, utiliser directement la commande `omnictl cluster template validate -f <chemin>` ou
ajouter une tâche équivalente à son `.mise.toml`.

La validation détecte un YAML mal formé ou un chemin de manifest invalide, mais ne vérifie pas que le SHA épinglé est
accessible sur GitHub : c'est le rôle de l'étape 2. Effectuer ce contrôle avant toute application.

## Étape 5 — Appliquer le template

Une fois validé, appliquer le template repinné à Omni. Cette étape est en ligne et exige une connexion à Omni (voir les
prérequis) :

```sh
omnictl cluster template sync -f $TEMPLATE
```

> [!IMPORTANT] Utiliser `omnictl cluster template sync -f <fichier>` et non `omnictl apply -f`. `apply` est la commande
> générique des ressources COSI (YAML `metadata`/`spec`) et ne sait pas lire le DSL de template
> (`kind: Cluster`/`ControlPlane`/`Workers`) : elle échoue avec
> `yaml: construct errors: ... expected 4 elements node, got N`. Seule `cluster template sync` comprend ce DSL. Pointée
> sur un fichier unique (et non un dossier), elle reste limitée à ce cluster.

## Garde-fou CI recommandé

Aucun workflow ne vérifie aujourd'hui les SHA épinglés : `push,pull_request.omni-template-lint.yaml` ne contrôle que les
CIDR (ADR-014). Un job CI exécuté sur `push` vers `main` détecte, après le merge, un SHA qui n'appartient pas à `main`
(typiquement un SHA propre à une branche, détruit par le squash-merge). C'est une détection a posteriori : elle ne peut
pas empêcher le SHA d'atterrir, mais elle alerte avant que le cluster ne soit recréé ou réconcilié. Le job extrait
chaque SHA de 40 caractères hexadécimaux des templates et vérifie que chacun est un ancêtre de `origin/main`.

```sh
# Extraire les SHA épinglés des templates et vérifier que chacun appartient à l'historique de origin/main
grep -ohE '[0-9a-f]{40}' \
  projects/*/src/infrastructure/omni/*.clustertemplate.yaml \
  catalog/omni/clustertemplates/base.yaml \
  | sort -u \
  | while read -r sha; do
      if ! git merge-base --is-ancestor "$sha" origin/main; then
        echo "BROKEN SHA: $sha is not an ancestor of origin/main" >&2
        exit 1
      fi
    done
```

Fonctionnement :

1. Extraction de tous les SHA de 40 caractères hexadécimaux (`[0-9a-f]{40}`) des templates.
2. Vérification de chacun avec `git merge-base --is-ancestor <SHA> origin/main` : le commit doit appartenir à
   l'historique de `main`.
3. Échec du job si un SHA n'en fait pas partie (un SHA propre à une branche, qui renverra 404 après le squash-merge).

Le test n'est pas `git cat-file -t`. Dans le clone d'une pull request, les commits de la branche sont présents : la
commande réussirait pour un SHA qui échouera après le squash-merge. À l'inverse, avec le checkout superficiel par défaut
d'`actions/checkout`, un SHA pourtant légitime de `main` pourrait échouer : le job clone l'historique complet
(`fetch-depth: 0`).

Limiter le job aux `push` sur `main` qui touchent un template (filtre de chemins).

## Vérifications rapides

- **SHA dans les templates** :
  `grep -ohE '[0-9a-f]{40}' projects/*/src/infrastructure/omni/*.clustertemplate.yaml catalog/omni/clustertemplates/base.yaml`
  — chaque SHA doit correspondre à un commit de `main`.
- **Accessibilité** :
  `curl -sI "https://raw.githubusercontent.com/chezmoidotsh/arcane/$NEW_SHA/catalog/talos/manifests/cilium/1.20.2-native.yaml" | head -1`
  — doit renvoyer `HTTP/2 200`.
- **Template appliqué** : `omnictl get cluster <nom>` — le cluster se réconcilie avec les manifests repinnés.

## Historique

- _2026-10-17_ : Reprise après revue : l'état de vérification est un callout `WARNING`, les entrées sont des variables
  `export`, le SHA complet se lit avec `git rev-parse` et le garde-fou CI teste `git merge-base --is-ancestor` après le
  merge au lieu de `git cat-file -t`.
- _2026-10-11_ : Données alignées sur le dépôt. Le SHA épinglé est `934e67a9b70724c834bc1ac7c0221551bb7772e9` (et non
  `06e860db…`) dans les trois templates ; les versions de manifest sont `1.20.2-native` (base), `1.20.0-native`
  (`lungmen.akn`) et `1.19.5-native` (`rhodes.akn`), `metric-server/0.9.0.yaml` et
  `kubelet-serving-cert-approver/0.12.1.yaml` (ce dernier est ajouté, l'ancien `metric-server/0.8.1.yaml` n'est plus
  référencé). La tâche `omni:clustertemplate:validate` existe aussi dans `projects/rhodes.akn/.mise.toml`, pas seulement
  dans `lungmen.akn`. L'authentification Omni ne passe plus par `mise run bao:login:admin` depuis `projects/chezmoi.sh/`
  (cette tâche racine ouvre une session OpenBao) : `OMNICONFIG` est défini par le `.mise.toml` racine et se renseigne
  avec `omnictl config new` ou `omnictl config add`. Le garde-fou CI inclut `catalog/omni/clustertemplates/base.yaml`,
  qui porte lui aussi le SHA. Renvoi corrigé vers `OMNI-20260721-00` (et non `OMNI-20260629-00`).
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structure
  alignée sur le gabarit de procédure, liens vers les procédures renommées.
- _2026-06-29_ : Réécriture en anglais. Ajout de la vérification d'accessibilité, de la portée par cluster plus template
  de base, de la note sur `sed` BSD/macOS, du garde-fou CI basé sur `git cat-file` et du renvoi vers la procédure de
  création de cluster.
- _2026-06-29_ : Création initiale. Stratégie d'épinglage par SHA et procédure de repin après squash-merge pour les
  templates de cluster Omni.

## Pour aller plus loin

- [Créer un cluster Talos avec Omni](./OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : la création d'un cluster,
  qui consomme ces manifests de bootstrap.
- [Documentation Omni](https://omni.sidero.dev/) : référence de `omnictl` et des templates de cluster.
- [Documentation Talos](https://www.talos.dev/) : amorçage du CNI et des manifests supplémentaires.
- [Manifests de bootstrap](../../../catalog/talos/manifests/) : Cilium, metric-server et kubelet-serving-cert-approver
  référencés par SHA.
