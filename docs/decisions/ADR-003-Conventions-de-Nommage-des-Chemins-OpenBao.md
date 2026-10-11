---
status: "implemented"
date: 2026-05-24
implementation-completed: 2026-03-19
decision-makers: ["Alexandre"]
assisted-by: ["claude-4-sonnet"]
informed: []
template-version: "2.0.0"
---

# ADR-003 Conventions de nommage des chemins OpenBao

> [!WARNING]\
> Migré le 2026-10-11 ; les affirmations sur l'état des clusters n'ont pas été revérifiées.

## Contexte et problème

Après la mise en place de la topologie des montages de secrets OpenBao
([ADR-002](ADR-002-Topologie-des-Secrets-OpenBao.md)), il faut établir une organisation des chemins et des conventions
de nommage cohérentes à l'intérieur de chaque montage. Sans conventions standardisées, la gestion des secrets devient
chaotique, la découverte difficile et la charge opérationnelle augmente de façon significative.

Le défi consiste à définir des conventions qui soient :

- **Assez simples** pour l'exploitation d'un homelab en solo
- **Cohérentes** pour toutes les applications et tous les services
- **Évolutives** avec la croissance de l'infrastructure
- **Conformes au zero-trust**, en maintenant une isolation correcte

## Facteurs de décision

### Exigences fonctionnelles

- **Navigation intuitive** : les chemins doivent être explicites et organisés de façon logique
- **Dépendances entre applications** : gérer les secrets partagés (SSO, certificats, identifiants de services tiers,
  etc.) sans rompre l'isolation
- **Standardisation des métadonnées** : documentation des secrets et suivi des propriétaires cohérents

### Exigences non fonctionnelles

- **Sécurité zero-trust** : maintenir les principes d'isolation au niveau des montages établis dans l'ADR-002
- **Simplicité opérationnelle** : minimiser la complexité pour un environnement à opérateur unique
- **Découvrabilité** : localiser les secrets sans mécanisme de recherche complexe
- **Conception évolutive** : permettre de grossir sans restructuration majeure

### Contraintes

- **Contexte homelab** : un seul opérateur, aucun besoin de collaboration entre équipes
- **Limites d'OpenBao** : pas de capacité de proxy ACME
- **Architecture existante** : s'aligner sur la topologie de montages établie par l'ADR-002
- **Caractères autorisés** : seuls les caractères alphanumériques, les tirets, les points et les tirets bas sont
  autorisés

## Options envisagées

### Option 1.1 : Structure plate

> **Statut : REJETÉE**

- `+` Simple, hiérarchie minimale
- `-` Mauvaise organisation, découverte difficile à grande échelle, aucun regroupement logique

### Option 1.2 : Organisation par service d'abord

> **Statut : REJETÉE**

- `+` Catégorisation claire par service
- `-` Regroupement artificiel, qui ne reflète pas les dépendances réelles

### Option 1.3 : Organisation par application d'abord

> **Statut : ACCEPTÉE**

- `+` Modèle de propriété naturel, frontières de responsabilité claires
- `-` Les dépendances partagées demandent un traitement particulier

### Option 2.1 : Secrets partagés par propriétaire

> **Statut : REJETÉE**

- `+` Propriété claire
- `-` Rompt l'isolation des montages, crée des besoins d'accès inter-montages

### Option 2.2 : Secrets partagés par fonction

> **Statut : ACCEPTÉE**

- `+` Regroupement logique, maintient l'isolation
- `-` Demande des métadonnées pour suivre la propriété

## Décision retenue

**Option retenue : « Organisation par application d'abord »** pour les montages par cluster, associée aux **secrets
partagés par fonction** et à un **montage personnel isolé par utilisateur**.

### Structure d'un montage par cluster

```text
/{cluster-name}/{application-name}/{category}/{secret-name}
```

Dans cette architecture de secrets OpenBao, une **catégorie** est un regroupement logique de secrets qui partagent des
caractéristiques communes ou répondent à un usage similaire au sein d'une application.

Caractéristiques d'une catégorie :

