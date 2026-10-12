---
status: "implemented"
date: 2026-05-24
implementation-completed: 2025-06-28
decision-makers: ["Alexandre"]
assisted-by: ["claude-4-sonnet", "chatgpt-4o"]
informed: []
template-version: "2.0.0"
---

# ADR-001 Gestion centralisée des secrets

Migré le 2026-10-11 ; les affirmations sur l'état des clusters n'ont pas été revérifiées.

Titre d'origine : « Adopt Centralized Secret Management Solution ».

## Contexte et problème

### Vue d'ensemble de l'architecture actuelle

La gestion des secrets du projet d'infrastructure Arcane (en particulier le cluster `amiya.akn`) repose sur un dépôt Git
distribué, dont les secrets sont chiffrés avec [SOPS](https://github.com/getsops/sops). L'architecture fonctionne ainsi
:

1. **Stockage des secrets** : les secrets sont stockés dans un dépôt Git, chiffrés avec SOPS à l'aide de clés GPG.
2. **Synchronisation** : une application ArgoCD synchronise ces secrets chiffrés dans le cluster.
3. **Distribution** : l'[ExternalSecret Operator](https://external-secrets.io/) récupère les secrets et les met à
   disposition des applications.
4. **Dépendance réseau** : tout le flux dépend du proxy réseau de Tailscale pour que l'ExternalSecret Operator accède à
   l'API Kubernetes du cluster « source ».

> [!NOTE]\
> Note du 2026-10-11 : le cluster `amiya.akn` n'existe plus. Son arborescence a été supprimée du dépôt par le commit
> `3eb24cc9` (2026-08-09, `-[project:amiya.akn]: Remove fully-migrated amiya.akn project tree`) ; `projects/` contient
> aujourd'hui `rhodes.akn`, `lungmen.akn` et d'autres projets, et `projects/rhodes.akn/src/apps/vault/` porte l'OpenBao
> qui a pris le relais.

### Problèmes critiques identifiés

Cette architecture, bien que fonctionnelle, présente **deux problèmes critiques majeurs**.

### 1. Dépendance critique au proxy réseau de Tailscale

- **Point de défaillance unique** : tout le flux de synchronisation des secrets dépend du proxy réseau de Tailscale.
- **Impact d'une panne Internet** : toute panne d'Internet ou du service Tailscale interrompt complètement la
  synchronisation des secrets.
- **Blocage des déploiements** : les pannes affectent les nouveaux déploiements et la stabilité des applications.
- **Complexité de reprise** : une intervention manuelle est nécessaire lors des incidents réseau.

### 2. Complexité opérationnelle et charge cognitive

- **Gestion multi-systèmes** : les secrets exigent d'interagir avec plusieurs systèmes faiblement couplés :
  - Git pour le stockage et le versionnement ;
  - GPG/SOPS pour le chiffrement et le déchiffrement ;
  - Tailscale pour le contrôle d'accès réseau ;
  - l'API Kubernetes pour la distribution des secrets.
- **Audit difficile** : aucune piste d'audit centralisée sur l'ensemble des systèmes distribués.
- **Barrières de connaissance** : une compréhension approfondie de plusieurs technologies est nécessaire.
- **Flux sujets aux erreurs** : les processus manuels augmentent le risque de mauvaises configurations.

### Impact sur les opérations

Ces limites affectent directement :

- **La fiabilité** : des interruptions de service dues à la dépendance réseau.
- **L'expérience développeur** : des flux complexes pour des opérations courantes sur les secrets.
- **La conformité** : une difficulté à satisfaire les exigences d'audit et de gouvernance.
- **La scalabilité** : des difficultés à ajouter de nouvelles applications et de nouvelles équipes.

### Question stratégique

Comment mettre en œuvre une solution moderne et centralisée de gestion des secrets, qui élimine les points de
défaillance uniques, fournit des contrôles de sécurité de niveau entreprise et offre de meilleures capacités
opérationnelles, tout en respectant les principes d'auto-hébergement et en s'intégrant à l'infrastructure existante (SSO
Authelia, Kubernetes, ArgoCD) ?

