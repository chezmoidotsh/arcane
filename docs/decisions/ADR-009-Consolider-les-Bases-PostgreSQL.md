---
status: "implemented"
date: 2026-10-18
implementation-completed: 2026-10-18
decision-makers: ["Alexandre"]
assisted-by: ["gemini"]
informed: []
template-version: "2.0.0"
---

# ADR-009 Consolider les bases PostgreSQL

> [!NOTE]\
> **État au 2026-10-18 : décision appliquée, avec un écart assumé.** Deux des trois clusters partagés existent sur
> `lungmen.akn` : `postgres-apps` (`homebox`, `linkding`, `n8n`, `spoolman`) dans
> `projects/lungmen.akn/src/apps/databases/postgres-apps.helmvalues.yaml` et `postgres-apps-secured` (`immich`,
> `paperless`) dans `projects/lungmen.akn/src/apps/databases/postgres-apps-secured.helmvalues.yaml`, tous deux produits
> par le chart `catalog/helm/mutualized-cnpg-databases`. `postgres-security` ne sera pas créé : le mainteneur garde un
> cluster dédié à OpenBao (`projects/rhodes.akn/src/apps/vault/cnpg.cluster.yaml`) et un autre à Pocket-Id
> (`projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml`) sur `rhodes.akn`, pour isoler les composants les plus
> critiques. Grafana garde aussi son cluster dédié
> (`projects/rhodes.akn/src/infrastructure/kubernetes/o11y/grafana.cnpg.cluster.yaml`). Le cluster `amiya.akn` cité plus
> bas n'existe plus dans `projects/`, et les applications `atuin` et `jellyseerr`, citées dans le texte, n'ont plus de
> manifeste sous `projects/lungmen.akn/src/apps/`. Le texte ci-dessous est conservé tel que décidé.

## Contexte et problème

Chaque application qui requiert PostgreSQL dispose aujourd'hui de son propre cluster CloudNative-PG dédié. Par exemple,
`amiya.akn` héberge `pocket-id` et `openbao`, tandis que `lungmen.akn` héberge `atuin`, `immich`, `jellyseerr`, `n8n` et
`paperless-ngx`. Chacune de ces instances fonctionne de façon indépendante, avec ses propres planifications de
sauvegarde, allocations de ressources, supervision, maintenance et configuration CNPG.

Cette architecture entraîne des difficultés notables : surcharge de ressources (chaque instance consomme au minimum 200
à 500 Mo de RAM), fragmentation du stockage due à de multiples petits PVC, forte complexité d'exploitation liée à la
gestion de plus de 7 planifications de sauvegarde et cycles de mise à jour distincts, configurations incohérentes d'un
cluster à l'autre et stockage des sauvegardes peu efficace. Le cluster `lungmen.akn`, en particulier, subit une pression
sur ses ressources à mesure que les déploiements d'applications augmentent.

La question stratégique à laquelle cet ADR répond est la suivante : comment réduire la surcharge de ressources et la
complexité d'exploitation des instances PostgreSQL, tout en préservant la sécurité et les performances dans une
infrastructure de homelab en croissance ?

## Facteurs de décision

- **Exigences non fonctionnelles** :
  - Réduire la surcharge de ressources (RAM, stockage) des instances PostgreSQL, avec une cible de 40 à 60 %.
  - Réduire la charge cognitive de la gestion des sauvegardes et des cycles de mise à jour.
  - Standardiser la configuration de PostgreSQL pour toutes les applications.
  - Maintenir l'isolation de sécurité entre les données des applications.
  - Faciliter la gestion des versions de PostgreSQL.
  - Haute disponibilité pour les applications d'authentification et pour celles aux données sensibles.
  - Capacité de restauration à un instant donné (PITR) par base de données.
  - Aucun accès à une base de données d'une autre application.
  - Intégration d'OpenBao pour le stockage des identifiants.

## Options envisagées