- **Regroupement fonctionnel** : les secrets d'une même catégorie ont un rôle similaire (par exemple tous les secrets de
  base de données, tous les certificats TLS)
- **Cohérence opérationnelle** : même cycle de vie, mêmes processus de rotation, mêmes exigences de sécurité
- **Découverte facilitée** : permet de localiser rapidement tous les secrets d'un type donné
- **Gestion simplifiée** : le RBAC et les politiques peuvent s'appliquer par catégorie

Exemples de catégories :

- `database/` : tous les secrets liés aux bases de données (identifiants, chaînes de connexion)
- `auth/` : secrets d'authentification (JWT, OAuth, sessions)
- `api-keys/` : jetons d'API tiers propres à l'application
- `certificates/` : certificats TLS propres à l'application

Raisons d'utiliser des catégories :

- **Organisation** : regrouper logiquement les secrets similaires
- **Découverte** : faciliter la recherche et la découverte des secrets
- **Gestion** : simplifier la gestion des secrets (RBAC, politiques)
- **Documentation** : améliorer la compréhension des secrets

### Structure du montage partagé

```text
/shared/{category}/*
```

Comme pour les montages par cluster, les **catégories** regroupent les secrets selon leur finalité ou leur type. À la
date de la décision, les catégories sont les suivantes :

- `sso/` : authentification inter-applications (clients OIDC, SAML, clés JWT partagées)
- `certificates/` : certificats partagés (wildcards, certificats d'autorité, service mesh)
- `third-parties/` : identifiants de services externes (AWS, Cloudflare, GitHub, etc.), gérés de préférence par
  Crossplane

### Structure du montage personnel

```text
/personal/{user-email}/{category}/*
```

Le montage **personal** fournit un stockage de secrets propre à chaque utilisateur, avec une isolation automatique
fondée sur l'identité. L'accès est contrôlé par des politiques à gabarit, avec deux niveaux de permission distincts.

Caractéristiques du montage personnel :

- **Isolation par utilisateur** : chaque utilisateur, identifié par son e-mail, accède à `/personal/{son-email}/*`
- **Libre-service** : les utilisateurs créent, lisent, modifient et suppriment leurs propres secrets
- **Organisation par catégories** : même structure de catégories que les autres montages, par cohérence
- **Zero-trust** : les politiques à gabarit garantissent un contrôle d'accès correct fondé sur l'identité

Niveaux d'accès :

- **Niveau utilisateur** (politique `personal-user-access`) : accès complet à son seul espace de noms
- **Niveau administrateur** (politique `personal-admin-access`) : accès complet à son propre espace de noms, plus un
  accès en liste seule aux espaces de noms des autres utilisateurs, à des fins de supervision et d'audit

Exemples de catégories pour un usage personnel :

- `tools/` : outils personnels de développement et d'exploitation (contextes, configurations)
- `credentials/` : comptes de service et clés d'API personnels
- `certificates/` : certificats et clés propres à l'utilisateur
- `bookmarks/` : points d'accès et chaînes de connexion personnels

Exemples de chemins :

- `/personal/alexandre@chezmoi.sh/tools/talos/amiya.akn/admin-context` : contexte du cluster Talos
- `/personal/alexandre@chezmoi.sh/credentials/github/personal-token` : jeton GitHub personnel
- `/personal/user@domain.com/tools/kubectl/staging-config` : configuration kubectl

### Catégorie `sso`

~~Cette catégorie sert à stocker les secrets utilisés par plusieurs applications pour l'authentification (principalement
des clients OIDC).~~

**OBSOLÈTE** : à la suite d'une analyse de sécurité, les secrets SSO ont été déplacés vers les montages par projet pour
mettre en place une isolation correcte. Voir l'entrée du 2025-07-01 de l'historique des modifications pour le détail de
la migration.