> [!NOTE]\
> Note du 2026-10-11 : Authelia n'est plus le SSO du dépôt. Pocket-Id est le fournisseur d'identité unique : le backend
> d'authentification OIDC d'OpenBao est configuré avec Pocket-Id dans
> `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`, qui précise que « rhodes.akn doesn't run Authelia —
> Pocket-Id is the SSO ».

## Facteurs de décision

- **Fiabilité** : éliminer la dépendance critique au proxy réseau de Tailscale.
- **Sécurité** : mettre en place des contrôles d'accès fins et des pistes d'audit complètes.
- **Efficacité opérationnelle** : réduire la complexité de la gestion de secrets répartie sur plusieurs systèmes.
- **Expérience utilisateur** : fournir une interface web moderne pour les opérations sur les secrets.
- **Intégration** : s'intégrer sans friction à l'infrastructure Kubernetes/ArgoCD existante.
- **Auto-hébergement** : garder la maîtrise de l'infrastructure de gestion des secrets.
- **SSO/OIDC** : s'intégrer à Authelia, déjà en place, pour une authentification centralisée.

## Options envisagées

### Option 1 : Infisical

> **Statut : REJETÉE**

Plateforme moderne de gestion des secrets, centrée sur l'expérience développeur.

- `+` interface moderne et excellente expérience développeur
- `+` déploiement plus simple avec des charts Helm
- `+` intégration PostgreSQL avec CloudNativePG
- `+` développement actif et communauté en croissance
- `-` **le SSO OIDC nécessite une licence Enterprise**
- `-` écosystème plus réduit que celui de Vault
- `-` moins éprouvé dans les déploiements à grande échelle

### Option 2 : HashiCorp Vault

> **Statut : REJETÉE**

Solution de référence de l'industrie pour la gestion des secrets, aux fonctionnalités complètes.

- `+` support OIDC/SSO dans la version open source
- `+` référence de l'industrie, avec un écosystème étendu
- `+` scalabilité et fiabilité éprouvées
- `+` fonctionnalités complètes de gestion des secrets (PKI, identifiants de bases de données, etc.)
- `+` excellente intégration Kubernetes
- `+` le backend S3 simplifie l'infrastructure
- `+` courbe d'apprentissage plus raide, mais meilleur investissement à long terme
- `-` installation et configuration initiales plus complexes
- `-` demande davantage d'expertise opérationnelle
- `-` **des fonctionnalités comme le déverrouillage automatique PKCS#11 sont réservées à l'édition Enterprise**

### Option 3 : OpenBao

> **Statut : ACCEPTÉE**

Fork communautaire et open source de HashiCorp Vault.

