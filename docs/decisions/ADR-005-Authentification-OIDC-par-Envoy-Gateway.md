---
status: "deprecated"
date: 2026-10-11
implementation-completed: 2026-03-19
decision-makers: ["Alexandre"]
assisted-by: ["claude-4-sonnet", "gpt-5"]
informed: []
template-version: "2.0.0"
---

# ADR-005 Authentification OIDC par Envoy Gateway

> [!WARNING]\
> Migré le 2026-10-11 ; les affirmations sur l'état des clusters n'ont pas été revérifiées.

> [!CAUTION]\
> **Décision dépréciée le 2026-10-11.** Le dépôt contredit l'état `implemented` : aucune `SecurityPolicy` ni ressource
> Envoy Gateway n'existe dans `projects/*/src` (`grep -rl SecurityPolicy projects` ne renvoie aucun fichier), toutes les
> `Gateway` utilisent `gatewayClassName: cilium`, et Authelia n'est plus déployé : Pocket-Id est l'unique fournisseur
> d'identité (commentaire de `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts` : « rhodes.akn doesn't run
> Authelia — Pocket-Id is the SSO »). Le cluster `amiya.akn` cité plus bas n'existe plus dans `projects/`. Aucun filtre
> OIDC n'est posé au niveau de la passerelle : chaque application authentifie elle-même ses utilisateurs. Aucun ADR de
> remplacement n'existe à ce jour. Le texte ci-dessous est conservé tel que décidé. Voir
> [l'archive de la procédure associée](../archives/SEC-20250808-00-Ajouter-une-SecurityPolicy-OIDC-sur-une-HTTPRoute.md).

## Contexte et problème

Le projet d'infrastructure Arcane nécessite une authentification sécurisée pour les applications déployées dans les
clusters Kubernetes. Avec Envoy Gateway comme contrôleur de passerelle principal et Authelia comme fournisseur
d'authentification centralisé, il faut déterminer le meilleur modèle d'intégration pour sécuriser les points d'accès des
applications.

### Contexte de l'infrastructure actuelle

L'infrastructure d'authentification se compose de :

- **Envoy Gateway** : contrôleur d'ingress natif Kubernetes, doté d'une gestion avancée du trafic
- **Authelia** : serveur d'authentification et d'autorisation auto-hébergé, capable de jouer le rôle de fournisseur OIDC

### Le défi d'intégration

Envoy Gateway propose deux mécanismes principaux pour s'intégrer à des fournisseurs d'authentification externes, qui
peuvent s'appliquer par route ou au niveau de la passerelle :

1. **External Authorization (ext-authz)** : déléguer la décision d'authentification à un service externe
2. **Authentification OIDC** : flux OIDC/OAuth2 natif avec validation de jeton JWT

Le défi consiste à choisir l'approche qui offre le meilleur équilibre entre sécurité, simplicité d'exploitation et
fiabilité, dans le cadre des contraintes de l'infrastructure.

> [!WARNING]\
> Lors des essais d'implémentation avec ext-authz, plusieurs problèmes pratiques sont apparus, comme des barres obliques
> finales en trop ou manquantes entre le `extAuth.http.path` d'Envoy Gateway et le point d'accès forward-auth
> d'Authelia, qui provoquaient des réponses 400 ou 500 sporadiques. Faute de temps pour déboguer le problème et sans
> volonté d'y consacrer davantage de temps, la décision a été d'évaluer OIDC comme alternative plus simple et fondée sur
> des standards.

## Facteurs de décision

### Exigences techniques

- **Authentification fiable** : un comportement d'authentification cohérent et prévisible
- **Simplicité d'intégration** : un minimum de pièces mobiles et de complexité de configuration
- **Capacité de débogage** : une visibilité claire sur le flux d'authentification et ses échecs

### Exigences opérationnelles

- **Gestion de la configuration** : un processus fluide pour ajouter de nouvelles applications protégées
- **Charge de maintenance** : une complexité d'exploitation courante minimale
- **Documentation** : des procédures et des guides de dépannage clairs

### Contraintes

- **Infrastructure existante** : la solution doit fonctionner avec le déploiement actuel d'Envoy Gateway et d'Authelia
- **Auto-hébergement** : aucune dépendance à des services d'authentification externes dans le cloud

## Options envisagées

### Option 1 : modèle External Authorization (ext-authz)

> **Statut : REJETÉE**

Transférer les décisions d'authentification à Authelia par le mécanisme d'autorisation externe d'Envoy.

> [!NOTE]\
> Cette approche ressemble beaucoup au mécanisme ForwardAuth de Traefik et pourrait être un choix pertinent.

- `+` **Prise en charge native d'Envoy** : fonctionnalité native d'Envoy, avec un large écosystème et une stabilité
  éprouvée
- `+` **Logique d'authentification centralisée** : toutes les décisions d'authentification sont prises par Authelia,
  avec une application cohérente des politiques
- `+` **Simplicité de configuration** : mise en place minimale, avec une configuration YAML directe et la documentation
  du site d'Authelia
- `-` **Difficultés de débogage** : visibilité limitée sur les échecs du flux d'authentification
- `-` **Problèmes de mise en œuvre** : impossible d'obtenir un fonctionnement fiable malgré de nombreux essais de
  configuration

### Option 2 : authentification OIDC avec Envoy Gateway par route

> **Statut : ACCEPTÉE**

Exploiter les capacités natives d'authentification OIDC d'Envoy Gateway, avec Authelia comme fournisseur OIDC, route par
route.

- `+` **Conformité aux standards** : implémentation OIDC/OAuth2 conforme aux RFC
- `+` **Débogage** : flux OIDC clair, avec des réponses d'erreur standard
- `+` **Configuration par route** : bien plus facile à déboguer
- `+` **Déjà testée** : déjà testée et fonctionnelle dans le cluster `amiya.akn`
- `-` **Complexité de gestion des clients** : nécessite l'enregistrement d'un client OIDC pour chaque route

### Option 3 : authentification OIDC avec Envoy Gateway au niveau de la passerelle

> **Statut : REJETÉE**

Mettre en œuvre l'authentification au niveau de la passerelle, avec partage de session entre les applications.

- `+` **Conformité aux standards** : implémentation OIDC/OAuth2 conforme aux RFC
- `+` **Débogage** : flux OIDC clair, avec des réponses d'erreur standard
- `+` **Simplicité** : tous les avantages d'OIDC sans la complexité d'une configuration par route
- `-` **Limite du client partagé** : toutes les applications doivent être protégées par le même client OIDC (pas de
  protection sélective)
- `-` **Pas de protection sélective** : impossible de désactiver l'authentification OIDC pour une application donnée

## Décision retenue

**Option retenue (proposée) : « Authentification OIDC avec Envoy Gateway par route » (option 2)**, parce qu'elle promet
un mécanisme plus direct et conforme aux standards, tout en s'alignant sur les capacités d'exploitation et les exigences
de sécurité. Cette décision reste proposée jusqu'à ce que les critères de validation soient atteints.

### Architecture de mise en œuvre

**Architecture du flux OIDC :**

```text
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Navigateur  │───▶│  Envoy Gateway  │───▶│   Application   │
│             │    │  (client OIDC)  │    │   (protégée)    │
└─────────────┘    └─────────────────┘    └─────────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Authelia   │◀───│ Fournisseur OIDC│    │    OpenBao      │
│ (IdP OIDC)  │    │   (découverte)  │    │(secrets clients)│
└─────────────┘    └─────────────────┘    └─────────────────┘
```

**Intégration de la gestion des secrets :**

- **Enregistrement des clients** : les clients OIDC sont stockés dans OpenBao selon la convention de chemin
  `/{cluster}/{app}/auth/oidc-client`
- **Distribution des secrets** : External Secrets Operator récupère les secrets des clients pour la configuration des
  `SecurityPolicy`
- **Configuration d'Authelia** : les définitions de clients sont importées depuis OpenBao par une configuration
  templatée

---

## Conséquences

### Positives

- (+) **Fiabilité** : implémentation OIDC conforme aux standards, au comportement prévisible
- (+) **Sécurité** : authentification fondée sur JWT, avec validation et périmètres configurables
- (+) **Débogage** : flux d'erreur OIDC standard, avec une journalisation complète
- (+) **Intégration** : intégration fluide avec la gestion des secrets existante dans OpenBao
- (+) **Évolutivité** : ajout facile de nouvelles applications en suivant des modèles établis
- (+) **Automatisation par CLI** : la complexité de configuration est masquée derrière un outillage

### Négatives

- (-) **Prolifération des clients** : chaque application requiert l'enregistrement d'un client OIDC dédié
- (-) **Complexité des secrets** : davantage de secrets à gérer qu'avec une approche à session partagée
- (-) **Gestion des callbacks** : la configuration de l'URI de redirection est requise pour chaque application

### Neutres

- (\~) **Atténuation des risques** : l'infrastructure OpenBao existante sert à manipuler les secrets des clients en
  sécurité
- (\~) **Documentation** : des procédures complètes pour la création de points d'accès OIDC et le dépannage
- (\~) **Confirmation** : cette décision est passée de « proposed » à « accepted », puis a été marquée « implemented »
  après avoir satisfait des critères précis de fonctionnement, d'exploitabilité et d'observabilité.

---

## Détails de mise en œuvre et état

### Phase 1 : fondations de l'infrastructure OIDC

1. **Configuration OIDC d'Authelia** : activer et configurer les capacités de fournisseur OIDC
2. **Structure des secrets OpenBao** : organiser les secrets des clients OIDC selon l'ADR-003
3. **Modèles ExternalSecret** : configurer les modèles de distribution des secrets pour les `SecurityPolicy`

### Phase 2 : intégration des applications

1. **Application pilote** : mettre en œuvre OIDC pour Longhorn comme preuve de concept
2. **Modèles de SecurityPolicy** : créer des configurations `SecurityPolicy` réutilisables
3. **Procédures de validation** : tester le flux d'authentification et la gestion des erreurs

### Phase 3 : automatisation et passage à l'échelle

1. **Migration en masse** : convertir les applications existantes qui utilisent l'ancien mécanisme `ForwardAuth` de
   Traefik vers le nouvel OIDC

### Risques et atténuations

- **Indisponibilité de l'IdP (Authelia hors service)** : servir une page de maintenance explicite pour les routes
  protégées ; garder les routes publiques séparées des politiques OIDC
- **URI de redirection mal configurées** : imposer une validation stricte des URI de redirection par une documentation
  adaptée
- **CSRF et rejeu de jeton** : s'assurer que `state` et `nonce` sont activés et validés par le fournisseur ; privilégier
  des durées de vie de jeton courtes
- **Exposition des jetons** : limiter `forwardAccessToken` aux cas où l'application en amont l'exige ; restreindre au
  minimum le périmètre des jetons
- **Clients publics (SPA)** : utiliser PKCE et éviter de stocker des secrets côté client ; marquer les clients
  `public: true` dans Authelia le cas échéant
- **Fuite de secrets entre projets** : stocker les identifiants des clients sous `/{cluster}/{app}/auth/oidc-client` et
  appliquer les politiques selon l'ADR-004

---

## Évolution de la décision

- **2025-07-05** : Décision initiale — authentification OIDC avec Envoy Gateway par route (proposée), parce qu'elle
  promet un mécanisme plus direct et conforme aux standards, tout en s'alignant sur les capacités d'exploitation et les
  exigences de sécurité.
- **2026-10-11** : Décision dépréciée. Envoy Gateway n'est plus déployé : aucune ressource `gateway.envoyproxy.io` ni
  `SecurityPolicy` dans `projects/`, et toutes les `Gateway` utilisent `gatewayClassName: cilium`. Les applications
  authentifient elles-mêmes leurs utilisateurs auprès de Pocket-Id. Aucun ADR ne remplace celui-ci.

---

## Historique des modifications

- _2026-10-11_ : **DEPRECATION** : Passage de `status` de `implemented` à `deprecated`. Le dépôt prouve que la décision
  n'est plus appliquée : aucune `SecurityPolicy` dans `projects/*/src`, toutes les `Gateway` en
  `gatewayClassName: cilium`, Authelia remplacé par Pocket-Id (unique fournisseur d'identité), chaque application gérant
  sa propre authentification. Aucun ADR de remplacement n'existe. Ajout de la note `> [!CAUTION]` en tête et mise à jour
  de `date`.
- _2026-10-11_ : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections renommées,
  sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, statuts explicites
  ajoutés aux options 1 et 3 d'après le texte de la décision, `template-version` ajouté. Décision, options, chronologie
  et dates inchangées.
- _2026-05-24_ : **CHORE** : Renommage de `consulted` en `assisted-by` dans le front matter ; suppression du préfixe
  `ai/` des identifiants de modèles.
- _2026-03-19_ : **CHORE** : Migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.
- _2025-07-05_ : **INITIALISATION** : Création du document d'ADR pour la mise en œuvre de l'authentification OIDC.

---

## Pour aller plus loin

- [ADR-001 Gestion centralisée des secrets](./ADR-001-Gestion-Centralisee-des-Secrets.md) : la gestion centralisée des
  secrets dans OpenBao.
- [ADR-003 Conventions de nommage des chemins OpenBao](./ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) : la
  convention de chemin des clients OIDC.
- [ADR-004 Conventions de nommage des politiques OpenBao](./ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md) :
  les politiques appliquées aux identifiants des clients.
- [Archive SEC-20250808-00](../archives/SEC-20250808-00-Ajouter-une-SecurityPolicy-OIDC-sur-une-HTTPRoute.md) : la
  procédure archivée qui appliquait cette décision.
- [Envoy Gateway SecurityPolicy](https://gateway.envoyproxy.io/latest/api/extension_types/#securitypolicy) : la
  documentation technique de la ressource.
- [Authelia OIDC Provider](https://www.authelia.com/configuration/identity-providers/openid-connect/) : la configuration
  du fournisseur OIDC d'Authelia.
- [RFC 6749 : OAuth 2.0](https://tools.ietf.org/html/rfc6749) et
  [RFC 6750 : Bearer Token Usage](https://tools.ietf.org/html/rfc6750) : les standards de référence.
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) : le cadre de référence en cybersécurité.
- [OAuth2 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics) : les bonnes pratiques
  de sécurité d'OAuth 2.0.
- [OWASP Authentication Cheat Sheet](https://owasp.org/www-project-cheat-sheets/cheatsheets/Authentication_Cheat_Sheet.html)
  : les bonnes pratiques d'authentification.