**Ancienne structure** (obsolète) : **_clients OIDC_** : `/shared/sso/oidc-clients/{application-name}` _(exemple : le
client OIDC d'ArgoCD était stocké dans `/shared/sso/oidc-clients/argocd`)_

**Nouvelle structure** (depuis le 2025-07-01) : **_clients OIDC_** :
`/{cluster-name}/{application-name}/auth/oidc-client` _(exemple : le client OIDC d'ArgoCD est désormais stocké dans
`/amiya.akn/argocd/auth/oidc-client`)_

**Justification de la migration** : l'approche SSO partagée créait un risque de sécurité : n'importe quel cluster
pouvait accéder aux identifiants `client_secret` OIDC des autres clusters, ce qui permettait des attaques d'usurpation
d'identité. Le passage aux montages par projet garantit une isolation correcte tout en conservant les accès nécessaires
pour Authelia.

> [!NOTE]\
> Note du 2026-10-11 : les exemples ci-dessus citent `amiya.akn` et Authelia, qui ne sont plus en service. Le cluster
> `amiya.akn` a été migré vers `rhodes.akn` (`docs/migrations/amiya.akn->rhodes.akn.md`) et `rhodes.akn` n'exécute pas
> Authelia : Pocket-Id est le fournisseur d'identité (commentaire de
> `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`, lignes 29 à 31). La convention
> `/{cluster}/{app}/auth/oidc-client` reste appliquée : les `ExternalSecret` de `projects/*/src` référencent par exemple
> `rhodes.akn/argocd/auth/oidc-client` et `lungmen.akn/immich/auth/oidc-client`. Le script `scripts/bao:secret:audit`
> signale toujours la catégorie `shared/sso` comme obsolète.

### Catégorie `certificates`

Cette catégorie contient les certificats partagés (par exemple les wildcards) qui seront distribués à plusieurs
applications ou clusters.

**Structure recommandée** :

> [!CAUTION]\
> Quand c'est possible, la PKI intégrée d'OpenBao **DOIT** être utilisée pour générer les certificats.

**_Certificats wildcard_** : `/shared/certificates/{provider}/{certificate-name}` _(par exemple, le certificat
`*.chezmoi.sh` est stocké dans `/shared/certificates/letsencrypt/wildcard-chezmoi-sh`)_

### Catégorie `third-parties`

Cette catégorie contient les identifiants partagés de services tiers (AWS, Cloudflare, GitHub, etc.) qui sont, en
général, gérés par Crossplane.

**Structure recommandée** :

**_Identifiants AWS_** : `/shared/third-parties/aws/{service}/{app-or-purpose}` _(par exemple, les identifiants AWS
utilisés par `amiya.akn/cnpg` pour accéder au bucket `important-backup` sont stockés dans
`/shared/third-parties/aws/iam/amiya.akn/cnpg-important-backup-rw`)_\
**_Identifiants Cloudflare_** : `/shared/third-parties/cloudflare/{service}/{app-or-purpose}` _(par exemple, les
identifiants Cloudflare utilisés par `amiya.akn/cert-manager` pour accéder à toutes les zones DNS sont stockés dans
`/shared/third-parties/cloudflare/iam/amiya.akn/cert-manager-rw`)_\
**_Compte Let's Encrypt_** : `/shared/certificates/certificate-authorities/letsencrypt/account` _(par exemple, les
identifiants du compte Let's Encrypt utilisés par cert-manager sont stockés dans
`/shared/certificates/certificate-authorities/letsencrypt/account`)_\
**_Autres fournisseurs_** : `/shared/third-parties/{provider}/{service}/{project-name}/{app-or-purpose}`

Cette structure de chemin est plus complexe que les autres : elle impose de préciser le fournisseur cloud, le service et
le nom du projet. Cette complexité est nécessaire parce que ces secrets concernent souvent des services externes dont la
fuite pourrait entraîner des problèmes de facturation. Pour réduire le rayon d'impact, le nom du projet isole chaque
projet des autres.