- `+` fork de Vault, il conserve la compatibilité d'API.
- `+` il inclut dans son offre open source des fonctionnalités clés (comme le déverrouillage automatique PKCS#11) de
  l'édition Enterprise de Vault.
- `+` il permet un déploiement auto-hébergé de haute sécurité, sans coût de licence.
- `+` il tire parti du vaste écosystème existant de Vault (clients, bibliothèques, intégrations).
- `+` projet plus récent, sa communauté est plus petite que celle de Vault, mais elle grandit.
- `-` la maintenance et le développement à long terme dépendent de la communauté open source.

### Option 4 : AWS Secrets Manager

> **Statut : REJETÉE**

Service géré de gestion des secrets d'AWS.

- `+` entièrement géré, sans charge opérationnelle
- `+` intégration native à AWS
- `-` la dépendance à un cloud externe entre en conflit avec l'exigence d'auto-hébergement
- `-` enfermement chez le fournisseur et coûts de sortie de données potentiels
- `-` préoccupations de conformité et de souveraineté des données

### Option 5 : Conserver SOPS

> **Statut : REJETÉE**

Maintenir l'approche actuelle de secrets chiffrés dans Git.

- `+` aucune migration nécessaire, solution connue
- `+` flux simple, fondé sur Git
- `-` la dépendance critique à Tailscale reste non résolue
- `-` complexité opérationnelle répartie sur plusieurs systèmes
- `-` aucun contrôle d'accès fin ni capacité d'audit
- `-` limites de scalabilité

## Décision retenue

**Option retenue : « OpenBao »**, parce qu'il s'agit d'un fork communautaire et open source de HashiCorp Vault, qui
inclut dans sa version open source des fonctionnalités d'entreprise clés comme le déverrouillage automatique PKCS#11. Le
projet conserve ainsi un niveau de sécurité élevé sans coût de licence. OpenBao maintient la compatibilité d'API avec
Vault, ce qui garantit une transition sans heurt et la poursuite de l'usage de l'écosystème existant (comme
l'ExternalSecret Operator), tout en s'alignant parfaitement sur les principes d'auto-hébergement et de sécurité d'abord
du projet.

---

## Conséquences

### Positives

- Mise en œuvre réussie et terminée (2025-06-28).
- Intégration OIDC avec Authelia pour une authentification centralisée (configuration en attente).
- Solution de référence de l'industrie, avec une documentation et une communauté étendues.
- Scalabilité éprouvée et fonctionnalités de niveau entreprise en open source.
- Backend PostgreSQL avec CloudNativePG pour une persistance robuste des données et leur sauvegarde.
- Capacités de déverrouillage automatique (via PKCS#11/SoftHSM) pour une meilleure sécurité opérationnelle.
- Intégration complète de l'ExternalSecret Operator pour une distribution fluide des secrets.

### Négatives

- Courbe d'apprentissage plus raide que l'interface conviviale d'Infisical.
- Configuration initiale et maintenance plus complexes.
- Redémarrage de l'infrastructure nécessaire (le travail précédent sur Infisical et sur Vault doit être remplacé).
- Temps d'investissement supplémentaire dû à un nouveau changement de technologie.

---

## Détails de mise en œuvre et état

### État de la mise en œuvre

**Composants terminés** :

- **Déploiement d'OpenBao** avec le chart Helm et une image personnalisée compatible SoftHSM.
- **Backend PostgreSQL** avec CloudNativePG et des sauvegardes automatisées vers S3.
- **Configuration du déverrouillage automatique** via des jetons PKCS#11/SoftHSM.
- **Intégration de l'ExternalSecret Operator** avec le RBAC et le SecretStore appropriés.
- **Configuration réseau** avec un ingress Tailscale et une HTTPRoute pour l'accès externe.
- **Procédures de sauvegarde et de reprise après sinistre** avec des sauvegardes CNPG vers S3.

> [!NOTE]\
> Note du 2026-10-11 : sur `rhodes.akn`, `projects/rhodes.akn/src/apps/vault/kustomization.yaml` indique « no Tailscale
> for now » (pas d'ingress Tailscale) ; l'accès passe par la HTTPRoute `main.httproute.yaml`. Les sauvegardes CNPG
> ciblent `s3://cnpg-rhodes-akn/openbao` (`cnpg.objectstore.yaml`).

**Configuration en attente** (liste telle qu'écrite à l'origine ; l'écart avec le dépôt est détaillé ci-dessous) :

- Intégration de l'**authentification OIDC** avec Authelia (infrastructure prête).
- **Audit de sécurité** des configurations NetworkPolicy et RBAC.
- **Migration des secrets** de SOPS vers OpenBao.
- Tests d'**intégration d'une application pilote**.

**Écarts constatés le 2026-10-11, preuves dans le dépôt** :

- OIDC : le backend d'authentification OIDC d'OpenBao existe, avec Pocket-Id comme fournisseur et non Authelia
  (`projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`, section « Pocket-ID SSO auth backend (OIDC) »).
- Migration des secrets : `ExternalSecret` et `SecretStore` consomment OpenBao dans `projects/rhodes.akn/src/` (par
  exemple `argocd/oidc-credentials.externalsecret.yaml`) et dans `projects/lungmen.akn/src/` (par exemple
  `infrastructure/kubernetes/external-dns/unifi.externalsecret.yaml`). SOPS reste utilisé pour les secrets qui doivent
  rester dans Git, comme `projects/rhodes.akn/src/apps/vault/sops/softhsm-tokens.secret.yaml`.
- NetworkPolicy : des `CiliumNetworkPolicy` dédiées à OpenBao existent sous `projects/rhodes.akn/dist/apps/vault/` (par
  exemple `allow-openbao-to-pocket-id`).
- Non vérifiables depuis le dépôt : l'audit de sécurité et l'intégration de l'application pilote.

### Plus d'informations

### Architecture de mise en œuvre (OpenBao), telle que mise en œuvre

```text
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Developers    │    │   OpenBao UI     │    │  Applications   │
│   (OIDC/SSO)    │───▶│   (Web/API)      │    │  (via ESO)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   OpenBao        │◀───│ ExternalSecret  │
                       │   StatefulSet    │    │ Operator        │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  PostgreSQL+CNPG │    │  Auto-Unseal    │
                       │ (Primary Storage)│    │ (PKCS#11/HSM)   │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   S3 Backups     │
                       │ (Disaster Recov.)│
                       └──────────────────┘
```

**Détails clés de la mise en œuvre** :

- **Image OpenBao personnalisée** : `ghcr.io/chezmoidotsh/flakes/openbao/openbao-softhsm` (toujours référencée dans
  `projects/rhodes.akn/src/apps/vault/kustomization.yaml`, sources Nix dans `catalog/flakes/openbao/`).
- **Stockage** : PostgreSQL avec l'opérateur CloudNativePG pour la haute disponibilité et les sauvegardes automatisées.
- **Déverrouillage automatique** : intégration PKCS#11 de SoftHSM v2 avec un stockage de jetons chiffré.
- **Réseau** : double accès via Tailscale (interne) et HTTPRoute (externe).
- **Intégration ESO** : ServiceAccount dédié avec des permissions RBAC minimales.

### Leçons tirées de l'évolution de la décision

Enseignements clés :

- Toujours vérifier tôt la frontière entre fonctionnalités Enterprise et open source, surtout pour des capacités
  opérationnelles critiques comme l'OIDC et le déverrouillage automatique.
- Tester les intégrations critiques (comme l'OIDC) avant le déploiement complet de l'infrastructure.
- Documenter l'évolution de la décision pour éclairer les futures décisions d'architecture.
- Privilégier la maturité de l'écosystème à long terme plutôt que la facilité de déploiement à court terme.

Acquis réutilisables de la mise en œuvre d'Infisical :

- Les motifs de sécurité NetworkPolicy.
- Les méthodologies de test de sauvegarde et de restauration.
- Les approches de planification de la reprise après sinistre.
- L'automatisation de l'infrastructure avec Kustomize/Helm.

---

## Évolution de la décision

Cet ADR documente l'évolution du processus de décision. La mise en œuvre initiale avec Infisical a réussi sur le plan
technique, mais la découverte de limites de licence sur des fonctionnalités critiques a imposé un pivot stratégique. Un
problème similaire, la licence Enterprise de HashiCorp Vault pour le déverrouillage automatique PKCS#11, a conduit à
adopter OpenBao afin que l'architecture réponde à toutes les exigences de sécurité et d'exploitation sans compromis.
Cette évolution illustre l'intérêt de documenter les décisions d'architecture et de savoir s'adapter quand de nouvelles
informations apparaissent.

- **2025-01-20** : Décision initiale — « Infisical », parce qu'il offrait une interface moderne, des capacités
  d'auto-hébergement et un support OIDC apparent dans la version open source.
  - Phase 1 terminée : déploiement de l'infrastructure avec PostgreSQL, Redis et NetworkPolicy.
  - Documentation complète et procédures de reprise après sinistre.
  - Scripts de test de sauvegarde et de restauration.
- **2025-01-23** : Décision révisée — « HashiCorp Vault ». **Remplacée** : pendant la mise en œuvre, il est apparu que
  le **SSO OIDC est une fonctionnalité réservée à l'édition Enterprise** d'Infisical, ce qui casse fondamentalement
  l'architecture d'intégration avec Authelia. Nouvelle option retenue : « HashiCorp Vault », parce que :
  - l'OIDC/SSO est disponible dans la version open source ;
  - c'est la référence de l'industrie, avec un support d'écosystème étendu ;
  - sa viabilité à long terme et le soutien de sa communauté sont meilleurs ;
  - ses capacités de gestion des secrets sont plus robustes ;
  - son intégration avec Kubernetes et l'ExternalSecret Operator a fait ses preuves.
- **2025-01-24** : Décision révisée — « OpenBao ». **Remplacée** : pendant la mise en œuvre, il est apparu que le
  **déverrouillage automatique PKCS#11 est une fonctionnalité réservée à l'édition Enterprise** de HashiCorp Vault.
  Cette capacité est critique pour le niveau de sécurité visé, car elle évite de stocker les clés de déverrouillage
  directement dans le cluster Kubernetes. Nouvelle option retenue : « OpenBao », parce que :
  - c'est un fork communautaire et open source de HashiCorp Vault ;
  - il inclut dans sa version open source des fonctionnalités d'entreprise clés de Vault, comme le **déverrouillage
    automatique PKCS#11** ;
  - il maintient la compatibilité d'API avec Vault, ce qui permet une transition sans heurt et l'usage de l'écosystème
    existant (comme l'ExternalSecret Operator) ;
  - il s'aligne parfaitement sur les principes d'auto-hébergement et de sécurité d'abord du projet, sans coût de licence
    pour les fonctionnalités essentielles.

---

## Historique des modifications

- _2026-10-11_ : **CHORE** : migration vers le standard de documentation en français (gabarit 2.0.0, sommaire manuel
  supprimé, sections renommées, sections « Pour aller plus loin » et « Évolution de la décision » reconstituées à partir
  de l'ancien contenu). Aucun changement de `status` ni de `date` : `implemented` reste cohérent avec le dépôt
  (`projects/rhodes.akn/src/apps/vault/` déploie OpenBao). Notes datées ajoutées sur `amiya.akn` (supprimé par
  `3eb24cc9`, 2026-08-09), sur Authelia (remplacé par Pocket-Id, `vault.ts`) et sur l'absence d'ingress Tailscale pour
  OpenBao sur `rhodes.akn`. Liste « Configuration en attente » conservée et complétée par les écarts constatés.
- _2026-05-24_ : **CHORE** : renommage de `consulted` en `assisted-by` dans le front matter ; suppression du préfixe
  `ai/` dans les identifiants de modèles.
- _2026-03-19_ : **CHORE** : migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.
- _2025-06-28_ : **IMPLEMENTATION** : mise en œuvre terminée avec succès.
- _2025-01-24_ : décision initiale finalisée avec OpenBao.

---

## Pour aller plus loin

- [ADR-002 Topologie des secrets OpenBao](./ADR-002-Topologie-des-Secrets-OpenBao.md) : organisation des montages et des
  espaces de secrets dans OpenBao, décision qui prolonge celle-ci.
- [Restaurer OpenBao](../guides/Restaurer-OpenBao.md) : reprise après sinistre d'OpenBao.
- [Documentation de HashiCorp Vault](https://developer.hashicorp.com/vault) : référence de l'API dont OpenBao est le
  fork.
- [Intégration de Vault à Kubernetes](https://developer.hashicorp.com/vault/docs/platform/k8s) : modes d'intégration à
  Kubernetes.
- [ExternalSecret Operator, fournisseur Vault](https://external-secrets.io/latest/provider/hashicorp-vault/) : lecture
  des secrets depuis Vault/OpenBao.
- [Projet OpenBao](https://openbao.org/) : site du projet retenu.
- [Contexte d'origine, issue #318](https://github.com/chezmoidotsh/arcane/issues/318) : discussion à l'origine de la
  décision.
- [Documentation du gabarit MADR](https://adr.github.io/madr/) : format dont s'inspire l'ADR.