### Option 1 : consolider dans 3 clusters CloudNative-PG partagés

> **Statut : ACCEPTÉE**

Cette option consiste à créer trois clusters CloudNative-PG partagés : `postgres-security` pour l'authentification et
les secrets (pocket-id, openbao), `postgres-apps` pour les applications standard (atuin, jellyseerr, n8n) et
`postgres-apps-secured` pour les applications aux données sensibles (immich, paperless-ngx). Les clusters
`postgres-security` et `postgres-apps-secured` auront 1 primaire et 1 réplica pour la haute disponibilité, tandis que
`postgres-apps` n'aura qu'un seul primaire. L'isolation par base de données reposera sur les CRD `Database` de CNPG, et
un contrôle d'accès par rôle sera mis en place pour chaque application. Les configurations de sauvegarde seront
standardisées par type de cluster, OpenBao assurant le stockage des identifiants.

- `+` Réduit significativement la surcharge de ressources.
- `+` Simplifie la gestion des sauvegardes et la standardisation des configurations.
- `+` Maintient les frontières de sécurité grâce aux fonctions de PostgreSQL (schémas, rôles).
- `+` Facilite la gestion des versions de PostgreSQL.
- `+` Exploite les CRD `Database` et `Cluster` de CNPG pour une meilleure automatisation.
- `-` Rayon d'impact accru pour les clusters partagés (atténué par les réplicas et une conception soignée).
- `-` Risque de « voisin bruyant » (atténué par la séparation des applications sensibles).
- `-` Restauration d'une seule base plus complexe (atténuée par la documentation et les procédures).
- `-` Effort de migration important pour les applications existantes.

### Option 2 : conserver les clusters individuels et optimiser les ressources

> **Statut : REJETÉE**

Cette approche maintient l'architecture actuelle, où chaque application qui requiert PostgreSQL possède son propre
cluster CloudNative-PG dédié. Les efforts porteraient sur l'optimisation de la consommation de ressources et de la
configuration de chaque cluster pour en réduire la surcharge.

- `+` Isolation maximale entre les applications.
- `+` Aucun risque de migration.
- `+` Rayon d'impact plus simple (une seule application touchée par panne).
- `-` Ne traite pas efficacement le problème de la surcharge cumulée de ressources.
- `-` La complexité d'exploitation reste élevée, du fait de la gestion de nombreux clusters indépendants.
- `-` Aucune amélioration significative de l'efficacité de la gestion des sauvegardes.

### Option 3 : un cluster PostgreSQL unique pour toutes les applications

> **Statut : REJETÉE**

Cette option propose de regrouper toutes les applications dans un seul grand cluster PostgreSQL. Toutes les bases y
résideraient et partageraient ses ressources et ses mécanismes de sauvegarde.

- `+` Efficacité maximale en ressources.
- `+` Gestion des sauvegardes la plus simple possible (une seule planification à maintenir).
- `+` Exploitation la plus aisée du point de vue de l'infrastructure.
- `-` Rayon d'impact inacceptable (une seule panne touche toutes les applications).
- `-` Les services critiques d'authentification et de secrets seraient mélangés à des applications utilisateur moins
  sensibles, ce qui pose un risque de sécurité.
- `-` Absence de frontières de sécurité claires entre les différents niveaux d'applications.

### Option 4 : utiliser un PostgreSQL managé externe (AWS RDS, etc.)

> **Statut : REJETÉE**

Cette alternative suggère de migrer toutes les bases PostgreSQL vers un service cloud managé externe, comme AWS RDS,
Google Cloud SQL ou Azure Database for PostgreSQL.

- `+` Aucune charge d'exploitation pour la gestion des bases de données.
- `+` Gestion professionnelle des sauvegardes et haute disponibilité intégrée.
- `-` Entraîne des coûts mensuels, ce qui ne correspond pas aux principes d'auto-hébergement du homelab.
- `-` Soulève des questions de souveraineté des données, celles-ci résidant dans le cloud.
- `-` Exige une connectivité Internet permanente pour que les applications accèdent à leurs bases.
- `-` Supprime l'occasion d'apprendre et de pratiquer des solutions natives de Kubernetes comme CloudNative-PG.

