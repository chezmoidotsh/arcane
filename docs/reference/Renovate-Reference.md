# Renovate Reference

Configuration des mises à jour automatiques de dépendances : fichier de configuration, annotations `# renovate:` posées
dans le dépôt, managers personnalisés et règles de regroupement.

> [!WARNING]\
> Vérifiée contre le dépôt le 2026-10-11 ; l'état de l'application Renovate côté GitHub n'a pas été revérifié.

## État actuel

Renovate est **désactivé** dans le dépôt. La clé `"enabled": false` figure en tête de
[`renovate.json5`](../../renovate.json5), avec le commentaire « Disable Renovate until the configuration has been
reworked to avoid some annoying auto-upgrades ».

| Question                                            | Réponse                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Renovate ouvre-t-il des PR depuis cette config ?    | Non, tant que `enabled` vaut `false`                                                                      |
| L'application GitHub Renovate est-elle installée ?  | Non établi par le dépôt (aucun workflow ne la lance ; elle s'exécute côté GitHub)                         |
| Un autre mécanisme met-il les dépendances à jour ?  | Aucun trouvé : ni `.github/dependabot.yml`, ni workflow de mise à jour, ni tâche `mise` ou `package.json` |
| Les annotations `# renovate:` sont-elles retirées ? | Non : 44 fichiers de `projects/` et `catalog/` les portent encore                                         |

Conséquence : les versions du dépôt (images, charts Helm, binaires Nix) sont aujourd'hui mises à jour à la main. Les
annotations et les sections ci-dessous restent valables en cas de réactivation, après le retravail annoncé dans le
commentaire de la configuration.

> [!NOTE]\
> Le linter `renovate` de rtunk (`renovate@43.233.3` dans [`.rtunk/rtunk.yaml`](../../.rtunk/rtunk.yaml)) valide la
> syntaxe de `renovate.json5` ; il ne dépend pas de l'état activé ou désactivé.

## Fichiers de configuration

| Élément             | Valeur                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier local       | [`renovate.json5`](../../renovate.json5) à la racine (l'ancien texte citait `renovate.json`, qui n'existe pas)                                      |
| Presets hérités     | `github>chezmoidotsh/renovate-config`, `github>chezmoidotsh/renovate-config:github-actions(monthly)`, `github>chezmoidotsh/renovate-config:gitmoji` |
| Contenu des presets | Non vérifié : ils vivent dans un autre dépôt (`chezmoidotsh/renovate-config`)                                                                       |

Le preset `:gitmoji` est hérité tel quel. Le dépôt n'utilise plus Gitmoji depuis
[ADR-010](../decisions/010-replace-gitmoji-with-symbol-commit-types.md) : les commits suivent le format
`type[scope]: Subject`, avec le scope `deps` pour les dépendances (`^[deps]: cert-manager to v1.16.0`). Le format réel
des messages que Renovate produirait n'est pas vérifiable depuis ce dépôt ; l'ancien exemple de PR
(`:arrow_up:(deps): ...`) est retiré faute de preuve.

## Annotations `# renovate:`

Une annotation est un commentaire posé directement avant la valeur à suivre. Elle donne la source (`datasource`), le
paquet (`depName`) et, pour Helm, le registre (`registryUrl`).

Répartition relevée dans `projects/` et `catalog/` (hors `dist/`) :

| Datasource        | Annotations | Usage typique                                              |
| ----------------- | ----------- | ---------------------------------------------------------- |
| `docker`          | 28          | Images, `newTag` Kustomize, valeur de `.application.patch` |
| `helm`            | 28          | Charts Helm (`registryUrl` pour les dépôts OCI ou HTTP)    |
| `github-releases` | 4           | Versions de binaires dans les modules Nix                  |

Le nom de la datasource est `github-releases` dans le dépôt ;
[ADR-007](../archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md) écrit `github-release`, qui n'est pas
le nom de la datasource Renovate.

### Formes reconnues

| Cible                             | Fichier               | Exemple                                                                                             |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Image Kustomize                   | `kustomization.yaml`  | `# renovate: datasource=docker depName=ghcr.io/actualbudget/actual-server` avant `- name:`          |
| Valeur d'un patch d'application   | `*.application.patch` | `# renovate: datasource=docker depName=ghcr.io/pocket-id/pocket-id` avant `value: "v2.7.0"`         |
| Label `app.kubernetes.io/version` | `kustomization.yaml`  | `# renovate: datasource=helm depName=immich registryUrl=https://immich-app.github.io/immich-charts` |

Exemple d'image Kustomize, tel qu'il figure dans `projects/lungmen.akn/src/apps/actual-budget/kustomization.yaml` :

```yaml
images:
  # renovate: datasource=docker depName=ghcr.io/actualbudget/actual-server
  - name: ghcr.io/actualbudget/actual-server
    newName: oci.chezmoi.sh/ghcr.io/actualbudget/actual-server
    newTag: "26.9.0"
```

Règles de saisie :

