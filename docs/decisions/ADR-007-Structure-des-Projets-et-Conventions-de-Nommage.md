---
status: "implemented"
date: 2026-05-24
implementation-completed: 2026-03-19
decision-makers: ["Alexandre"]
assisted-by: ["claude-4-sonnet", "claude-opus-4.5"]
informed: []
template-version: "2.0.0"
---

# ADR-007 Structure des projets et conventions de nommage

Migré le 2026-10-11 ; les affirmations sur l'état des clusters n'ont pas été revérifiées.

Titre d'origine : « Project Structure and Naming Conventions ».

## Contexte et problème

L'infrastructure Arcane a évolué au fil de plusieurs clusters et applications. Trois types de projets principaux sont
aujourd'hui en production ou en développement actif :

1. **amiya.akn** : cluster de la plateforme cœur (production), Talos Linux + ArgoCD
2. **lungmen.akn** : cluster des applications domestiques (développement actif), Talos Linux + ArgoCD
3. **chezmoi.sh** : ressources d'infrastructure partagées (providers Crossplane)

Un audit de ces projets a mis en évidence des incohérences importantes dans la structure des applications, les
conventions de nommage, les labels Kubernetes, l'organisation des ressources et le nommage des fichiers. Ces
incohérences entraînent :

- **Une charge de maintenance** : des motifs différents imposent de changer de contexte d'un projet à l'autre
- **Des frictions de prise en main** : aucune source de vérité unique pour la structure « correcte »
- **Une complexité de l'outillage** : les scripts et l'automatisation doivent gérer plusieurs motifs
- **Des risques de migration** : des standards flous rendent les migrations de cluster sujettes aux erreurs

Sans conventions standardisées, chaque nouvelle application ou chaque nouveau déploiement de cluster devient un point de
décision, ce qui alourdit la charge cognitive et réduit la vitesse opérationnelle.

## Facteurs de décision

### Exigences fonctionnelles

- **Cohérence** : le même motif sur tous les clusters et toutes les applications
- **Intégration ArgoCD** : prise en charge du motif App-of-Apps et des workflows GitOps
- **Découvrabilité** : une structure claire permet de localiser rapidement les ressources
- **Suivi des versions** : mises à jour automatisées des dépendances via Renovate
- **Isolation de sécurité** : network policies et gestion des secrets
- **Contrôle de la synchronisation** : un mécanisme clair pour choisir entre synchronisation manuelle et automatique

### Exigences non fonctionnelles

- **Maintenabilité** : réduire la charge cognitive pour un homelab à opérateur unique
- **Support de l'outillage** : permettre l'automatisation et les scripts
- **Facilité de migration** : un chemin clair pour standardiser les projets existants
- **Évolutivité** : permettre la croissance sans restructuration
- **Sûreté** : protéger l'infrastructure critique d'une automatisation accidentelle

### Contraintes

- **Écosystème ArgoCD** : fonctionner dans le cadre des capacités et des motifs d'ArgoCD
- **Intégration Kustomize** : s'appuyer sur Kustomize pour la gestion des ressources
- **Support de Helm** : prendre en charge les charts Helm avec des surcouches de valeurs
- **Infrastructure existante** : migrer en douceur depuis l'état actuel
- **Limites des ApplicationSets** : peu de structures de contrôle dans le templating

## Options envisagées

Les options sont regroupées en trois questions : le nommage des répertoires d'applications (options 1.x), le schéma de
labels (options 2.x) et le nommage des HTTPRoute (options 3.x).

### Option 1.1 : Préfixe astérisque pour les applications en synchronisation manuelle

