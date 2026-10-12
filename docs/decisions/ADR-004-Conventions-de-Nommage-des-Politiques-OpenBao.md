---
status: "implemented"
date: 2026-05-24
implementation-completed: 2026-03-19
decision-makers: ["Alexandre"]
assisted-by: ["cursor-auto", "openai-gpt-4o-mini"]
informed: []
template-version: "2.0.0"
---

# ADR-004 Conventions de nommage des politiques OpenBao

Migré le 2026-10-11 ; les affirmations sur l'état des clusters n'ont pas été revérifiées.

Titre d'origine : « OpenBao Policy Naming and Scope Conventions ».

## Contexte et problème

Après la mise en place de la topologie des montages de secrets OpenBao
([ADR-002](ADR-002-Topologie-des-Secrets-OpenBao.md)) et des conventions de nommage des chemins
([ADR-003](ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md)), il faut établir des conventions cohérentes de
nommage et de périmètre pour les politiques. Sans conception standardisée des politiques, le contrôle d'accès devient
incohérent, les frontières de sécurité se brouillent et la complexité opérationnelle augmente.

Le défi consiste à définir des conventions de politiques qui soient :

- **Assez sûres** pour maintenir les principes Zero Trust
- **Assez simples** pour l'exploitation d'un homelab par une seule personne
- **Cohérentes** sur tous les clusters et tous les services
- **Évolutives** à mesure que l'infrastructure grandit

## Facteurs de décision

### Exigences fonctionnelles

- **Contrôle d'accès granulaire** : les politiques doivent donner un accès au moindre privilège à des motifs de chemins
  précis
- **Cohérence entre clusters** : des services similaires sur des clusters différents doivent avoir des structures de
  politiques similaires
- **Clarté opérationnelle** : les noms de politiques doivent indiquer clairement leur objet et leur périmètre
- **Conformité de sécurité** : maintenir les principes Zero Trust avec une isolation correcte

### Exigences non fonctionnelles

- **Sécurité Zero Trust** : imposer l'isolation au niveau du montage et du chemin
- **Simplicité opérationnelle** : minimiser la complexité pour un environnement à opérateur unique
- **Piste d'audit** : des noms de politiques explicites facilitent le suivi des accès
- **Conception évolutive** : permettre la montée en charge sans restructuration majeure

### Contraintes

- **Contexte homelab** : un seul opérateur, aucun besoin de collaboration entre équipes
- **Limites des politiques** : limitées aux capacités du système de modèles de politiques
- **Architecture existante** : doit s'aligner sur la topologie des montages et les conventions de chemins établies
- **Caractères autorisés** : seuls les caractères alphanumériques, les tirets, les points et les tirets bas sont
  autorisés

## Options envisagées

> Note : plusieurs modèles ont été envisagés, mais la solution finale est un hybride pragmatique, adapté à un
> environnement à opérateur unique. Cette approche combine la clarté et la sécurité des politiques par fonction avec
> certains éléments des modèles par service et par rôle, afin de maximiser la simplicité opérationnelle et de maintenir
> des frontières de moindre privilège.

### Option 1 : une seule politique par cluster

> **Statut : REJETÉE**

- `+` Simple, nombre de politiques minimal
- `-` Accès trop large, viole le moindre privilège, difficile à auditer

### Option 2 : politiques par service

