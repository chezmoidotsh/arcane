# Renovate Reference

Configuration des mises à jour automatiques de dépendances : fichier de configuration, règles de regroupement, et ce qui
a été retiré au profit d'[Oripathy](Oripathy-Reference.md).

> [!WARNING]\
> Vérifiée contre le dépôt le 2026-10-21 ; l'état de l'application Renovate côté GitHub n'a pas été revérifié.

## État actuel

Renovate est **désactivé** dans le dépôt. La clé `"enabled": false` figure en tête de
[`renovate.json5`](../../renovate.json5), avec le commentaire « Disable Renovate until the configuration has been
reworked to avoid some annoying auto-upgrades ».

| Question                                            | Réponse                                                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renovate ouvre-t-il des PR depuis cette config ?    | Non, tant que `enabled` vaut `false`                                                                                                                            |
| L'application GitHub Renovate est-elle installée ?  | Non établi par le dépôt (aucun workflow ne la lance ; elle s'exécute côté GitHub)                                                                               |
| Un autre mécanisme met-il les dépendances à jour ?  | Oripathy signale quoi mettre à jour, la mise à jour reste manuelle ; ni `.github/dependabot.yml`, ni workflow de mise à jour, ni tâche `mise` ou `package.json` |
| Les annotations `# renovate:` sont-elles retirées ? | Oui, de tout le dépôt ; remplacées par `# oripathy:` (voir [Oripathy Reference](Oripathy-Reference.md))                                                         |

Conséquence : les versions du dépôt (images, charts Helm, binaires Nix) sont aujourd'hui mises à jour à la main.
Oripathy indique quel composant mettre à jour ; la configuration ci-dessous ne garde que `extends` et les deux
`packageRules`.

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
[ADR-010](../decisions/ADR-010-Remplacer-Gitmoji-par-des-Symboles-de-Type-de-Commit.md) : les commits suivent le format
`type[scope]: Subject`, avec le scope `deps` pour les dépendances (`^[deps]: cert-manager to v1.16.0`). Le format réel
des messages que Renovate produirait n'est pas vérifiable depuis ce dépôt ; l'ancien exemple de PR
(`:arrow_up:(deps): ...`) est retiré faute de preuve.

## Annotations et managers retirés

Les commentaires `# renovate:` ont été retirés de tout le dépôt, et le bloc `regexManagers` de `renovate.json5` avec
eux. Les versions à suivre sont désormais déclarées par des annotations `# oripathy:`, lues par l'inventaire décrit dans
[Oripathy Reference](Oripathy-Reference.md) : Oripathy remplace le flux piloté par commentaires pour trouver quoi mettre
à jour.

Si Renovate est réactivé, son manager Kustomize natif (pas les anciens `regexManagers`) peut lire les entrées `images:`
et `helmCharts:` des `kustomization.yaml`. Rien dans le dépôt ne le confirme aujourd'hui.

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

| Symptôme                          | Vérification                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Aucune PR de mise à jour          | Vérifier d'abord que `"enabled": false` a été retiré de `renovate.json5`             |
| Version non signalée par Oripathy | Voir [Oripathy Reference](Oripathy-Reference.md#lire-un-échec-de-la-ci) (annotation) |

## Historique

- _2026-10-21_ : annotations `# renovate:` et `regexManagers` retirés ; Oripathy documenté comme remplaçant du flux
  piloté par commentaires ; sections sur les annotations, les formes reconnues et les managers supprimées.
- _2026-10-11_ : migration vers le standard de documentation, en français ; `renovate.json` corrigé en `renovate.json5`
  ; état désactivé (`"enabled": false`) documenté ; preset `:gitmoji` signalé comme incohérent avec ADR-010 ; exemple de
  PR en format Gitmoji retiré ; regex « Image Override Updates » retirée (absente de la configuration) ; affirmations
  sur `sync: manual`, l'automerge et `amiya.akn` marquées non retrouvées ; emoji et titres `####` supprimés.
- _2025-11-01_ : première version (suivi des labels et des images Kustomize).

## Pour aller plus loin

- [`renovate.json5`](../../renovate.json5) : la configuration locale.
- [Oripathy Reference](Oripathy-Reference.md) : les annotations `# oripathy:` qui remplacent `# renovate:`.
- [ADR-007 Structure des projets et conventions de nommage](../archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md)
  : la convention de labels de version et d'annotations.
- [ADR-010 Remplacer Gitmoji par des symboles de type de commit](../decisions/ADR-010-Remplacer-Gitmoji-par-des-Symboles-de-Type-de-Commit.md)
  : le format de commit en vigueur.
- [Documentation Renovate](https://docs.renovatebot.com/) : référence amont des managers et des règles de paquets.