> [!NOTE]\
> Note du 2026-10-11 : les exemples `amiya.akn/...` et la gestion par Crossplane sont historiques. Crossplane a été
> remplacé par Pulumi ([ADR-015](ADR-015-Migrer-Crossplane-vers-Pulumi.md)) et aucune ressource Crossplane n'existe plus
> dans `projects/*/src`. La convention `/shared/third-parties/{provider}/{service}/{cluster}/{app-or-purpose}` reste
> appliquée, avec Pulumi comme producteur : `projects/lungmen.akn/src/infrastructure/pulumi/stack/cert-manager.ts` écrit
> `third-parties/cloudflare/iam/lungmen.akn/cert-manager-rw` dans le montage `shared`, lu par
> `letsencrypt-issuer-credentials.externalsecret.yaml`. Le compte Let's Encrypt est toujours à
> `shared/certificates/certificate-authorities/letsencrypt/account`. Aucun chemin AWS ni `wildcard-chezmoi-sh` n'a été
> retrouvé dans `projects/*/src`.

### Schéma de métadonnées

**Champs obligatoires** :

```json
{
  "origin": "Creation origin (examples: manual, crossplane, cert-manager, app-generated, terraform)",
  "description": "Human readable description of the secret purpose",
  "owner": "Entity responsible for the secret (examples: amiya.akn/argocd, maison/crossplane, amiya.akn/authelia)"
}
```

**Extensions recommandées** :

```json
{
  "created-by": "Creation method or command (examples: terraform apply, kubectl create, crossplane, manual-admin)",
  "renewal-process": "Renewal method (examples: cert-manager-auto, manual-rotation, https://wiki.example.com/renewal)",
  "x-apps": "Consuming applications (examples: argocd,grafana,n8n)",
  "x-aws-services": "Accessible AWS services (examples: s3,ses,cloudwatch)",
  "x-docs-url": "Documentation link (example: https://wiki.example.com/service-x)"
}
```

## Conséquences

### Positives

- (+) **Organisation cohérente** : emplacements des secrets clairs et prévisibles
- (+) **Efficacité opérationnelle** : découverte et gestion des secrets plus rapides
- (+) **Conformité de sécurité** : maintient les principes zero-trust de l'ADR-002
- (+) **Culture de documentation** : les exigences de métadonnées améliorent la documentation des secrets
- (+) **Évolutivité** : la structure permet de grossir sans réorganisation

### Négatives

- (-) **Courbe d'apprentissage** : l'opérateur doit apprendre et respecter les conventions
- (-) **Discipline sur les métadonnées** : exige un renseignement cohérent des métadonnées
- (-) **Complexité des dépendances croisées** : les secrets partagés demandent de la coordination

### Neutres

- (\~) **Migration nécessaire** : les secrets existants doivent être réorganisés pour suivre les conventions
- (\~) **Mise à jour de l'outillage** : les scripts et l'automatisation doivent s'adapter aux nouveaux chemins

## Détails de mise en œuvre et état

### Stratégie de gestion des certificats

OpenBao n'ayant pas de capacité de proxy ACME, les certificats wildcard sont :

1. **Générés** par cert-manager avec Let's Encrypt
2. **Stockés** par External Secrets Operator dans `/shared/certificates/`
3. **Distribués** aux applications selon les besoins

### Dépendances entre applications