> **Statut : OBSOLÈTE** (motif d'`amiya.akn` à la création de l'ADR, remplacé par l'option 1.4)

**Obsolète** : cette option est remplacée par l'option 1.4 (fichiers `.application.patch`). Le préfixe astérisque n'est
plus recommandé et doit être migré vers le nouveau motif.

```text
projects/amiya.akn/src/apps/
├── *argocd/       # Manual sync - critical infrastructure
├── *vault/        # Manual sync - secrets management
├── *pocket-id/    # Manual sync - authentication
└── home-dashboard/  # Auto sync - user application
```

**Mécanisme** : le template patch de l'ApplicationSet ArgoCD utilise `hasPrefix "*"` pour déterminer la politique de
synchronisation.

- `+` Indicateur visuel clair, mécanisme fonctionnel
- `-` Nommage non standard sur le système de fichiers, extensibilité limitée, contrôle uniquement binaire

### Option 1.2 : Pas de préfixe, avec des labels de métadonnées

> **Statut : REJETÉE**

```text
projects/lungmen.akn/src/apps/
├── argocd/
├── vault/
├── pocket-id/
└── home-dashboard/
```

La politique de synchronisation est contrôlée par des annotations ou des labels au niveau de l'Application.

- `+` Listing du système de fichiers propre, nommage Kubernetes standard
- `-` Exige des métadonnées supplémentaires, comportement de synchronisation moins visible, plus difficile à mettre en
  œuvre dans les ApplicationSets

### Option 1.3 : Répertoires séparés selon la politique de synchronisation

> **Statut : REJETÉE**

```text
projects/cluster/src/
├── apps/manual/
│   ├── argocd/
│   ├── vault/
│   └── pocket-id/
└── apps/automated/
    └── home-dashboard/
```

- `+` Séparation complète, très explicite
- `-` Casse le motif unique `apps/`, réorganisation plus difficile, logique d'ApplicationSet dupliquée

### Option 1.4 : Fichiers ApplicationPatch

> **Statut : ACCEPTÉE** (nouvelle option, recommandée)

```text
projects/lungmen.akn/src/infrastructure/kubernetes/
├── cilium/
│   ├── .application.patch      # Sync policy and metadata
│   ├── kustomization.yaml
│   └── ...
├── longhorn/
│   ├── .application.patch      # Manual sync for storage
│   └── ...
└── cloudnative-pg/
    ├── .application.patch      # Auto sync for DB operator
    └── ...
```

**Mécanisme** : chaque répertoire d'application contient un fichier `.application.patch` facultatif qui définit la
politique de synchronisation et les métadonnées de l'application, au moyen d'une CRD maison :

```yaml
apiVersion: arcane.chezmoi.sh/v1alpha1
kind: ApplicationPatch
metadata: {}
spec:
  info:
    # -- Application metadata for ArgoCD UI
    - name: Description
      value: Tailscale Kubernetes operator for secure mesh networking
    - name: Category
      value: Networking / VPN
    - name: Version
      # renovate: datasource=helm depName=tailscale-operator registryUrl=https://pkgs.tailscale.com/helmcharts
      value: "1.92.5"
    - name: Documentation
      value: https://tailscale.com/kb/1236/kubernetes-operator

  syncPolicy:
    automated:
      enabled: true # true = auto sync, false = manual sync
      prune: true # Optional, defaults based on enabled
      selfHeal: true # Optional, defaults based on enabled
```

**Intégration avec l'ApplicationSet ArgoCD** : l'ApplicationSet lit les fichiers `.application.patch` et fusionne leur
configuration dans les ressources Application générées, ce qui permet un contrôle fin, application par application.

- `+` Nommage standard sur le système de fichiers (aucun caractère spécial)
- `+` Contrôle fin de la synchronisation (pas seulement activé ou désactivé)
- `+` Prise en charge de métadonnées riches (descriptions, catégories, versions)
- `+` Intégration avec Renovate pour le suivi des versions
- `+` Extensible pour les besoins futurs
- `+` Séparation claire des responsabilités
- `-` Exige un fichier supplémentaire par application
- `-` Un peu plus complexe que le préfixe astérisque

### Option 2.1 : Labels minimaux

> **Statut : REJETÉE** (motif d'`amiya.akn` à la création de l'ADR)

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: pocket-id
    includeSelectors: true
    includeTemplates: true
  - pairs:
      # renovate: datasource=github-release depName=pocket-id/pocket-id
      app.kubernetes.io/version: v0.2.0
    includeTemplates: true
```

- `+` Simple, suivi de version explicite pour Renovate
- `-` Il manque les labels Kubernetes recommandés

### Option 2.2 : Labels redondants

> **Statut : REJETÉE** (motif de `lungmen.akn` à la création de l'ADR)

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: atuin
      app.kubernetes.io/part-of: atuin
    includeTemplates: true
  - pairs:
      app.kubernetes.io/instance: atuin
    includeTemplates: true
    includeSelectors: true
```

- `+` Jeu de labels plus complet
- `-` Pas de suivi de version, `part-of` redondant (identique au nom)

### Option 2.3 : Labels standard minimaux

> **Statut : ACCEPTÉE** (recommandée)

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: application-name
    includeTemplates: true
    includeSelectors: true
  - pairs:
      # renovate: datasource=helm depName=repo/chart
      app.kubernetes.io/version: v1.0.0
    includeTemplates: true
```

- `+` Propre, centré sur les métadonnées au niveau de l'application, prise en charge de Renovate, évite les conflits de
  sélecteurs
- `-` Les labels d'instance et de composant doivent être gérés workload par workload

### Option 3.1 : Nom simple

> **Statut : REJETÉE** (motif d'`amiya.akn` à la création de l'ADR)

```yaml
metadata:
  name: pocket-id
```

- `+` Propre, correspond au nom du service
- `-` Conflits possibles avec d'autres types de routes

### Option 3.2 : Nom suffixé

> **Statut : REJETÉE** (motif de `lungmen.akn` à la création de l'ADR)

```yaml
metadata:
  name: atuin-websecure
```

- `+` Indication explicite du protocole
- `-` Redondant quand une seule route existe

### Option 3.3 : Nommage selon le contexte

> **Statut : ACCEPTÉE** (recommandée)

- **Route unique** : utiliser le nom de l'application (`application-name`)
- **Routes multiples** : utiliser des suffixes descriptifs (`application-name-public`, `application-name-websecure`)

- `+` Verbosité minimale quand c'est possible, clarté quand c'est nécessaire
- `-` Exige une décision selon le contexte

## Décision retenue

**Option retenue : « Standardisation complète fondée sur les bonnes pratiques Kubernetes et le contrôle de
synchronisation ArgoCD »**, parce qu'elle établit une structure complète et cohérente pour tous les projets Arcane, en
donnant la priorité à :

1. **la conformité aux standards Kubernetes** plutôt qu'aux conventions maison ;
2. **un contrôle de la synchronisation axé sur la sûreté**, au moyen des fichiers `.application.patch` ;
3. **un étiquetage complet** pour une gestion correcte des ressources ;
4. **une organisation cohérente** pour tous les types de projets.

### Nommage des répertoires : option 1.4, fichiers ApplicationPatch

Justification :

- Nommage propre et standard sur le système de fichiers, sans caractère spécial
- Contrôle fin des politiques de synchronisation, au-delà du binaire manuel ou automatique
- Les métadonnées riches améliorent l'expérience dans l'interface d'ArgoCD
- Intégration native avec Renovate pour le suivi des versions
- Architecture extensible pour les besoins futurs
- Séparation claire entre le code de l'application et la configuration ArgoCD

### Schéma de labels : option 2.3, labels standard minimaux

Justification :

- Les labels au niveau de l'application (nom, version) vont dans `kustomization.yaml`
- Les labels au niveau du workload (instance, composant) vont dans les manifestes individuels
- Évite les conflits de sélecteurs et de labels avec les charts Helm et les configurations propres à chaque workload
- Permet un meilleur filtrage et une meilleure organisation des ressources
- Prend en charge les mises à jour automatisées de Renovate
- Classification claire des composants (application, base de données, stockage)

### Nommage des HTTPRoute : option 3.3, nommage selon le contexte

Justification :

- Le meilleur des deux approches
- Réduit la verbosité inutile
- Apporte de la clarté quand plusieurs routes existent

> [!NOTE]\
> Note du 2026-10-11 : aucun répertoire préfixé par `*` n'existe sous `projects/` et les ApplicationSets
> (`projects/rhodes.akn/src/argocd/shoot.apps/`) ne contiennent plus de `hasPrefix`. Ils lisent les fichiers
> `.application.patch` (`applications.applicationset.yaml` dans `dist/apps/*/`, `system.applicationset.yaml` dans
> `src/infrastructure/kubernetes/*/`) et les fusionnent par `templatePatch`. Les fichiers `.application.patch` sont
> présents dans tous les composants d'infrastructure de `lungmen.akn` et `rhodes.akn`, dans `rhodes.akn/src/apps/`
> (`pocket-id`, `vault`) et dans `lungmen.akn/src/apps/databases` ; les sept autres applications de `lungmen.akn` n'en
> ont pas et prennent la politique par défaut de l'ApplicationSet (`automated.enabled: true`). Le format réel ajoute des
> clés hors du gabarit (`sources`, `ignoreDifferences`). Le répertoire `longhorn/` n'existe plus : le stockage bloc
> passe par le plugin Proxmox CSI (`projects/lungmen.akn/src/infrastructure/kubernetes/proxmox/`).

---

## Détails de mise en œuvre et état

### Spécification des standards

Les sections numérotées ci-dessous constituent la spécification adoptée par cet ADR. Les écarts constatés avec le dépôt
le 2026-10-11 sont regroupés dans [Évolution de la décision](#évolution-de-la-décision).

### 1. Structure des répertoires

### 1.1 Nommage des répertoires d'applications

**Standard** : minuscules avec des tirets ; la politique de synchronisation est contrôlée par des fichiers
`.application.patch`.

```text
projects/{cluster-name}/src/apps/{application-name}/
projects/{cluster-name}/src/infrastructure/kubernetes/{component-name}/
```

**Convention ApplicationPatch** : chaque répertoire d'application peut contenir un fichier `.application.patch`
facultatif qui définit :

- **La politique de synchronisation** : synchronisation manuelle ou automatique, réglages `prune` et `selfHeal`
- **Les métadonnées de l'application** : description, catégorie, version, liens vers la documentation
- **Son champ d'application** : les applications utilisateur (`src/apps/`) comme l'infrastructure du cluster
  (`src/infrastructure/kubernetes/`)

**Structure du répertoire** :

```text
{application-name}/
├── .application.patch          # Sync policy and metadata (optional)
├── kustomization.yaml          # Main Kustomize configuration
├── {app}.{resource}.yaml       # Resource files
└── ...
```

**Format du fichier ApplicationPatch** :

```yaml
apiVersion: arcane.chezmoi.sh/v1alpha1
kind: ApplicationPatch
metadata: {}
spec:
  info:
    - name: Description
      value: Application description for ArgoCD UI
    - name: Category
      value: Category / Subcategory
    - name: Version
      # renovate: datasource=helm depName=chart registryUrl=https://charts.example.com
      value: "1.0.0"
    - name: Documentation
      value: https://docs.example.com

  syncPolicy:
    automated:
      enabled: true # true = auto sync, false = manual sync
      prune: true # Optional, enable resource pruning
      selfHeal: true # Optional, enable drift correction
```

**Exemples de composants d'infrastructure** :

- `projects/lungmen.akn/src/infrastructure/kubernetes/cilium/` avec `.application.patch` (synchronisation manuelle pour
  le CNI)
- `projects/lungmen.akn/src/infrastructure/kubernetes/longhorn/` avec `.application.patch` (synchronisation manuelle
  pour le stockage)
- `projects/lungmen.akn/src/infrastructure/kubernetes/cloudnative-pg/` avec `.application.patch` (synchronisation
  automatique pour l'opérateur de base de données)

**Règles de politique de synchronisation** :

**Attention** : les applications avec `syncPolicy.automated.enabled: false` exigent une synchronisation manuelle. Ce
réglage est destiné à l'infrastructure critique, pour laquelle des changements automatisés pourraient provoquer des
pannes.

**Critères de synchronisation manuelle** (`enabled: false`) :

- **Infrastructure critique exposée aux utilisateurs** : ArgoCD, Vault, Crossplane, systèmes d'authentification
- **Réseau du cluster** : CNI (Cilium), automatisation DNS, service mesh
- **Infrastructure de stockage** : pilotes CSI (Longhorn), storage classes
- **Cœur de Kubernetes** : composants du control plane, modifications de `kube-system`
- **Changements à fort impact** : services pour lesquels l'automatisation pourrait provoquer une panne de tout le
  cluster

**Critères de synchronisation automatique** (`enabled: true`) :

- **Applications utilisateur** : outils de productivité, serveurs multimédias, domotique
- **Services isolés** : applications ayant peu de dépendances envers le cluster
- **Opérateurs de base de données** : CloudNative-PG, opérateur Redis (s'il est correctement configuré)
- **Workloads de développement** : applications de test hors production

**Comportement par défaut** (pas de fichier `.application.patch`) :

- Les applications sans fichier `.application.patch` utilisent la politique de synchronisation par défaut de
  l'ApplicationSet
- Les valeurs par défaut se configurent au niveau de l'ApplicationSet

**Justification** :

- Nommage standard sur le système de fichiers, sans caractère spécial
- Contrôle fin de la synchronisation, au-delà du binaire manuel ou automatique
- Les métadonnées riches améliorent l'expérience dans l'interface d'ArgoCD
- Intégration native avec Renovate pour le suivi des versions
- Extensible pour les besoins futurs
- Séparation claire entre le code de l'application et la configuration ArgoCD

### 1.2 Structure d'une application

```text
{application-name}/
├── kustomization.yaml          # Main Kustomize configuration
├── {app}.{resource}.yaml       # Resource files
├── {chart}.helmvalues/         # Helm values directory (if using Helm)
│   ├── default.yaml            # Base values
│   ├── hardened.yaml           # Security hardening
│   ├── addon:{name}.yaml       # Optional addons
│   └── extensions.yaml         # Custom extensions
└── security/                   # Security resources
    ├── kustomization.yaml      # Security resource list
    ├── network-policy.*.yaml   # Network policies
    └── reference-grant.*.yaml  # Gateway API reference grants
```

### 2. Conventions de nommage des fichiers

### 2.1 Fichiers de ressources

**Motif** : `{application-name}.{resource-type}.yaml`

**Exemples** :

- `pocket-id.statefulset.yaml`
- `atuin.deployment.yaml`
- `argocd.httproute.yaml`
- `immich.postgresql.yaml`

**Cas particuliers** :

- Sauvegardes de base de données : `{app}.postgresql-backup.yaml`
- Stockage objet : `{app}.postgresql-objectstore.yaml`
- Configuration : `{app}.configuration.externalsecret.yaml`

**Exceptions**, quand la ressource porte un nom sémantique distinct :

- `letsencrypt-issuer-credentials.externalsecret.yaml`

### 2.2 Répertoire helmvalues

**Motif** : `{chart-name}.helmvalues/`

**Structure** :

- `default.yaml` : configuration de base (OBLIGATOIRE)
- `hardened.yaml` : surcouche de durcissement de sécurité (RECOMMANDÉ)
- `extensions.yaml` : CRD et extensions maison (FACULTATIF)
- `addon:{name}.yaml` : modules de fonctionnalités facultatifs (FACULTATIF)

**Exemples** :

- `argocd.helmvalues/default.yaml`
- `argocd.helmvalues/hardened.yaml`
- `argocd.helmvalues/addon:crossplane.yaml`
- `argocd.helmvalues/addon:ksops.yaml`

**Intégration dans la kustomization** :

```yaml
helmCharts:
  - name: chart-name
    repo: https://charts.example.com
    releaseName: release-name
    version: 1.0.0
    valuesFile: chart-name.helmvalues/default.yaml
    additionalValuesFiles:
      - chart-name.helmvalues/hardened.yaml
      - chart-name.helmvalues/extensions.yaml
      - chart-name.helmvalues/addon:feature.yaml
```

### 2.3 Network policies

**Motif** : `network-policy.{purpose}.yaml`

**Politiques standard** :

- `network-policy.default-hardened.yaml` : refus total de base (OBLIGATOIRE)

**Politiques applicatives** :

- `network-policy.allow-{app}-from-{source}.yaml`
- `network-policy.allow-{app}-to-{destination}.yaml`

**Politiques de base de données** :

- `network-policy.allow-postgres-from-cnpg.yaml`
- `network-policy.allow-postgres-to-kubernetes-api.yaml`
- `network-policy.allow-postgres-to-s3-backup.yaml`

**Exemples** :

- `network-policy.allow-pocket-id-from-envoy-gateway.yaml`
- `network-policy.allow-atuin-from-tailscale.yaml`
- `network-policy.allow-pocket-id-to-internet.yaml`

### 2.4 Reference grants

**Motif** : `reference-grant.{source}-gateway-to-{target}.yaml`

**Exemples** :

- `reference-grant.envoy-gateway-to-pocket-id.yaml`
- `reference-grant.cloudflare-gateway-to-pocket-id.yaml`

### 3. Labels Kubernetes

### 3.1 Labels standard (niveau application)

**Labels obligatoires dans `kustomization.yaml`** (appliqués à toutes les ressources) :

```yaml
labels:
  - pairs:
      app.kubernetes.io/name: { application-name }
    includeTemplates: true
    includeSelectors: true
  - pairs:
      # renovate: datasource={source} depName={package}
      app.kubernetes.io/version: { version }
    includeTemplates: true
```

**Attention : ne PAS mettre `app.kubernetes.io/instance` ni `app.kubernetes.io/component` dans les labels de
`kustomization.yaml`.** Ces labels sont propres à chaque workload et provoquent des conflits quand Kustomize les
applique globalement :

- `instance` : des workloads différents (deployment, base de données, redis) ont des noms d'instance différents
- `component` : chaque workload a son propre type de composant (application, base de données, cache, etc.)
- avec `includeSelectors: true`, Kustomize les ajoute aux sélecteurs des Deployments, ce qui crée des incohérences
- les charts Helm et les manifestes existants définissent leurs propres labels d'instance et de composant

Ces labels se définissent plutôt directement dans les manifestes de chaque workload.

**Sources Renovate** :

- `datasource=helm depName=repo/chart` : charts Helm
- `datasource=github-release depName=owner/repo` : releases GitHub
- `datasource=docker depName=registry/image` : images de conteneurs

> [!NOTE]\
> Note du 2026-10-11 : aucun `kustomization.yaml` de `projects/` ne porte le label `app.kubernetes.io/version` ; les
> annotations Renovate des kustomizations suivent le champ `images`, et celles des fichiers `.application.patch` la
> valeur `Version`. À l'inverse, les huit kustomizations d'applications (`lungmen.akn/src/apps/*` sauf `databases`,
> `rhodes.akn/src/apps/pocket-id`) placent `app.kubernetes.io/instance` dans `labels` avec `includeSelectors: true`, ce
> que cette section interdit. Le nom de la datasource Renovate est `github-releases` (4 occurrences dans le dépôt, voir
> [Renovate](../reference/Renovate-Reference.md)) ; `github-release` n'est pas une datasource valide.

### 3.2 Labels propres aux workloads

**Labels par workload** (dans les manifestes de ressources individuels) : chaque Deployment, StatefulSet, Service ou
autre workload définit son propre jeu de labels complet.

```yaml
# Example: main application deployment
metadata:
  name: { application-name }
  labels:
    app.kubernetes.io/name: { application-name }
    app.kubernetes.io/instance: { application-name }
    app.kubernetes.io/component: application
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: { application-name }
      app.kubernetes.io/instance: { application-name }
      app.kubernetes.io/component: application
  template:
    metadata:
      labels:
        app.kubernetes.io/name: { application-name }
        app.kubernetes.io/instance: { application-name }
        app.kubernetes.io/component: application
```

**Ressources de base de données** (dans le manifeste de la ressource) :

```yaml
metadata:
  labels:
    app.kubernetes.io/name: {application-name}
    app.kubernetes.io/component: database
    app.kubernetes.io/instance: {application-name}-database
  name: {application-name}-database
```

**Ressources Redis ou de cache** (dans le manifeste de la ressource) :

```yaml
metadata:
  labels:
    app.kubernetes.io/name: {application-name}
    app.kubernetes.io/component: redis
    app.kubernetes.io/instance: {application-name}-redis
  name: {application-name}-redis
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: {application-name}
      app.kubernetes.io/instance: {application-name}-redis
      app.kubernetes.io/component: redis
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {application-name}
        app.kubernetes.io/instance: {application-name}-redis
        app.kubernetes.io/component: redis
```

**Ressources de stockage** (dans le manifeste de la ressource) :

```yaml
metadata:
  labels:
    app.kubernetes.io/name: {application-name}
    app.kubernetes.io/component: storage
    app.kubernetes.io/instance: {application-name}-storage
```

### 3.3 Règles d'usage des labels

**Dans `kustomization.yaml`** (pour toute l'application) :

- **app.kubernetes.io/name** : identifiant de l'application (OBLIGATOIRE)
- **app.kubernetes.io/version** : version pour le suivi des dépendances (OBLIGATOIRE pour Renovate)

**Dans les manifestes de workloads individuels** (par ressource) :

- **app.kubernetes.io/name** : même identifiant d'application (OBLIGATOIRE)
- **app.kubernetes.io/instance** : nom d'instance unique du workload (OBLIGATOIRE)
- **app.kubernetes.io/component** : type de workload, `application`, `database`, `redis`, `storage`, etc. (OBLIGATOIRE)
- **app.kubernetes.io/part-of** : regroupement de plusieurs applications (FACULTATIF, seulement quand l'application fait
  réellement partie d'un système plus large)

**À ne PAS utiliser** :

- `app.kubernetes.io/instance` dans `kustomization.yaml` (propre au workload)
- `app.kubernetes.io/component` dans `kustomization.yaml` (propre au workload)
- `app.kubernetes.io/part-of: {application-name}` quand `part-of` est égal à `name` (redondant)

### 4. Gestion des images de conteneurs

### 4.1 Configuration centralisée des images

**Standard** : toutes les images de conteneurs DOIVENT être définies dans `kustomization.yaml` avec le champ `images`,
et non dans les manifestes de ressources individuels.

**Justification** :

- **Centralisation** : une source de vérité unique pour toutes les images
- **Gestion des versions** : mises à jour de version sans toucher aux manifestes
- **Gestion des registres** : migration de registre directe (par exemple de docker.io vers un registre interne)
- **Épinglage par digest** : gestion centralisée des digests SHA256 pour la sécurité
- **Intégration Renovate** : mises à jour automatisées des images via le transformer Kustomize

### 4.2 Motif de référence des images

**Dans `kustomization.yaml`** :

```yaml
images:
  - name: {registry}/{image}
    newTag: {version}
    digest: sha256:{hash}
```

**Dans le Deployment ou le StatefulSet** :

```yaml
spec:
  containers:
    - name: {app}
      image: {registry}/{image}  # No tag/digest - managed by Kustomize
```

**Transformation Kustomize** : le champ `images` transforme toutes les références d'image correspondantes et remplace
les tags et les digests de façon centralisée.

### 4.3 Exemples de configuration d'images

**Application à image unique** :

```yaml
# kustomization.yaml
images:
  - name: ghcr.io/actualbudget/actual-server
    newTag: 25.10.0
```

```yaml
# actual-budget.statefulset.yaml
containers:
  - name: actual-budget
    image: ghcr.io/actualbudget/actual-server
```

**Image épinglée par digest** (recommandé en production) :

```yaml
# kustomization.yaml
images:
  - name: ghcr.io/atuinsh/atuin
    newTag: v18.0.0
    digest: sha256:8a8a8ef4eb5865656072bace5cc49390b56caa81360f9f0869054777155b6ef1
```

```yaml
# atuin.deployment.yaml
containers:
  - name: atuin
    image: ghcr.io/atuinsh/atuin
```

**Images multiples** (par exemple des conteneurs sidecar) :

```yaml
# kustomization.yaml
images:
  - name: ghcr.io/pocket-id/pocket-id
    newTag: v1.10.0-distroless
    digest: sha256:53aaee4ded66e2e163cd74b4bcfcf748c912672501346b08fa1bd8f21d295b81
  - name: docker.io/library/nginx
    newTag: 1.27-alpine
    digest: sha256:abcdef1234567890
```

### 4.4 Workflow de mise à jour des images

**Mise à jour manuelle de version** :

```bash
# Update kustomization.yaml only
sed -i 's/newTag: 1.0.0/newTag: 1.1.0/' kustomization.yaml

# Kustomize automatically applies to all matching images
kubectl kustomize . | kubectl apply -f -
```

**Automatisation par Renovate** : Renovate Bot peut détecter et mettre à jour les versions d'images dans
`kustomization.yaml` :

```yaml
# kustomization.yaml
images:
  # renovate: datasource=docker depName=actualbudget/actual-server
  - name: ghcr.io/actualbudget/actual-server
    newTag: 25.10.0
```

### 4.5 Migration de registre

**Avant** (changement de registre dans plusieurs fichiers) :

```yaml
# Multiple files to update
# app.deployment.yaml
image: docker.io/myapp:1.0.0

# sidecar.yaml
image: docker.io/sidecar:2.0.0
```

**Après** (une seule mise à jour dans `kustomization.yaml`) :

```yaml
# kustomization.yaml
images:
  - name: docker.io/myapp
    newName: registry.internal.chezmoi.sh/myapp
    newTag: 1.0.0
  - name: docker.io/sidecar
    newName: registry.internal.chezmoi.sh/sidecar
    newTag: 2.0.0
```

Toutes les références à `docker.io/myapp` dans les manifestes sont transformées automatiquement.

### 4.6 Bonnes pratiques de sécurité

**Épinglage par digest** (RECOMMANDÉ en production) :

```yaml
images:
  - name: ghcr.io/pocket-id/pocket-id
    newTag: v1.10.0-distroless
    digest: sha256:53aaee4ded66e2e163cd74b4bcfcf748c912672501346b08fa1bd8f21d295b81
```

**Avantages** :

- Références d'image immuables
- Protection contre les attaques par mutation de tag
- Déploiements reproductibles
- Piste d'audit claire

**Tag seul** (acceptable en développement) :

```yaml
images:
  - name: ghcr.io/actualbudget/actual-server
    newTag: 25.10.0
```

**Tag `latest`** (À ÉVITER en production) :

```yaml
# Avoid this pattern
images:
  - name: myapp
    newTag: latest
```

### 4.7 Surcharge des images des charts Helm

Pour les applications déployées par des charts Helm, la configuration des images reste centralisée.

**Option 1 : valeurs Helm** (quand le chart permet de surcharger l'image) :

```yaml
# chart.helmvalues/default.yaml
image:
  repository: ghcr.io/immich-app/immich-server
  tag: v1.119.1
  digest: sha256:abcdef...
```

**Option 2 : transformer Kustomize** (quand le chart ne le permet pas) :

```yaml
# kustomization.yaml
helmCharts:
  - name: immich
    repo: https://immich-app.github.io/immich-charts
    version: 0.9.2
    valuesFile: immich.helmvalues/default.yaml

images:
  - name: ghcr.io/immich-app/immich-server
    newTag: v1.119.1
    digest: sha256:abcdef...
```

### 4.8 Cas d'exception

**Charts Helm aux images embarquées** : avec des charts Helm qui gèrent leurs images en interne (comme ArgoCD ou
Crossplane), la gestion des images reste dans les valeurs Helm pour préserver la compatibilité du chart.

```yaml
# argocd.helmvalues/default.yaml
image:
  repository: quay.io/argoproj/argocd
  tag: v2.13.2
```

**Justification** : les mainteneurs des charts Helm testent des combinaisons d'images précises ; une surcharge par
Kustomize peut casser des dépendances.

### 5. Annotations Kubernetes

### 5.1 Annotations des HTTPRoute

**Annotations obligatoires** :

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/include-unifi: "true"
    link.argocd.argoproj.io/external-link: https://{hostname}
```

**Rôle** :

- `external-dns.alpha.kubernetes.io/include-unifi` : active l'intégration DNS UniFi
- `link.argocd.argoproj.io/external-link` : fournit un lien d'accès direct dans l'interface d'ArgoCD

### 5.2 Autres annotations standard

**Sync waves** (ArgoCD) :

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "{wave-number}"
```

**Options de synchronisation** (ArgoCD) :

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-options: "SkipDryRunOnMissingResource=true"
```

### 6. Standards de nommage des ressources

### 6.1 Nommage des HTTPRoute

**Route unique** :

```yaml
metadata:
  name: { application-name }
```

**Routes multiples** :

```yaml
metadata:
  name: {application-name}-{purpose}
```

**Exemples** :

- `pocket-id` : route unique pour l'accès privé
- `pocket-id-public` : variante de route publique
- `atuin-websecure` : route HTTPS (pour la distinguer de la route HTTP)

### 6.2 Nommage des bases PostgreSQL

**Nom du cluster** : `{application-name}-database`

**Exemple** :

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  labels:
    app.kubernetes.io/component: database
    app.kubernetes.io/instance: pocket-id-database
  name: pocket-id-database
```

### 6.3 Nommage des secrets

**Secrets de base de données** : `{application-name}-database-{role}`

**Exemples** :

- `pocket-id-database-pocket-id` (rôle applicatif)
- `atuin-database-atuin` (rôle applicatif)

**Nommage des ExternalSecret** : identique au nom du secret cible.

```yaml
metadata:
  name: pocket-id-database-pocket-id # Matches generated secret
```

### 6.4 Nommage des services

**Standard** : `{application-name}`

**Services de base de données** (générés par CloudNative-PG) :

- `{application-name}-database-rw` (service en lecture-écriture)
- `{application-name}-database-ro` (service en lecture seule)
- `{application-name}-database-r` (service de lecture)

### 7. Structure des kustomizations

### 7.1 Kustomization standard

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: {namespace-name}

labels:
  - pairs:
      app.kubernetes.io/name: {application-name}
    includeTemplates: true
    includeSelectors: true
  - pairs:
      # renovate: datasource={source} depName={package}
      app.kubernetes.io/version: {version}
    includeTemplates: true

resources:
  - {application-name}.deployment.yaml
  - {application-name}.service.yaml
  - {application-name}.httproute.yaml
  - {application-name}.postgresql.yaml
  - {application-name}.postgresql-backup.yaml
  - {application-name}.postgresql-objectstore.yaml
  - security/
```

### 7.2 Kustomization fondée sur Helm

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: {namespace-name}

resources:
  - {application-name}.httproute.yaml
  - {application-name}.externalsecret.yaml
  - security/

helmCharts:
  - name: {chart-name}
    repo: {chart-repository}
    releaseName: {release-name}
    version: {chart-version}
    valuesFile: {chart-name}.helmvalues/default.yaml
    additionalValuesFiles:
      - {chart-name}.helmvalues/hardened.yaml
      - {chart-name}.helmvalues/extensions.yaml
```

**Remarque** : avec `helmCharts`, les labels s'appliquent en général par les valeurs Helm plutôt que par la
kustomization.

### 7.3 Kustomization fondée sur des composants

**Usage** : composants d'infrastructure réutilisables.

```yaml
---
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
```

**Quand l'utiliser** :

- Motifs d'infrastructure réutilisables
- Bibliothèques de composants partagés
- Déploiements multi-clusters

**Quand ne PAS l'utiliser** :

- Applications standard
- Ressources propres à un cluster

### 8. Structure du répertoire de sécurité

### 8.1 Structure standard

```text
security/
├── kustomization.yaml
├── network-policy.default-hardened.yaml
├── network-policy.allow-{app}-from-{source}.yaml
├── network-policy.allow-{app}-to-{destination}.yaml
├── network-policy.allow-postgres-*.yaml
└── reference-grant.*.yaml
```

### 8.2 Kustomization de sécurité

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - network-policy.default-hardened.yaml
  - network-policy.allow-{app}-from-{source}.yaml
  - network-policy.allow-postgres-from-cnpg.yaml
  - network-policy.allow-postgres-to-kubernetes-api.yaml
  - network-policy.allow-postgres-to-s3-backup.yaml
  - reference-grant.envoy-gateway-to-{app}.yaml
```

### 9. Gestion des secrets

### 9.1 Structure des chemins OpenBao

**Secrets par application** :

```text
/{cluster-name}/{application-name}/{category}/{secret-name}
```

**Exemples** :

- `amiya.akn/pocket-id/database/postgresql`
- `lungmen.akn/atuin/auth/oidc-client`
- `amiya.akn/argocd/auth/github-oauth`

**Catégories** :

- `database/` : identifiants de base de données
- `auth/` : secrets d'authentification (OIDC, OAuth, JWT)
- `api-keys/` : jetons d'API tiers
- `certificates/` : certificats TLS propres à l'application

**Référence** : voir
l'[ADR-003 Conventions de nommage des chemins OpenBao](ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md).

### 9.2 Configuration des ExternalSecret

**Motif standard** :

```yaml
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {secret-name}
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: vault.chezmoi.sh
  target:
    template:
      data:
        username: {username}
        password: "{{ .password }}"
  dataFrom:
    - extract:
        key: {cluster-name}/{app-name}/{category}/{secret-name}
```

**Intervalles de rafraîchissement** :

- Production critique : `5m`
- Applications standard : `1h`
- Non critique : `6h`

### 9.3 Motif des secrets de base de données

```yaml
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {application-name}-database-{role}
spec:
  dataFrom:
    - extract:
        key: {cluster-name}/{application-name}/database/postgresql
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: vault.chezmoi.sh
  target:
    template:
      data:
        username: {role-name}
        password: "{{ .password }}"
        uri: "postgres://{role-name}:{{ .password }}@{app}-database-rw:5432/{database-name}"
```

### 10. Gestion des bases de données

### 10.1 Cluster CloudNative-PG

**Configuration standard** :

```yaml
---
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  labels:
    app.kubernetes.io/component: database
    app.kubernetes.io/instance: {application-name}-database
  name: {application-name}-database
spec:
  description: PostgreSQL database dedicated to {application-name}
  enablePDB: false
  instances: 1
  managed:
    roles:
      - name: {application-name}
        connectionLimit: -1
        comment: PostgreSQL role for {application-name}
        ensure: present
        inherit: true
        login: true
        passwordSecret:
          name: {application-name}-database-{application-name}
  plugins:
    - enabled: true
      isWALArchiver: true
      name: barman-cloud.cloudnative-pg.io
      parameters:
        barmanObjectName: selfhosted
        serverName: {ULID}  # DRP::src_ulid
  storage:
    size: 1Gi
  walStorage:
    size: 1Gi
```

### 10.2 Configuration des sauvegardes de base de données

**Fichier** : `{application-name}.postgresql-backup.yaml`

```yaml
---
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  name: {application-name}-database
spec:
  schedule: "0 0 */12 * * *"  # Every 12 hours
  backupOwnerReference: self
  cluster:
    name: {application-name}-database
```

### 10.3 Configuration du stockage objet

**Fichier** : `{application-name}.postgresql-objectstore.yaml`

**Voir** : la documentation de CloudNative-PG pour la configuration du stockage objet Barman.

### 11. Gestion des namespaces

### 11.1 Création des namespaces

**Applications gérées par ArgoCD** :

- **Pas de fichier `namespace.yaml` explicite**
- ArgoCD crée le namespace par la CR Application :

```yaml
spec:
  destination:
    namespace: { namespace-name }
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
```

**Composants d'infrastructure** : un `namespace.yaml` explicite est utilisé quand :

- le namespace exige des labels ou des annotations particuliers ;
- la configuration du namespace est complexe ;
- le namespace est partagé entre plusieurs applications.

**Exemple** :

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: { namespace-name }
  labels:
    app.kubernetes.io/name: { namespace-name }
```

### 12. Motifs de structure des projets

### 12.1 Cluster de la plateforme cœur (motif amiya.akn)

```text
projects/amiya.akn/
├── README.md
├── architecture.d2
├── src/
│   ├── apps/
│   │   ├── argocd/              # Manual sync (.application.patch) - Core GitOps
│   │   │   └── .application.patch
│   │   ├── vault/               # Manual sync (.application.patch) - Secret management
│   │   │   └── .application.patch
│   │   ├── pocket-id/           # Manual sync (.application.patch) - Authentication
│   │   │   └── .application.patch
│   │   ├── crossplane/          # Manual sync (.application.patch) - Infrastructure provisioning
│   │   │   └── .application.patch
│   │   └── home-dashboard/      # Auto sync (.application.patch) - User application
│   │       └── .application.patch
│   └── infrastructure/
│       ├── kubernetes/          # Cluster infrastructure components
│       │   ├── cilium/          # Manual sync - Network CNI
│       │   │   └── .application.patch
│       │   ├── longhorn/        # Manual sync - Storage CSI
│       │   │   └── .application.patch
│       │   ├── external-dns/    # Manual sync - DNS automation
│       │   │   └── .application.patch
│       │   ├── kube/            # Manual sync - Kubernetes core
│       │   │   └── .application.patch
│       │   ├── cert-manager/    # Auto sync - Certificates
│       │   │   └── .application.patch
│       │   ├── envoy-gateway/   # Auto sync - Ingress
│       │   │   └── .application.patch
│       │   ├── external-secrets/# Auto sync - Secrets
│       │   │   └── .application.patch
│       │   ├── tailscale/       # Auto sync - VPN
│       │   │   └── .application.patch
│       │   └── cloudnative-pg/  # Auto sync - Database operator
│       │       └── .application.patch
│       └── crossplane/          # Infrastructure as Code definitions
└── docs/
    ├── assets/
    │   └── architecture.svg
    ├── BOOTSTRAP_TALOS.md
    ├── BOOTSTRAP_ARGOCD.md
    └── bootstrap/
```

### 12.2 Cluster d'applications (motif lungmen.akn)

```text
projects/lungmen.akn/
├── README.md
├── architecture.d2
├── src/
│   ├── apps/
│   │   ├── actual-budget/       # Auto sync - User applications
│   │   │   └── .application.patch
│   │   ├── atuin/
│   │   │   └── .application.patch
│   │   ├── immich/
│   │   │   └── .application.patch
│   │   ├── jellyfin/
│   │   │   └── .application.patch
│   │   ├── paperless-ngx/
│   │   │   └── .application.patch
│   │   └── silverbullet/
│   │       └── .application.patch
│   └── infrastructure/
│       ├── kubernetes/          # Cluster infrastructure components
│       │   ├── cilium/          # Manual sync - Network CNI
│       │   │   └── .application.patch
│       │   ├── longhorn/        # Manual sync - Storage CSI
│       │   │   └── .application.patch
│       │   ├── external-dns/    # Manual sync - DNS automation
│       │   │   └── .application.patch
│       │   ├── cert-manager/    # Auto sync - Certificates
│       │   │   └── .application.patch
│       │   ├── envoy-gateway/   # Auto sync - Ingress
│       │   │   └── .application.patch
│       │   ├── external-secrets/# Auto sync - Secrets
│       │   │   └── .application.patch
│       │   ├── tailscale/       # Auto sync - VPN
│       │   │   └── .application.patch
│       │   ├── cloudnative-pg/  # Auto sync - Database operator
│       │   │   └── .application.patch
│       │   └── smb-csi-driver/  # Auto sync - SMB storage driver
│       │       └── .application.patch
│       ├── crossplane/          # Infrastructure as Code definitions
│       └── talos/               # Talos configuration files
└── docs/
    ├── assets/
    │   └── architecture.svg
    ├── BOOTSTRAP_TALOS.md
    └── BOOTSTRAP_ARGOCD.md
```

### 12.3 Infrastructure partagée (motif chezmoi.sh)

```text
projects/chezmoi.sh/
├── README.md
└── src/
    └── infrastructure/
        ├── crossplane/
        │   ├── aws/             # AWS provider
        │   ├── cloudflare/      # Cloudflare provider
        │   └── vault/           # Vault provider
        └── ansible/
            └── roles/
```

> [!NOTE]\
> Note du 2026-10-11 : ces arborescences décrivent le dépôt à la date de la décision. `amiya.akn` a été remplacé par
> `rhodes.akn` ([migration](../archives/MIGR-20260729-00-Migrer-Amiya-vers-Rhodes.md)), dont ArgoCD vit dans
> `projects/rhodes.akn/src/argocd/` et non dans `src/apps/argocd/`. Crossplane a été remplacé par Pulumi
> ([ADR-015](ADR-015-Migrer-Crossplane-vers-Pulumi.md)) : `projects/chezmoi.sh/src/infrastructure/` contient `ansible/`,
> `proxmox/` et `pulumi/`. Envoy Gateway et les `reference-grant.*.yaml` ont disparu de `projects/*/src` au profit de la
> Gateway Cilium (`network-policy.allow-immich-from-cilium-gateway.yaml`). ArgoCD synchronise les manifestes pré-rendus
> de `dist/` ([ADR-011](ADR-011-Motif-des-Manifestes-Rendus.md)).

### Validation et conformité

### Validation automatisée (future)

**Contrôles de validation** :

1. **Nommage des répertoires** : minuscules avec des tirets (aucun caractère spécial)
2. **Présence des labels** : labels obligatoires sur toutes les ressources
3. **Nommage des fichiers** : motifs cohérents entre les projets
4. **Répertoire de sécurité** : présence et structure
5. **Structure des kustomizations** : champs `namespace`, `labels`, `resources`
6. **Validation des ApplicationPatch** : vérifier que les fichiers `.application.patch` sont du YAML valide, avec le bon
   schéma

**Mise en œuvre** :

- Hooks de pre-commit pour le nommage des fichiers
- Pipeline CI/CD pour la validation de la structure
- Health checks ArgoCD pour les ressources déployées

### Liste de contrôle pour la revue manuelle

Pour chaque nouvelle application :

- [ ] Le nom du répertoire suit le motif minuscules et tirets (aucun caractère spécial)
- [ ] Un fichier `.application.patch` est présent et définit la politique de synchronisation
- [ ] `kustomization.yaml` contient le namespace et les labels standard
- [ ] Le label de version porte un commentaire Renovate
- [ ] Les fichiers suivent le motif `{app}.{resource}.yaml`
- [ ] Le répertoire de sécurité existe, avec les politiques standard
- [ ] La HTTPRoute porte les annotations obligatoires
- [ ] Les ressources de base de données suivent le nommage `{app}-database`
- [ ] Les ExternalSecrets référencent les bons chemins OpenBao
- [ ] Le répertoire helmvalues (avec Helm) suit la structure

### Matrice de décision de la politique de synchronisation

**Synchronisation manuelle (`enabled: false`) quand** :

- [ ] L'application est une infrastructure critique (ArgoCD, Vault, Crossplane)
- [ ] Des changements automatisés pourraient provoquer une panne de tout le cluster
- [ ] L'application fournit des services d'authentification ou d'autorisation
- [ ] Une revue manuelle est exigée pour tout changement
- [ ] L'application est en phase de premier déploiement ou de test

**Synchronisation automatique (`enabled: true`) quand** :

- [ ] L'application est un service isolé exposé aux utilisateurs
- [ ] La synchronisation et le prune automatiques sont sans risque
- [ ] L'application a peu de dépendances envers le cluster
- [ ] Des itérations et des mises à jour rapides sont souhaitées

---

## Évolution de la décision

- **2025-10-31** : Décision initiale — standardisation complète, avec le préfixe astérisque (option 1.1) pour le
  contrôle de la synchronisation ArgoCD.
- **2025-11-02** : Décision révisée sur les labels — `app.kubernetes.io/instance` et `app.kubernetes.io/component`
  retirés de `kustomization.yaml`, parce qu'ils entraient en conflit avec les sélecteurs et les templates.
- **2026-01-13** : Décision révisée — fichiers `.application.patch` (option 1.4), parce qu'ils apportent des politiques
  de synchronisation fines, des métadonnées riches et un nommage standard sur le système de fichiers.

### Écarts constatés lors de la migration

Contrôle du 2026-10-11 contre le dépôt (lecture des fichiers seule, aucun accès aux clusters) :

- **Toujours appliqué** : les fichiers `.application.patch` (`kind: ApplicationPatch`, `spec.info`, `spec.syncPolicy`)
  et leur fusion par les ApplicationSets de `projects/rhodes.akn/src/argocd/shoot.apps/` ; le motif
  `{app}.{resource}.yaml` dans `lungmen.akn/src/apps/` (par exemple `immich.httproute.yaml`,
  `immich.database.externalsecret.yaml`) ; le répertoire `security/` avec `network-policy.*.yaml` ; le motif
  `<chart>.helmvalues/` (par exemple `cert-manager.helmvalues/`, `openbao.helmvalues/`, `velero.helmvalues/`) ; le champ
  `images` des kustomizations ; la `ClusterSecretStore` `vault.chezmoi.sh` et les chemins
  `{cluster}/{app}/{category}/{secret}` (par exemple `lungmen.akn/immich/database/postgresql`).
- **Préfixe `*`** : n'existe plus nulle part sous `projects/` et aucun `hasPrefix` ne subsiste dans les ApplicationSets.
- **Labels** : aucune kustomization ne porte `app.kubernetes.io/version` ; huit kustomizations d'applications placent
  `app.kubernetes.io/instance` dans `labels` avec `includeSelectors: true`, contrairement à la révision du 2025-11-02.
- **Datasource Renovate** : le dépôt utilise `github-releases`, l'ADR écrit `github-release`.
- **Nommage partiel** : `rhodes.akn/src/apps/pocket-id/` nomme ses fichiers `main.deployment.yaml`, `cnpg.cluster.yaml`,
  `cnpg.scheduledbackup.yaml` plutôt que `{app}.{resource}.yaml` ; certains composants utilisent un répertoire
  `helmvalues/` sans préfixe de chart (`rhodes.akn/src/argocd/helmvalues/`,
  `*/infrastructure/kubernetes/cilium/helmvalues/`, `*/infrastructure/kubernetes/cloudnative-pg/helmvalues/`) ; les
  bases consolidées de `lungmen.akn/src/apps/databases/` utilisent des fichiers `*.helmvalues.yaml`. Aucun fichier
  `*.postgresql*.yaml` n'existe sous `projects/*/src`.
- **N'existe plus** : le cluster `amiya.akn`, Crossplane, Longhorn (remplacé par le plugin Proxmox CSI), Envoy Gateway
  et les ReferenceGrants dans `projects/*/src`. Les exemples qui les citent restent à titre historique.
- **Non vérifié** : les politiques de synchronisation effectives sur les clusters, la présence de
  `network-policy.default-hardened.yaml` dans chaque application, et les annotations des HTTPRoute.

---

## Historique des modifications

- _2026-10-11_ : **CHORE** : Migration vers le standard de documentation : traduction en français, gabarit d'ADR 2.0.0
  (`template-version: "2.0.0"`), suppression du sommaire manuel et des emojis, titres `####` ramenés à `###`, options
  restructurées en `### Option N : …` avec un statut, justifications regroupées dans « Décision retenue », section «
  References and Related Decisions » remplacée par « Pour aller plus loin ». Le lien vers
  `projects/amiya.akn/src/apps/argocd/README.md` pointe désormais vers `projects/rhodes.akn/src/argocd/README.md`, et le
  lien vers `CLAUDE.md` vers `AGENTS.md` (qu'il inclut). Décision, conventions, exemples, `status` et `date` inchangés :
  le dépôt ne prouve aucun changement d'état. Notes datées et section « Écarts constatés lors de la migration » ajoutées
  : préfixe `*` disparu, Longhorn remplacé par Proxmox CSI, exemples `amiya.akn` et Crossplane historiques,
  `github-release` au lieu de `github-releases`, label `app.kubernetes.io/version` absent de toutes les kustomizations.
- _2026-05-24_ : **CHORE** : `consulted` renommé en `assisted-by` dans le front matter ; préfixe `ai/` retiré des
  identifiants de modèle.
- _2026-03-19_ : **CHORE** : migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.
- _2026-01-13_ : remplacement du mécanisme du préfixe astérisque par les fichiers `.application.patch` pour le contrôle
  de la synchronisation ArgoCD. Ils apportent des politiques de synchronisation fines, des métadonnées riches et un
  nommage standard sur le système de fichiers. Option 1.1 rendue obsolète au profit de la nouvelle option 1.4. Statut
  passé de « proposed » à « accepted ».
- _2025-11-02_ : correction du placement des labels pour résoudre les conflits de sélecteurs et de templates : retrait
  de `app.kubernetes.io/instance` et `app.kubernetes.io/component` de `kustomization.yaml` (propres aux workloads), en
  ne gardant que `app.kubernetes.io/name` (avec `includeSelectors: true`) et `app.kubernetes.io/version` au niveau de
  l'application.
- _2025-11-01_ : ajout de la configuration Renovate pour le suivi automatisé des labels et des surcharges d'images, avec
  des regex managers pour les labels `app.kubernetes.io/version` et les mises à jour du champ `images` de Kustomize.
- _2025-10-31_ : création de l'ADR, qui établit des standards complets de structure de projet et de nommage pour tous
  les projets d'infrastructure Arcane, dont la convention du préfixe astérisque pour le contrôle de la synchronisation
  ArgoCD.

---

## Pour aller plus loin

- [ADR-003 Conventions de nommage des chemins OpenBao](ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) : la
  structure des chemins de secrets.
- [ADR-004 Conventions de nommage des politiques OpenBao](ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md) :
  les standards de nommage des politiques.
- [ADR-011 Motif des manifestes rendus](ADR-011-Motif-des-Manifestes-Rendus.md) : les manifestes pré-rendus de `dist/`
  que synchronisent les ApplicationSets.
- [AGENTS.md](../../AGENTS.md) : vue d'ensemble de la structure du dépôt.
- [README ArgoCD](../../projects/rhodes.akn/src/argocd/README.md) : structure des applications ArgoCD et conventions de
  synchronisation.
- [Renovate](../reference/Renovate-Reference.md) : gestion automatisée des dépendances, avec le suivi des labels et des
  images.
- [Labels recommandés par Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
  : standards officiels de labels.
- [Noms des objets Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/) : conventions
  de nommage.
- [Documentation de Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) : motifs de gestion des
  ressources.
- [Bonnes pratiques ArgoCD](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/) : motifs GitOps.
- [Motif App of Apps d'ArgoCD](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/) :
  organisation des applications.
- [Sync waves d'ArgoCD](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/) : déploiements ordonnés.
- [ApplicationSet d'ArgoCD](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/) : génération
  dynamique d'applications.
- [Configuration de Renovate](https://docs.renovatebot.com/configuration-options/) : mises à jour automatisées.
- [Manager Kubernetes de Renovate](https://docs.renovatebot.com/modules/manager/kubernetes/) : suivi des versions par
  les labels.
