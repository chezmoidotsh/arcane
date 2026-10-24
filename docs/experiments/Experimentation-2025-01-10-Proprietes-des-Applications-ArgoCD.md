# Expérimentation 2025-01-10 Propriétés Des Applications ArgoCD

Un ApplicationSet peut personnaliser chaque application (métadonnées, politique de synchronisation, namespace) tout en
gardant la découverte « un dossier égale une application », en fusionnant un générateur Git Directory et un générateur
Git Files qui lit un fichier optionnel `.application.patch`. Les 14 vérifications de l'expérience sont passées et la
solution est en production sur `rhodes.akn` et `lungmen.akn`.

| Métadonnée     | Valeur         |
| -------------- | -------------- |
| Identifiant    | `EXP-2025-001` |
| Statut         | `Finished`     |
| Créée le       | 2025-01-10     |
| Version ArgoCD | 2.14.x         |
| ADR lié        | aucun (`TBD`)  |

## Question

Les ApplicationSets d'Arcane découvrent les applications avec un Git Directory Generator : chaque sous-répertoire de
`projects/<cluster>/src/apps/*` devient une Application ArgoCD.

```text
projects/lungmen.akn/src/apps/
├── *argocd/          → Application argocd (synchronisation manuelle)
├── actual-budget/    → Application actual-budget (synchronisation automatique)
├── immich/           → Application immich (synchronisation automatique)
└── n8n/              → Application n8n (synchronisation automatique)
```

Le comportement de l'époque :

- le nom du dossier (sans le préfixe `*`) devient le nom de l'Application ;
- le nom du dossier devient le namespace cible ;
- le préfixe `*` désigne une synchronisation manuelle (ni prune ni selfHeal automatiques) ;
- toutes les Applications utilisent le projet `default`, codé en dur.

| Limite                                      | Effet                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Aucune métadonnée                           | Impossible d'afficher version, description ou liens de documentation dans l'UI    |
| Politique de synchronisation par convention | Le préfixe `*` n'est pas intuitif et doit être appris                             |
| Aucun changement de namespace               | Le namespace est forcément le nom du dossier                                      |
| Extensibilité limitée                       | Toute personnalisation passe par une modification du template de l'ApplicationSet |

La question : comment personnaliser une application (visibilité opérationnelle, namespace partagé comme pour une pile de
supervision, configuration explicite à la place des conventions implicites, labels et annotations) sans perdre la
découverte par dossier, et avec uniquement des fonctions natives d'ArgoCD ?

Exigences retenues :

| ID     | Exigence                                                                              | Priorité |
| ------ | ------------------------------------------------------------------------------------- | -------- |
| FR-01  | Une application sans fichier de patch se comporte comme avant                         | Must     |
| FR-02  | Le fichier de patch suit un schéma aligné sur la Custom Resource Application d'ArgoCD | Must     |
| FR-03  | Le patch gère les champs `metadata` (labels, annotations)                             | Must     |
| FR-04  | Le patch gère les champs `spec` (destination, syncPolicy, info)                       | Must     |
| FR-05  | Le patch peut surcharger les valeurs par défaut du template de l'ApplicationSet       | Must     |
| FR-06  | Le format du patch est le YAML                                                        | Must     |
| FR-07  | La structure de type Kubernetes laisse la porte ouverte à de futures extensions       | Should   |
| NFR-01 | Aucun outil ni contrôleur externe                                                     | Must     |
| NFR-02 | Compatible avec l'arborescence existante                                              | Must     |
| NFR-03 | Un fichier de propriétés invalide échoue sans casser le reste                         | Should   |
| NFR-04 | Fonctionne avec ArgoCD 2.9 et plus                                                    | Must     |

Contraintes : fonctions natives des ApplicationSets uniquement, aucune modification de l'installation d'ArgoCD, toute la
configuration dans Git.

## Montage

### Principe

Le Merge Generator produit l'union de deux générateurs enfants selon une clé commune. Ici, un générateur Git Directory
liste les dossiers d'applications et un générateur Git Files lit les `.application.patch` ; leurs résultats sont
fusionnés sur le nom et le chemin de l'application. Une application sans patch reçoit uniquement les valeurs par défaut.