## Décision retenue

**Option retenue : « Consolider dans 3 clusters CloudNative-PG partagés » (option 1)**, parce que cette approche offre
le meilleur équilibre entre efficacité des ressources, simplification de l'exploitation et maintien d'une sécurité et
d'une résilience acceptables dans le contexte du homelab. Elle répond directement aux problèmes critiques de surcharge
de ressources et de complexité d'exploitation identifiés dans l'énoncé du problème, tout en s'appuyant sur les
fonctionnalités robustes de CloudNative-PG pour la multi-location et l'isolation. La conception en trois clusters permet
de séparer logiquement les applications selon leur criticité et la sensibilité de leurs données, ce qui atténue
l'accroissement du rayon d'impact et le risque de voisin bruyant liés à la consolidation, et s'aligne avec la
philosophie d'auto-hébergement du homelab fondée sur des outils natifs de Kubernetes.

## Conséquences

### Positives

- (+) Consommation de CPU et de RAM réduite grâce à un nombre moindre d'instances PostgreSQL.
- (+) Utilisation du stockage plus efficace grâce à la consolidation des WAL et des checkpoints.
- (+) Coûts de stockage S3 des sauvegardes réduits.
- (+) Processus de gestion des sauvegardes et des mises à jour simplifiés.
- (+) Configuration de PostgreSQL standardisée entre les applications.
- (+) Dépannage facilité par des journaux consolidés.
- (+) Complexité réduite des définitions d'applications ArgoCD.

### Négatives

- (-) Rayon d'impact accru pour les applications qui partagent un cluster, bien qu'atténué par les configurations de
  réplicas et une conception soignée.
- (-) Risque de « voisin bruyant », en particulier si les limites de ressources ne sont pas correctement définies,
  atténué par la séparation des applications sensibles dans `postgres-apps-secured`.
- (-) Migration initiale des données des clusters autonomes existants vers les clusters partagés nécessaire.
- (-) Restauration d'une seule base depuis la sauvegarde d'un cluster partagé plus complexe que depuis celle d'un
  cluster dédié (atténuée par des procédures).

### Neutres

- (\~) Nécessite des changements dans les applications pour mettre à jour les chaînes de connexion aux bases et les
  références aux `ExternalSecret`.
- (\~) Nécessite la mise à jour des NetworkPolicies pour autoriser les applications à se connecter aux nouveaux clusters
  partagés.

## Détails de mise en œuvre et état

- **Composants terminés** : les clusters partagés `postgres-apps` et `postgres-apps-secured` sur `lungmen.akn`, leurs
  sauvegardes vers le stockage objet (`apps.objectstore.yaml`, `apps.scheduledbackup.yaml` et leurs équivalents
  `apps-secured`, identifiants dans `cnpg-backup-credentials.externalsecret.yaml`) et leurs NetworkPolicies
  (`projects/lungmen.akn/src/apps/databases/security/`).
- **Écart assumé** : `postgres-security` n'est pas créé. OpenBao et Pocket-Id gardent chacun un cluster dédié sur
  `rhodes.akn`, pour isoler les composants les plus critiques.
- **Non vérifié** : les ServiceMonitors Prometheus de la liste d'origine, la supervision passant par VictoriaMetrics
  depuis l'[ADR-013](./013-centralized-observability-victoriametrics-lxc.md).