> **Statut : ACCEPTÉE (dans l'hybride)**

- `+` Frontières de service claires
- `-` Gère mal les secrets partagés, dépendances croisées complexes

### Option 3 : politiques par fonction

> **Statut : ACCEPTÉE (modèle central)**

- `+` Regroupement logique, gère bien les ressources partagées
- `-` Demande une définition rigoureuse du périmètre

### Option 4 : politiques par rôle

> **Statut : ACCEPTÉE (dans l'hybride)**

- `+` Frontières opérationnelles claires
- `-` S'aligne mal avec les frontières applicatives

## Décision retenue

> La solution retenue s'inspire principalement de l'approche par fonction, mais intègre délibérément des aspects des
> modèles par service et par rôle. Cette conception hybride est intentionnelle : elle répond aux besoins propres d'un
> opérateur unique en équilibrant clarté opérationnelle, sécurité et évolutivité future. La matrice de politiques qui en
> résulte est donc un compromis pragmatique, pas l'application stricte d'un seul modèle.

**Option retenue : « conception de politiques par fonction »** avec des familles de politiques précises.

### Matrice des familles de politiques

| Famille de politique   | Format du nom                   | Périmètre de chemins typique                                                                 | Capacités    | Exemple                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| **ESO - cluster**      | `{project-name}-eso-policy`     | `/${project-name}/*`, `/shared/third-parties/+/+/{project-name}/*`, `/shared/certificates/*` | `read`       | `amiya.akn-eso-policy`          |
| **ESO - crossplane**   | `amiya.akn-crossplane-policy`   | `/shared/third-parties/*`                                                                    | `read,write` | `amiya.akn-crossplane-policy`   |
| **ESO - authelia**     | `amiya.akn-authelia-policy`     | `/+/+/auth/*` (accès SSO inter-montages)                                                     | `read`       | `amiya.akn-authelia-policy`     |
| **ESO - cert renewal** | `amiya.akn-cert-renewal-policy` | `/shared/certificates/letsencrypt/*`                                                         | `read,write` | `amiya.akn-cert-renewal-policy` |

> [!NOTE]\
> Note du 2026-10-11 : seule la famille `{project-name}-eso-policy` est encore appliquée. Le composant
> `catalog/pulumi/components/cluster-vault/src/index.ts` crée `${clusterName}-eso-policy` (vérifié aussi par
> `cluster-vault.test.ts`) et nomme toute politique additionnelle `${clusterName}-${policyName}`. Les exemples
> `amiya.akn-*` restent historiques : `projects/amiya.akn/` n'existe plus (cluster migré vers `rhodes.akn`, voir
> [ADR-015](ADR-015-Migrer-Crossplane-vers-Pulumi.md), Crossplane décommissionné) ; aucun `crossplane-policy` ni
> `cert-renewal-policy` n'est défini dans `catalog/` ni `projects/` ; `rhodes.akn` crée `rhodes.akn-eso-policy` via
> `ClusterVaultComponent` (`projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`). Le motif de chemin ESO
> actuel dans le composant est `shared/+/third-parties/+/+/<cluster>` (montage en première position), différent de celui
> du tableau.

### Principes de conception des politiques

1. **Accès au moindre privilège**
   - Chaque politique n'accorde que les capacités minimales requises
   - Les périmètres de chemins sont aussi précis que possible tout en restant pratiques
   - Pas d'accès inter-montages sauf nécessité explicite
2. **Jetons d'administration éphémères**
   - Les actions d'administration utilisent des jetons de courte durée (TTL ≤ 15 minutes)
   - Les jetons non renouvelables empêchent un accès administrateur de longue durée
   - Aucune politique d'administration persistante pour les opérations courantes
3. **Organisation par fonction**
   - Les politiques s'alignent sur les fonctions opérationnelles plutôt que sur les frontières techniques
   - Les ressources partagées ont des politiques dédiées à leurs usages spécifiques
   - Séparation claire entre l'accès en lecture seule (ESO) et en lecture-écriture (Crossplane, Cert-Renewal)
4. **Nommage cohérent**
   - Toutes les politiques suivent le motif `{project-name}-{function}-policy`
   - Les jetons d'administration suivent le motif `{project-name}-admin-ephemeral`
   - Les noms indiquent clairement l'objet et le périmètre
5. **Politiques d'exception**
   - `amiya.akn-authelia-policy` est une politique inter-montages spéciale qui permet à Authelia de lire les
     identifiants SSO de tous les montages de projets.

> [!NOTE]\
> Note du 2026-10-11 : Authelia n'est plus déployé ; Pocket-Id est le seul fournisseur d'identité. Le commentaire de
> `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts` (lignes 28 à 33) confirme que l'équivalent de
> `amiya.akn-authelia-policy` n'est pas porté sur `rhodes.akn`. Le motif `{project-name}-{function}-policy` n'est pas
> appliqué partout : le composant nomme les politiques additionnelles `${clusterName}-${policyName}` (sans suffixe
> `-policy` ajouté), et `rhodes.akn` crée aussi des politiques hors convention (`sso-admin-policy`,
> `personal-admin-access`, `personal-user-access`) pour l'authentification OIDC Pocket-Id. Aucun jeton
> `{project-name}-admin-ephemeral` n'apparaît dans le dépôt.

### Définition des capacités

- **Lecture seule (`read`)**
  - `read` : accès aux données et aux métadonnées des secrets
  - Utilisé par External Secrets Operator pour la synchronisation des secrets
  - Aucune capacité de modification
- **Lecture-écriture (`read,write`)**
  - `read,write` : opérations CRUD complètes sur les secrets
  - Utilisé par Crossplane pour la gestion des ressources
  - Utilisé par Cert-Manager pour le renouvellement des certificats
- **Accès administratif (`sudo`)**
  - `sudo` : accès complet au système, y compris la gestion des politiques
  - Limité à des jetons éphémères à TTL court
  - Non renouvelable pour empêcher un accès administrateur de longue durée

---

## Conséquences

### Positives

- (+) **Conformité de sécurité** : maintient les principes Zero Trust avec une isolation correcte
- (+) **Clarté opérationnelle** : objets et périmètres des politiques explicites
- (+) **Piste d'audit** : les noms de politiques indiquent clairement les motifs d'accès
- (+) **Évolutivité** : ajout facile de nouveaux clusters ou de nouvelles fonctions
- (+) **Moindre privilège** : chaque politique n'accorde que l'accès nécessaire
- (+) **Sécurité du SSO** : élimine la vulnérabilité liée au montage SSO partagé

### Négatives

- (-) **Courbe d'apprentissage** : l'opérateur doit comprendre l'objet et le périmètre des politiques
- (-) **Gestion des jetons** : les jetons d'administration éphémères demandent plus de charge opérationnelle
- (-) **Nombre de politiques** : plus de politiques à gérer qu'avec une politique unique
- (-) **Complexité inter-montages** : la politique Authelia rompt les principes d'isolation normale des montages

---

## Détails de mise en œuvre et état

### Stratégie de création des politiques

1. **Politiques propres à chaque cluster** : créer des politiques pour chaque cluster en suivant la matrice
2. **Migration du SSO** : migrer les secrets `/shared/sso/*` existants vers des montages par projet
3. **Politique inter-montages Authelia** : créer une politique inter-montages dédiée à l'accès SSO d'Authelia
4. **Processus des jetons d'administration** : établir le processus de génération des jetons d'administration éphémères
5. **Validation des politiques** : contrôles automatisés de conformité des politiques et de validation des périmètres

### Considérations inter-clusters

- **Architecture SSO et secrets tiers** : modèles d'isolation différents selon les profils de risque
  - **Secrets SSO** : déplacés vers des montages par projet à cause des risques d'usurpation d'identité (le
    `client_secret` permet l'usurpation)
  - **Secrets tiers** : restent dans le montage partagé mais limités au projet
    (`/shared/third-parties/+/+/{project-name}/*`), parce que :
    - Plusieurs applications d'un même projet partagent légitimement des identifiants cloud (par exemple les
      informations S3)
    - Le profil de risque diffère : facturation et accès aux ressources contre usurpation d'identité
    - L'accès limité au projet maintient l'isolation entre projets tout en permettant le partage au sein d'un projet
- **Cohérence** : des services similaires sur des clusters différents doivent avoir des structures de politiques
  similaires
- **Isolation** : garantir que les politiques propres à un cluster n'accordent pas par accident d'accès inter-clusters
- **Compromis de sécurité** : accepter un accès inter-montages contrôlé pour Authelia afin de maintenir un SSO
  centralisé

### Surveillance et conformité

- **Surveillance des accès** : suivre l'usage des politiques et les motifs d'accès
- **Validation des politiques** : contrôles automatisés de conformité des politiques
- **Revues d'audit** : revue régulière des périmètres et des capacités des politiques

---

## Évolution de la décision

### Justification

- **Pourquoi une conception de politiques par fonction**
  - **Clarté opérationnelle** : les politiques s'alignent sur l'usage réel des secrets (synchronisation ESO, gestion par
    Crossplane, renouvellement des certificats)
  - **Frontières de sécurité** : séparation claire entre consommateurs en lecture seule et gestionnaires en
    lecture-écriture
  - **Gestion des ressources partagées** : politiques dédiées aux secrets partagés sans rompre l'isolation
  - **Évolutivité** : ajout facile de nouvelles fonctions sans restructurer les politiques existantes
- **Pourquoi des jetons d'administration éphémères**
  - **Sécurité** : empêche un accès administrateur de longue durée qui pourrait être compromis
  - **Piste d'audit** : des jetons de courte durée créent des frontières d'audit claires
  - **Discipline opérationnelle** : impose des actions d'administration explicites plutôt qu'un accès administrateur
    persistant
  - **Conformité Zero Trust** : s'aligne sur le principe « ne jamais faire confiance, toujours vérifier »
- **Pourquoi cette matrice de politiques**
  - **Couverture** : traite tous les cas d'usage actuels (ESO partagé et cluster, SSO/Authelia, Crossplane,
    renouvellement des certificats, administration)
  - **Cohérence** : motifs similaires sur tous les clusters
  - **Simplicité** : seulement 6 types de politiques à gérer (3 par cluster)
  - **Sécurité** : secrets SSO isolés par projet tout en conservant l'accès aux ressources partagées
  - **Flexibilité** : extension facile pour de nouvelles fonctions ou exigences