Chaque générateur enfant est un Matrix (Git + List), pour contourner un défaut connu d'ArgoCD : l'accès à une clé
imbriquée dans un Merge échoue quand `goTemplate` est activé
([argo-cd#12836](https://github.com/argoproj/argo-cd/issues/12836)). Le `templatePatch` applique ensuite le contenu du
patch sur le template de base, après filtrage des champs.

L'ApplicationSet de l'expérience est dans
[manifests/apps.applicationset.yaml](argocd-application-properties/manifests/apps.applicationset.yaml) (clés de fusion
`app_name` et `app_path`) ; les projets de test sont dans
[manifests/argocd-projects.yaml](argocd-application-properties/manifests/argocd-projects.yaml).

### Schéma du fichier `.application.patch`

Le fichier reprend la structure de la Custom Resource Application (`apiVersion`, `kind`, `metadata`, `spec`).

```yaml
apiVersion: arcane.chezmoi.sh/v1alpha1
kind: ApplicationPatch

metadata:
  labels:
    env: production
    owner: platform-team
  annotations:
    argocd.argoproj.io/manifest-generate-paths: "."

spec:
  info:
    - name: Description
      value: "Human-readable description"
    - name: Version
      value: "1.0.0"
  # null désactive entièrement la synchronisation automatique
  syncPolicy: null
  destination:
    namespace: custom-namespace # par défaut : nom du dossier
```

| Section    | Champ         | Rôle                                                                    |
| ---------- | ------------- | ----------------------------------------------------------------------- |
| `metadata` | `labels`      | Labels appliqués à l'Application                                        |
| `metadata` | `annotations` | Annotations appliquées                                                  |
| `spec`     | `info`        | Paires nom/valeur affichées dans l'UI d'ArgoCD                          |
| `spec`     | `syncPolicy`  | Politique de synchronisation (`null` pour une synchronisation manuelle) |
| `spec`     | `destination` | Seul `namespace` est surchargeable                                      |

Le champ `project` n'est pas personnalisable : ArgoCD doit connaître le projet avant d'analyser le dépôt, donc une
affectation dynamique par l'ApplicationSet est impossible.

### Valeurs par défaut

Sans fichier de patch, ou pour les champs omis :

| Champ                   | Valeur par défaut      | Origine                        |
| ----------------------- | ---------------------- | ------------------------------ |
| `metadata.labels`       | aucune                 | non appliqué                   |
| `metadata.annotations`  | aucune                 | non appliqué                   |
| `spec.info`             | `[]`                   | tableau vide                   |
| `spec.syncPolicy`       | automatique avec prune | template de l'ApplicationSet   |
| `destination.namespace` | `{{ .app_name }}`      | nom du dossier                 |
| `project`               | `"default"`            | codé en dur, non surchargeable |

La `syncPolicy` par défaut du template :

```yaml
syncPolicy:
  automated:
    enabled: true
    prune: true
    selfHeal: true
    allowEmpty: false
  syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
    - PruneLast=true
    - ApplyOutOfSyncOnly=true
    - SkipDryRunOnMissingResource=true
    - Replace=true
```

| Scénario                         | Fichier de patch                 | Résultat                                    |
| -------------------------------- | -------------------------------- | ------------------------------------------- |
| Application standard             | absent                           | toutes les valeurs par défaut               |
| Application avec `info`          | présent avec `spec.info`         | informations dans l'UI, reste par défaut    |
| Application avec `metadata`      | présent avec `metadata`          | labels et annotations appliqués             |
| Infrastructure critique          | présent, `syncPolicy: null`      | synchronisation manuelle, pas de prune auto |
| Application en namespace partagé | présent, `destination.namespace` | namespace personnalisé                      |

### Filtrage des champs dans le `templatePatch`

Le `templatePatch` extrait les seuls champs autorisés avec des fonctions Go template ; `pick` empêche d'injecter une
configuration non prévue.

```yaml
templatePatch: |
  {{- $sanitizedMetadata := pick (dig "metadata" dict .) "annotations" "labels" -}}
  {{- if ne (len $sanitizedMetadata) 0 }}
  metadata: {{ toYaml $sanitizedMetadata | nindent 2 }}
  {{- end }}

  {{-
    $sanitizedSpec := merge
      (pick (dig "spec" dict .) "info" "syncPolicy")
      (dict "destination" (pick (dig "spec" "destination" dict .) "namespace"))
  -}}
  {{- if ne (len $sanitizedSpec) 0 }}
  spec: {{ toYaml $sanitizedSpec | nindent 2 }}
  {{- end }}
```

| Fonction | Rôle                                                                    |
| -------- | ----------------------------------------------------------------------- |
| `dig`    | Parcourt des maps imbriquées et renvoie une valeur par défaut si absent |
| `pick`   | Garde uniquement les clés indiquées (filtrage)                          |
| `merge`  | Combine plusieurs maps                                                  |
| `toYaml` | Convertit un objet Go en YAML                                           |

### Environnement de test

| Composant | Version | Rôle                          |
| --------- | ------- | ----------------------------- |
| k3d       | 5.x     | Cluster Kubernetes léger      |
| ArgoCD    | 2.14.x  | Contrôleur GitOps             |
| Gitu      | -       | Serveur Git local (optionnel) |

Quatre applications de test sont dans [test-apps/](argocd-application-properties/test-apps/) :

| Application            | Patch | Objet                                                |
| ---------------------- | ----- | ---------------------------------------------------- |
| `app-default`          | non   | Comportement par défaut sans patch (TC-01)           |
| `app-with-info`        | oui   | `info`, labels et annotations (TC-02)                |
| `app-manual-sync`      | oui   | `syncPolicy: null`, synchronisation manuelle (TC-03) |
| `app-custom-namespace` | oui   | Surcharge de `destination.namespace` (TC-04)         |

L'environnement est géré par [mise](https://mise.jdx.dev/) ([.mise.toml](argocd-application-properties/.mise.toml)) et
isolé dans le dossier de l'expérience (`.kube/` et `.helm/`, ignorés par Git) : pas d'interférence avec le
`~/.kube/config` de production ni avec les dépôts Helm du système, et état propre après `mise run clean`. Docker et mise
sont requis. Les scripts sont [setup.sh](argocd-application-properties/scripts/setup.sh),
[validate.sh](argocd-application-properties/scripts/validate.sh) et
[cleanup.sh](argocd-application-properties/scripts/cleanup.sh).

```sh
cd docs/experiments/argocd-application-properties
mise install   # k3d, kubectl, helm, argocd, jq, yq
mise trust

# Cycle complet
mise run full-test

# Ou étape par étape
mise run setup    # cluster k3d + ArgoCD
git push          # la branche doit être sur GitHub pour qu'ArgoCD la lise
mise run deploy   # ApplicationSet
mise run test     # validation (alias : validate)
mise run clean    # nettoyage (alias : cleanup)
```

Les autres tâches : `mise run status` (état des Applications), `mise run ui` (port-forward vers l'UI),
`mise run password` (mot de passe admin ArgoCD) et `mise run logs` (journaux du contrôleur ApplicationSet).

## Résultats

Critères de succès : tous les cas passent, aucune régression sur le comportement existant (TC-01), le fichier de
propriétés reste optionnel, l'UI d'ArgoCD affiche les champs `info`. La personnalisation du projet a été retirée en
cours d'expérience (limite d'ArgoCD décrite plus haut), donc l'application `app-custom-project` n'existe plus.

| Cas   | Scénario                                | Résultat attendu                              | Statut |
| ----- | --------------------------------------- | --------------------------------------------- | ------ |
| TC-01 | Application sans patch                  | Valeurs par défaut, synchronisation auto      | Passé  |
| TC-02 | Application avec `info` + metadata      | `info` visible dans l'UI, labels appliqués    | Passé  |
| TC-03 | Application avec `syncPolicy: null`     | Pas de synchronisation automatique            | Passé  |
| TC-04 | Application avec namespace personnalisé | Déployée dans le namespace indiqué            | Passé  |
| TC-05 | Génération de l'ApplicationSet          | Les 4 applications sont découvertes et créées | Passé  |

Bilan : 14 vérifications exécutées, 14 réussies, 0 échec, 0 ignorée. Le détail :

| Vérification | Résultat | Détail                                  |
| ------------ | -------- | --------------------------------------- |
| TC-05a       | Passé    | L'ApplicationSet génère 4 applications  |
| TC-05b       | Passé    | L'ApplicationSet n'a aucune erreur      |
| TC-01a       | Passé    | Le namespace est le nom du dossier      |
| TC-01b       | Passé    | Le projet est `default`                 |
| TC-01c       | Passé    | La syncPolicy est automatique           |
| TC-01d       | Passé    | `info` est vide (défaut)                |
| TC-02a       | Passé    | `info` contient 4 entrées               |
| TC-02b       | Passé    | Le champ Description est renseigné      |
| TC-02c       | Passé    | Le champ Version vaut 1.0.0             |
| TC-02d       | Passé    | La syncPolicy reste automatique         |
| TC-03a       | Passé    | La syncPolicy est manuelle (pas d'auto) |
| TC-03d       | Passé    | `info` contient 3 entrées               |
| TC-04a       | Passé    | La surcharge de namespace est appliquée |
| TC-04b       | Passé    | Le projet reste `default`               |

Observations :

1. Le Merge Generator fonctionne : une application sans `.application.patch` reçoit toutes les valeurs par défaut, une
   application avec patch voit ses personnalisations fusionnées.
2. La compatibilité ascendante est confirmée : `app-default` se comporte comme avant.
3. `syncPolicy: null` supprime entièrement le bloc de synchronisation automatique, ce qui impose une synchronisation
   manuelle.
4. Le filtrage fonctionne : seuls `info`, `syncPolicy`, `destination.namespace`, `labels` et `annotations` sont
   appliqués, les autres champs sont ignorés.
5. Le contournement Matrix + List fonctionne pour l'issue #12836.
6. Aucun impact mesurable sur les performances : le contrôleur traite le Merge efficacement et les 4 applications sont
   générées en quelques secondes après le déploiement.

## Conclusion

Statut : adoptée. La solution est viable, ne rompt pas la compatibilité et satisfait les exigences FR-01 à FR-07 : une
application sans patch est inchangée, le patch suit la structure de la CR Application, gère `metadata` et `spec`
(destination, syncPolicy, info), surcharge les valeurs par défaut, est en YAML et reste extensible. Une limite est
confirmée : le projet ne peut pas être affecté dynamiquement par un ApplicationSet.

Recommandations de l'époque : adopter la solution, écrire un ADR (le champ « ADR lié » est resté `TBD`), migrer du
préfixe `*` vers un `syncPolicy: null` explicite, documenter le schéma `.application.patch`, puis l'appliquer aux
ApplicationSets de production.

> [!NOTE]\
> **État au 2026-10-11 : la solution est en production.** Les ApplicationSets
> [`system`](../../projects/rhodes.akn/src/argocd/shoot.apps/system.applicationset.yaml) et
> [`applications`](../../projects/rhodes.akn/src/argocd/shoot.apps/applications.applicationset.yaml) de `rhodes.akn`
> fusionnent un générateur Git Directory et un générateur Git Files sur `*/.application.patch`, chacun dans un Matrix
> avec un List, et appliquent un `templatePatch`. Leur chemin se construit à partir de l'annotation
> `device.tailscale.com/hostname` ou du nom du cluster ; `projects/lungmen.akn/src/` n'a pas de dossier `argocd/`. Le
> dépôt contient 9 fichiers `.application.patch` sous `projects/rhodes.akn/src/` et 13 sous `projects/lungmen.akn/src/`.
> La clé de fusion est `.key` (le `basename` du chemin) au lieu de `app_name` et `app_path`. Plus aucun dossier
> d'application ne porte le préfixe `*` dans `projects/*/src/apps/`.

## Pour aller plus loin

- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](../decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md)
  : les ApplicationSets lisent aujourd'hui les chemins `dist/`.
- [Générateur Merge d'ArgoCD](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Merge/)
  : la documentation du générateur utilisé.
- [Générateur Matrix d'ArgoCD](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Matrix/)
  : le générateur utilisé dans chaque branche du Merge.
- [Issue argo-cd#12836](https://github.com/argoproj/argo-cd/issues/12836) : le défaut de clés imbriquées contourné par
  Matrix + List.