- **Architecture** :
  - **`postgres-security` (amiya.akn), abandonné** : prévu pour l'authentification et la gestion des secrets critiques (par exemple
    `pocket-id`, `openbao`). Configuré avec 1 primaire et 1 réplica pour la haute disponibilité.
  - **`postgres-apps` (lungmen.akn)** : héberge les applications utilisateur standard à sensibilité de données modérée
    (par exemple `atuin`, `jellyseerr`, `n8n`). Configuré avec une seule instance primaire.
  - **`postgres-apps-secured` (lungmen.akn)** : conçu pour les applications qui manipulent des données personnelles
    sensibles ou volumineuses (par exemple `immich`, `paperless-ngx`). Configuré avec 1 primaire et 1 réplica pour une
    résilience renforcée.
  - L'isolation par base de données reposera sur les ressources personnalisées `Database` de CloudNative-PG.
  - Le contrôle d'accès par rôle sera géré par application, les identifiants étant stockés dans OpenBao.
- **Spécification des standards** :
  - Les conventions de nommage des objets PostgreSQL (bases, rôles) suivront le `snake_case`.

## Historique des modifications

- _2026-10-18_ : **FEATURE** : Passage de `status` de `accepted` à `implemented`, avec `implementation-completed`, à la
  demande du mainteneur lors de la relecture de la migration : `postgres-security` n'est pas créé et OpenBao et
  Pocket-Id gardent chacun un cluster dédié sur `rhodes.akn`, pour isoler les composants les plus critiques. Facteurs de
  décision reformulés pour ne plus contenir la solution (cibles chiffrées gardées). Note d'état et section de mise en
  œuvre mises à jour, bandeau de vérification retiré.
- _2026-10-11_ : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections renommées,
  sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, statuts explicites
  ajoutés aux options d'après le texte de la décision, émojis des conséquences remplacés par les marqueurs du gabarit,
  `template-version` ajouté, références de mise en œuvre conservées. Décision, options, chronologie et dates d'origine inchangées.
- _2026-10-11_ : **FEATURE** : Passage de `status` de `proposed` à `accepted`, sans `implementation-completed`. Le dépôt
  prouve que la décision est appliquée en partie : `postgres-apps` et `postgres-apps-secured` sont déployés sur
  `lungmen.akn` (`projects/lungmen.akn/src/apps/databases/`, chart `catalog/helm/mutualized-cnpg-databases`), alors que
  `postgres-security` n'existe pas (clusters dédiés `pocket-id`, `openbao` et `grafana` sous
  `projects/rhodes.akn/src/`). Le statut `implemented` est écarté tant que ce cluster et la migration de ces bases
  restent à faire. Ajout de la note `> [!NOTE]` en tête et mise à jour de `date`. La section
  `Détails de mise en œuvre et état` n'a pas été réécrite.
- _2026-05-24_ : **CHORE** : Renommage de `consulted` en `assisted-by` ; suppression du préfixe `ai/` des identifiants
  de modèles ; correction de `decision-makers` en `["Alexandre"]`.
- _2026-03-20_ : **FEATURE** : Création initiale de l'ADR, qui documente la décision de consolider les bases PostgreSQL
  dans des clusters CloudNative-PG partagés.

## Pour aller plus loin

- [ADR-007 Structure des projets et conventions de nommage](../archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md)
  : les conventions de nommage des projets, dont celles des clusters.
- [Chart mutualized-cnpg-databases](../../catalog/helm/mutualized-cnpg-databases/README.md) : le chart qui produit les
  clusters partagés `postgres-apps` et `postgres-apps-secured`.
- [Restaurer CNPG depuis le stockage objet](../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md)
  : la restauration d'un cluster partagé depuis ses sauvegardes.
- [Rétablir un cluster CNPG au WAL plein](../procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md)
  : le rétablissement d'un cluster dont le disque de WAL est saturé.
- [Issue 661](https://github.com/chezmoidotsh/arcane/issues/661) : « Consolidate PostgreSQL databases into shared CNPG clusters », la stratégie d'allocation d'origine.
- Références d'origine, sans lien dans le texte initial : documentation de la CRD `Database` de CloudNative-PG, documentation de la CRD `Cluster` de CloudNative-PG, documentation de l'isolation par schéma de PostgreSQL.