> [!NOTE]\
> Note du 2026-10-11 : la décision n'a pas été révisée par un nouvel ADR. L'écart avec le dépôt (une seule famille
> encore appliquée, Authelia et Crossplane disparus) est décrit dans les notes ci-dessus ; seule l'historique de l'ADR
> est conservé tel quel.

---

## Historique des modifications

- _2026-10-11_ : migration vers le standard de documentation (issue #1257) : traduction en français, gabarit v2.0.0
  (`template-version` passe à "2.0.0"), suppression du sommaire manuel, titres `####` remplacés par des listes, statuts
  d'options sans emoji. Décision, options, verdicts et front matter (dont `status` et `date`) inchangés. Écarts relevés
  contre le dépôt : voir les notes datées du 2026-10-11. Les 12 mentions d'Authelia et les 13 mentions d'`amiya.akn`
  sont conservées comme exemples historiques. Aucun état de cluster ou d'OpenBao n'a été revérifié.
- _2026-05-24_ : **CHORE** : renommage de `consulted` en `assisted-by` dans le front matter ; suppression du préfixe
  `ai/` des identifiants de modèles.
- _2026-03-19_ : **CHORE** : migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.
- _2025-07-05_ : **DEPRECATION** : `*-crossplane-policy` est remplacée par `amiya.akn-crossplane-policy`, Crossplane ne
  tournant que dans le cluster `amiya.akn`.
- _2025-07-05_ : **DEPRECATION** : intégration de `global-eso-policy` dans `{project-name}-eso-policy`, car c'est bien
  plus simple à gérer ainsi.
- _2025-07-01_ : **CLARIFICATION** : seuls 3 des 6 types de politiques sont instanciés par cluster.
- _2025-07-01_ : **CLARIFICATION** : `global-eso-policy` est partagée entre tous les clusters.
- _2025-07-01_ : **CLARIFICATION** : `amiya.akn-authelia-policy` et `amiya.akn-cert-renewal-policy` sont propres au
  projet.
- _2025-07-01_ : **SECURITY** : restriction du périmètre de `global-eso-policy` pour exclure `/shared/sso/*` et
  migration des secrets SSO vers une isolation par projet. Ajout de `amiya.akn-authelia-policy` pour l'accès SSO
  inter-montages légitime. Ce changement corrige une vulnérabilité de sécurité où n'importe quel cluster pouvait accéder
  aux identifiants OIDC `client_secret` des autres clusters, permettant potentiellement des attaques d'usurpation
  d'identité, tout en maintenant l'accès partagé aux ressources partagées légitimes (certificats, secrets tiers).

---

## Pour aller plus loin

- [ADR-002 : topologie des secrets OpenBao](ADR-002-Topologie-des-Secrets-OpenBao.md) : montages et isolation sur
  lesquels reposent ces politiques
- [ADR-003 : conventions de nommage des chemins OpenBao](ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) : motifs
  de chemins utilisés dans les périmètres des politiques
- [ADR-015 : migration de Crossplane vers Pulumi](ADR-015-Migrer-Crossplane-vers-Pulumi.md) : décommissionnement de
  Crossplane et d'`amiya.akn`
- [Politiques OpenBao](https://openbao.org/docs/concepts/policies/) : documentation officielle

<!-- trunk-ignore-begin(markdown-link-check/403): some link can be behind a paywall -->

- [Bonnes pratiques de politiques HashiCorp Vault](https://developer.hashicorp.com/vault/docs/concepts/policies) :
  référence de sécurité
- [Modèle de sécurité HashiCorp Vault](https://developer.hashicorp.com/vault/docs/internals/security) : référence de
  sécurité
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) : cadre de sécurité
- [Principe du moindre privilège](https://csrc.nist.gov/glossary/term/least_privilege) : définition NIST
- [Scaling HashiCorp Vault - Policy Sprawl Part 1](https://sunil-tailor.medium.com/scaling-hashicorp-vault-policy-sprawl-part-1-1b0f599b6eae)
  : prolifération des politiques
- [Bonnes pratiques de gestion des secrets](https://kubernetes.io/docs/concepts/configuration/secret/) : documentation
  Kubernetes

<!-- trunk-ignore-end(markdown-link-check/403) -->