- Le commentaire est sur la ligne immédiatement avant l'entrée.
- Les versions numériques sont entre guillemets (`"26.9.0"`) pour éviter une lecture YAML en flottant.
- `depName` est le nom complet de l'image (registre et dépôt).

> [!WARNING]\
> Aucun `kustomization.yaml` du dépôt ne porte aujourd'hui de label `app.kubernetes.io/version` (0 occurrence sous
> `projects/`). L'exigence de label de version de
> [ADR-007](../archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md) et le manager de labels ci-dessous
> ne s'appliquent donc à aucun fichier existant. Les annotations des `kustomization.yaml` suivent le champ `images`.

## Managers personnalisés

Deux managers `regexManagers` sont actifs dans `renovate.json5` (sous réserve de réactivation). Les deux managers «
images inline `image:` » sont entièrement commentés : ils sont inactifs.

| Description du manager                                         | `fileMatch`                     | Capture                                                            |
| -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Labels `app.kubernetes.io/version` dans les fichiers Kustomize | `(^\|/)kustomization\.yaml$`    | `datasource`, `depName`, `registryUrl` (optionnel), `currentValue` |
| Valeur d'un fichier `.application.patch`                       | `\.application\.patch$`         | Mêmes captures, sur la ligne `value:` qui suit l'annotation        |
| Tag et digest d'images inline (commentés)                      | `\.ya?ml$` hors `kustomization` | Inactif                                                            |

Pour les deux managers actifs, la datasource par défaut est `docker` quand `datasource` est absent.

Constats vérifiés dans le fichier :

- Aucun manager personnalisé ne couvre le champ `images`/`newTag` de Kustomize : l'ancien texte décrivait une regex «
  Image Override Updates » qui n'existe pas dans `renovate.json5`. La prise en charge de ce champ dépend donc du manager
  Kustomize natif de Renovate ou des presets, ce que le dépôt ne permet pas de confirmer.
- Aucun manager ne cible les fichiers `.nix`, `default.yaml`, `*.helmvalues.yaml` ni `README.md`, alors que 9 de ces
  fichiers portent une annotation. Elles ne sont suivies que si un preset hérité les couvre (non vérifié).

## Règles de paquets

| Règle                                        | Portée                                               | Effet                                            |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Regroupement par paquet                      | datasources `docker` et `helm`                       | `groupName: "{{{depName}}}"` : une PR par paquet |
| Épinglage des digests dans les Kustomization | datasource `docker`, fichiers `kustomization.y(a)ml` | `pinDigest: true`                                |

La datasource `github-releases` n'est pas regroupée par ces règles.

## Points de l'ancien texte non retrouvés dans la configuration

| Affirmation de l'ancienne version                                                 | Constat                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Labels `type: dependencies` et `sync: manual` pour les applications `*`           | Aucune règle `labels` ni `matchFileNames` dans `renovate.json5` ; non vérifiable côté presets |
| Automerge de toutes les PR, y compris les applications à synchronisation manuelle | Aucune clé `automerge` locale ; non vérifiable côté presets                                   |
| Exemple `projects/amiya.akn/...`                                                  | `amiya.akn` n'est plus un projet du dépôt (migré vers `rhodes.akn`)                           |

Le préfixe `*` d'un répertoire d'application contrôle la politique de synchronisation ArgoCD, pas le comportement de
Renovate.

## Diagnostic

| Symptôme                                     | Vérification                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Aucune PR de mise à jour                     | Vérifier d'abord que `"enabled": false` a été retiré de `renovate.json5`                         |
| Version non détectée                         | Orthographe de `datasource` et `depName`, commentaire sur la ligne immédiatement avant la valeur |
| PR séparées pour un même paquet              | `depName` identiques entre les annotations ; le regroupement ne vaut que pour `docker` et `helm` |
| Annotation sans effet dans un fichier `.nix` | Aucun manager local ne couvre `.nix` : voir la section « Managers personnalisés »                |

## Historique

- _2026-10-11_ : migration vers le standard de documentation, en français ; `renovate.json` corrigé en `renovate.json5`
  ; état désactivé (`"enabled": false`) documenté ; preset `:gitmoji` signalé comme incohérent avec ADR-010 ; exemple de
  PR en format Gitmoji retiré ; regex « Image Override Updates » retirée (absente de la configuration) ; affirmations
  sur `sync: manual`, l'automerge et `amiya.akn` marquées non retrouvées ; emoji et titres `####` supprimés.
- _2025-11-01_ : première version (suivi des labels et des images Kustomize).

## Pour aller plus loin

- [`renovate.json5`](../../renovate.json5) : la configuration locale.
- [ADR-007 Structure des projets et conventions de nommage](../archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md)
  : la convention de labels de version et d'annotations.
- [ADR-010 Replace Gitmoji With Symbol Commit Types](../decisions/010-replace-gitmoji-with-symbol-commit-types.md) : le
  format de commit en vigueur.
- [Documentation Renovate](https://docs.renovatebot.com/) : référence amont des managers et des règles de paquets.