Pour les services qui exigent une configuration partagée (par exemple le client OIDC d'ArgoCD dans Authelia) :

- **Stockage du secret** : `/amiya.akn/argocd/auth/oidc-client`
- **Suivi de la propriété** : `metadata.owner = "amiya.akn/authelia"`
- **Modèle d'accès** : ArgoCD lit depuis son propre montage, Authelia lit entre montages via une politique dédiée

### Organisation AWS et fournisseurs cloud

Les identifiants des fournisseurs cloud suivent une organisation par service :

- **Motif** : `/shared/third-parties/{provider}/{service}/{project-name}/{app-or-purpose}`
- **Stratégie IAM** : un utilisateur IAM par application, avec des permissions propres au service
- **Usage des métadonnées** : le champ `x-aws-services` documente les services accessibles

### Conformité et supervision

- **Conformité de sécurité** : préservée par la topologie de l'ADR-002
- **Moindre privilège** : les chemins propres à chaque application permettent un RBAC granulaire
- **Piste d'audit** : les métadonnées fournissent le suivi de la propriété et de la création

## Évolution de la décision

### Justification

Raisons du choix de chaque option retenue.

### Pourquoi l'application d'abord pour les montages par cluster

- **Propriété naturelle** : les applications possèdent naturellement leurs secrets
- **Frontières claires** : il est facile de voir ce qui appartient à quelle application
- **Alignement RBAC** : correspond aux modèles de compte de service et de RBAC de Kubernetes
- **Clarté opérationnelle** : le dépannage et la maintenance suivent les frontières applicatives

### Pourquoi un classement par fonction pour le montage partagé

- **Regroupement logique** : SSO, certificats et services tiers sont des fonctions distinctes
- **Navigation intuitive** : il est plus facile de trouver l'authentification partagée que les certificats partagés
- **Propriété par les métadonnées** : les métadonnées suivent la propriété réelle sans polluer les chemins
- **Conformité zero-trust** : maintient l'isolation au niveau des montages tout en permettant le partage nécessaire

### Pourquoi un montage personnel isolé par utilisateur

- **Libre-service** : les utilisateurs gèrent leurs outils et secrets personnels de façon indépendante
- **Zero-trust** : les politiques à gabarit appliquent automatiquement l'isolation par utilisateur à partir de
  l'identité OIDC
- **Efficacité opérationnelle** : réduit la charge d'administration pour les outils de développement personnels
- **Supervision administrative** : les administrateurs peuvent auditer les espaces personnels tout en préservant la vie
  privée des utilisateurs
- **Cohérence des catégories** : suit les mêmes motifs d'organisation que les autres montages

### Pourquoi ce schéma de métadonnées

- **Charge minimale** : seules les informations essentielles sont exigées
- **Extensions pragmatiques** : les champs facultatifs apportent de la valeur sans complexité
- **Adapté à un homelab** : évite les champs orientés entreprise (criticité, calendriers de rotation)
- **Aide à la découverte** : `x-apps` permet l'analyse d'impact des changements

### Écarts constatés lors de la migration

Contrôle du 2026-10-11 contre le dépôt (aucun accès aux clusters ni à OpenBao) :

- **Toujours appliqué** : le motif `/{cluster}/{application}/{category}/{secret}` (par exemple
  `lungmen.akn/homebox/database/postgresql`, `rhodes.akn/grafana/auth/oidc-client`), les catégories `certificates` et
  `third-parties` du montage `shared` (`shared/third-parties/tailscale/oauth/lungmen.akn`), et les montages `shared` et
  `personal` créés dans `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`, avec les politiques
  `personal-user-access` et `personal-admin-access`. Le script `scripts/bao:secret:audit` encode les catégories `sso`,
  `certificates` et `third-parties`, signale `sso` comme obsolète et exclut `personal` du contrôle des orphelins.
- **N'existe plus** : le cluster `amiya.akn` (remplacé par `rhodes.akn`), Authelia (remplacé par Pocket-Id) et
  Crossplane (remplacé par Pulumi, ADR-015). Les chemins d'exemple qui les citent restent à titre historique.
- **Écart de métadonnées** : le schéma décrit `origin`, `description` et `owner` comme champs obligatoires. L'aide
  `vaultSecretMetadata` (`catalog/pulumi/lib/src/vault-secret-metadata.ts`) écrit désormais `created-by`, `owner`,
  `renewal-process` et `x-renewal-cmd`, et le secret `cert-manager-rw` ajoute `description` et `application` ; aucun
  champ `origin` n'y apparaît. Le schéma documenté n'est donc plus appliqué tel quel côté Pulumi.
- **Non retrouvé** : le chemin `/shared/certificates/letsencrypt/wildcard-chezmoi-sh`, les chemins AWS et les chemins
  `/personal/...` n'apparaissent pas dans `projects/*/src` ; leur présence dans OpenBao n'a pas été vérifiée.

## Historique des modifications

- _2026-10-11_ : **CHORE** : Migration vers le standard de documentation : traduction en français, gabarit d'ADR 2.0.0
  (`template-version: "2.0.0"`), suppression du sommaire manuel et de la section « References and Related Decisions »
  remplacée par « Pour aller plus loin », suppression des emojis. Décision, options, exemples de chemins, `status` et
  `date` inchangés : le dépôt ne prouve aucun changement d'état. Notes datées ajoutées sur les exemples `amiya.akn`,
  Authelia et Crossplane, et constat sur le schéma de métadonnées.
- _2026-05-24_ : **CHORE** : `consulted` renommé en `assisted-by` dans le front matter ; préfixe `ai/` retiré des
  identifiants de modèle.
- _2026-03-19_ : **CHORE** : migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.
- _2025-08-30_ : **FIX** : remplacement de l'exemple de la convention de chemin du compte Let's Encrypt
  (`/shared/third-parties/letsencrypt/certificate-authority/account`) par
  `/shared/certificates/certificate-authorities/letsencrypt/account`. Le premier exemple est invalide au regard de la
  politique par défaut définie dans l'[ADR-004](ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md).
- _2025-08-17_ : **FEATURE** : ajout d'un exemple de convention de chemin pour le compte Let's Encrypt
  `/shared/third-parties/letsencrypt/certificate-authority/account`, pour les identifiants du compte ACME utilisés par
  cert-manager.
- _2025-08-11_ : **FEATURE** : ajout de la structure du montage personnel avec des espaces de noms isolés par
  utilisateur. Mise en place de politiques à gabarit à deux niveaux (`personal-user-access` pour les utilisateurs
  standard, `personal-admin-access` pour les administrateurs) fondées sur les métadonnées d'alias OIDC. Cela permet une
  gestion des secrets en libre-service pour les outils personnels (contextes Talos, configurations kubectl, jetons d'API
  personnels) tout en maintenant les principes zero-trust et la supervision administrative.
- _2025-07-01_ : **SECURITY** : migration des secrets SSO de `/shared/sso/*` vers les montages par projet selon le motif
  `/{cluster}/{app}/auth/{secret}`. Ce changement corrige une vulnérabilité : la politique `global-eso-policy`
  autorisait n'importe quel cluster à accéder aux identifiants `client_secret` OIDC des autres clusters, ce qui
  permettait une usurpation d'identité. La nouvelle structure maintient une isolation correcte tout en donnant à
  Authelia un accès légitime entre montages via des politiques dédiées.
- _2025-06-30_ : mise à jour des conventions de nommage des chemins pour correspondre aux nouvelles conventions de
  nommage des politiques.

## Pour aller plus loin

- [ADR-002 Topologie des secrets OpenBao](ADR-002-Topologie-des-Secrets-OpenBao.md) : la topologie des montages dont cet
  ADR détaille l'organisation interne.
- [ADR-004 Conventions de nommage des politiques OpenBao](ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md) :
  les politiques qui s'appliquent à ces chemins.
- [ADR-015 Migrer Crossplane vers Pulumi](ADR-015-Migrer-Crossplane-vers-Pulumi.md) : le remplacement de Crossplane par
  Pulumi pour les secrets tiers.
- [Structure des espaces de noms Vault](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure)
  : bonnes pratiques de structure des chemins HashiCorp Vault.
- [Documentation du moteur de secrets KV d'OpenBao](https://openbao.org/docs/secrets/kv/) : référence du moteur KV.
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) : cadre de référence de sécurité.
- [Secrets Kubernetes](https://kubernetes.io/docs/concepts/configuration/secret/) : bonnes pratiques de gestion des
  secrets.
- [Modèle de sécurité de HashiCorp Vault](https://developer.hashicorp.com/vault/docs/internals/security) : modèle de
  sécurité de référence.
- [External Secrets Operator](https://external-secrets.io/) et [cert-manager](https://cert-manager.io/) : documentation
  des outils de mise en œuvre.
- [Injection Vault de Crossplane](https://docs.crossplane.io/latest/guides/vault-injection/#store-credentials-in-vault)
  : guide historique de stockage des identifiants dans Vault.
