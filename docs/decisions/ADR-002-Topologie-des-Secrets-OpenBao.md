---
status: "implemented"
date: 2026-05-24
implementation-completed: 2026-03-19
decision-makers: ["Alexandre"]
assisted-by: ["claude-4-sonnet", "chatgpt-4o"]
informed: []
template-version: "2.0.0"
---

# ADR-002 Topologie des secrets OpenBao

> [!WARNING]\
> Migré le 2026-10-11 ; les affirmations sur l'état des clusters n'ont pas été revérifiées.

## Contexte et problème

Après la mise en place réussie d'OpenBao comme solution centralisée de gestion des secrets (documentée dans
[ADR-001](ADR-001-Gestion-Centralisee-des-Secrets.md)), il reste à déterminer la structure d'organisation optimale des
secrets au sein de l'instance OpenBao. Cette décision influe sur l'isolation de sécurité, la complexité opérationnelle
et la scalabilité à long terme.

Le projet d'infrastructure Arcane gère plusieurs clusters et projets indépendants, aux exigences de sécurité et
d'exploitation variées :

- **amiya.akn** : cluster Kubernetes de production principal, avec une pile d'infrastructure complète
- **chezmoi.sh** : projet d'identité de domaine et de services externes, avec des dépendances externes
- **hass** : projet d'infrastructure Home Assistant, avec des intégrations d'appareils IoT
- **maison** : cluster de services et d'applications domestiques, avec des services accessibles à la famille
- **shodan.akn** : cluster de jeux et de divertissement, avec des charges de travail à hautes performances
- **sof.akn** : projet « Spirit of Fire » (futur cluster), pour des charges de travail expérimentales

> [!NOTE]\
> Note du 2026-10-11 : la liste ci-dessus est l'état de l'époque. Le répertoire `projects/` contient aujourd'hui
> `chezmoi.sh`, `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn`, `rimbilliton.akn` et `shodan.akn`. `amiya.akn` a
> été remplacé par `rhodes.akn` comme plateforme centrale (le dossier
> `docs/archives/MIGR-20260729-00-Migrer-Amiya-vers-Rhodes.md` décrit la migration, et
> `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts` mentionne explicitement le remplacement d'`amiya.akn`).
> `maison` n'existe plus comme projet du dépôt : `lungmen.akn` est le cluster d'applications domestiques (`AGENTS.md`),
> sans trace explicite de filiation. Aucune trace de `sof.akn` dans l'arborescence. `shodan.akn` n'est plus un cluster
> de jeux : il est décrit comme la future pile IA, au stade de la planification (`AGENTS.md`).

### Contexte actuel de l'infrastructure

OpenBao est opérationnel, avec la configuration de niveau entreprise suivante :

- **Stockage** : backend PostgreSQL avec CloudNativePG pour la haute disponibilité
- **Sécurité** : déverrouillage automatique via PKCS#11/SoftHSM, avec stockage chiffré des jetons
- **Intégration** : External Secrets Operator pour la distribution des secrets native à Kubernetes
- **Authentification** : intégration OIDC avec Authelia pour le contrôle d'accès centralisé
- **Réseau** : double accès via Tailscale (interne) et HTTPRoute (externe)

### Le défi stratégique

Le défi central est de concevoir une stratégie d'organisation des secrets qui concilie des exigences d'architecture
concurrentes. D'après le
[guide d'architecture de Vault](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure) de
HashiCorp, l'organisation des secrets détermine directement les frontières de sécurité et la charge opérationnelle.

**Exigences de sécurité :**

- Isolation entre projets pour empêcher la fuite d'identifiants
  ([principes du Zero Trust](https://www.nist.gov/publications/zero-trust-architecture))
- Confinement du rayon d'impact des incidents de sécurité
- Contrôle d'accès selon le principe du moindre privilège

**Exigences opérationnelles :**

- Réduire au minimum la charge d'administration quotidienne
- Prendre en charge les secrets d'infrastructure partagés (certificats, API externes)
- Garantir l'autonomie des projets tout en conservant une gouvernance centrale
- Faciliter la rotation et la gestion du cycle de vie des secrets

**Exigences d'intégration :**

- Compatibilité optimale avec les
  [modèles d'External Secrets Operator](https://external-secrets.io/latest/provider/hashicorp-vault/)
- Intégration fluide avec le RBAC de Kubernetes
- Distribution efficace des secrets vers plusieurs clusters

La question stratégique à laquelle cet ADR répond : comment organiser les secrets au sein de l'instance OpenBao pour
isoler les projets sans alourdir l'exploitation ?

## Facteurs de décision

- **Isolation de sécurité** : empêcher les accès non autorisés entre projets et contenir les incidents de sécurité
- **Efficacité opérationnelle** : réduire la charge d'administration tout en maintenant le niveau de sécurité
- **Clarté du contrôle d'accès** : mettre en œuvre un RBAC intuitif, avec des frontières d'audit claires
- **Stratégie des ressources partagées** : gérer efficacement les dépendances entre projets
- **Scalabilité** : accompagner la croissance sans changement d'architecture fondamental
- **Optimisation de l'intégration** : maximiser la compatibilité avec Kubernetes et External Secrets Operator
- **Flexibilité future** : permettre l'évolution vers des modèles avancés le moment venu

## Options envisagées

### Option 1 : un seul montage KV avec organisation par chemins (monolithique)

> **Statut : REJETÉE**

Tous les secrets sont stockés dans un seul moteur KV v2, avec des chemins hiérarchiques suivant le
[modèle à espace de noms unique](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#single-namespace)
:

```text
secrets/
├── projects/
│   ├── amiya-akn/
│   ├── maison/
│   └── ...
└── shared/
```

Justification : approche la plus simple, avec une organisation unifiée des secrets, couramment utilisée dans les petits
déploiements.

- `+` Mise en place et configuration initiales les plus simples
- `+` Point unique de gestion pour tous les secrets
- `+` Aucune préoccupation sur le nombre de montages
- `+` Organisation unifiée des secrets
- `-` **Rayon d'impact élevé** : une seule erreur peut toucher tous les projets
- `-` **Gestion complexe des ACL** : les permissions par chemin sont difficiles à auditer et à maintenir
- `-` **Mauvaise isolation** : un incident de sécurité touche tous les projets
- `-` **Difficultés d'intégration** : les
  [modèles d'ESO sont moins efficaces](https://external-secrets.io/latest/provider/hashicorp-vault/#performance-considerations)
  avec un accès par chemins

### Option 2 : plusieurs montages KV par projet + un montage partagé (isolation par montage)

> **Statut : ACCEPTÉE**

Un montage KV v2 dédié par projet, plus un montage partagé centralisé, selon les
[modèles d'isolation par montage](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#use-cases) :

```text
projects-amiya-akn/    (montage KV v2 dédié)
projects-maison/       (montage KV v2 dédié)
shared/                (montage KV v2 centralisé)
```

Justification : isolation au niveau des politiques sans la complexité des espaces de noms, conformément à la
[stratégie multi-montages](https://developer.hashicorp.com/vault/tutorials/policies/policies#policy-syntax) recommandée
par HashiCorp.

- `+` **Sécurité** : l'isolation complète des politiques empêche les accès non autorisés entre projets
- `+` **Clarté opérationnelle** : les frontières par montage offrent un contrôle d'accès et une traçabilité d'audit
  intuitifs
- `+` **Intégration ESO** : compatibilité optimale avec les
  [modèles SecretStore d'External Secrets Operator](https://external-secrets.io/latest/provider/hashicorp-vault/#secretstore)
- `+` **Scalabilité** : modèle de croissance linéaire, avec une automatisation standardisée de création des montages
- `+` **Pérennité** : chemin d'évolution vers les espaces de noms OpenBao pour les scénarios de délégation
- `+` **Conformité** : des frontières d'audit claires soutiennent les exigences réglementaires
- `-` **Dépendance à l'automatisation** : l'Infrastructure-as-Code est nécessaire pour gérer le cycle de vie des
  montages
- `-` **Complexité initiale** : mise en place plus complexe que l'approche à montage unique

### Option 3 : espaces de noms OpenBao avec isolation par montage

> **Statut : REJETÉE**

Les espaces de noms OpenBao sont utilisés pour une isolation maximale, selon les
[modèles d'isolation par espace de noms](https://developer.hashicorp.com/vault/docs/enterprise/namespaces) :

```text
amiya-akn/     (espace de noms dédié)
maison/        (espace de noms dédié)
shared/        (espace de noms racine pour les ressources partagées)
```

Justification : isolation de sécurité maximale avec des capacités d'administration déléguée, adaptée à la multi-location
d'entreprise.

- `+` Isolation maximale, avec séparation complète
- `+` Capacités d'administration déléguée
- `+` Séparation intégrée des traces d'audit
- `+` Excellent pour les scénarios multi-locataires
- `-` **Complexité opérationnelle importante** pour l'échelle actuelle
- `-` **Consommation de ressources plus élevée** :
  [impact sur la mémoire et le temps de déverrouillage](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#performance-standby-nodes)
- `-` **Sur-ingénierie** : complexe pour l'échelle actuelle de 6 projets
- `-` **Complexité inter-espaces de noms** :
  [le partage de secrets exige des modèles complexes](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#cross-namespace-secret-access)

### Option 4 : instances OpenBao fédérées (une instance par projet)

> **Statut : REJETÉE**

Une instance OpenBao distincte est déployée par projet ou cluster, avec réplication pour les secrets partagés.

Justification : indépendance opérationnelle complète, selon les modèles de microservices appliqués au niveau de
l'infrastructure.

- `+` Indépendance opérationnelle complète
- `+` Isolation de sécurité maximale
- `+` Cycles de mise à niveau et de maintenance indépendants
- `-` **Fragmentation opérationnelle** : plusieurs systèmes à sécuriser, sauvegarder et maintenir
- `-` **Synchronisation complexe** :
  [difficultés de partage de secrets entre instances](https://developer.hashicorp.com/vault/docs/enterprise/replication)
- `-` **Surcoût d'infrastructure** : multiplication des ressources sans valeur proportionnelle
- `-` **Consolidation de l'audit** : surveillance de la sécurité et de la conformité fragmentée

### Alternatives écartées

**Pourquoi pas les espaces de noms OpenBao ?** Bien qu'ils offrent une isolation maximale, ils ont été rejetés à cause
du
[compromis entre complexité et valeur](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#when-to-use-namespaces)
:

- **Charge opérationnelle** : la complexité de gestion des espaces de noms dépasse les bénéfices à l'échelle de 6
  projets
- **Impact sur les ressources** :
  [consommation de mémoire et temps de déverrouillage supplémentaires](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#performance-standby-nodes)
- **Exigences actuelles satisfaites** : l'isolation au niveau des montages répond aux exigences de sécurité
- **Flexibilité future conservée** : l'architecture permet une évolution vers les espaces de noms quand l'échelle
  justifiera la complexité

**Pourquoi pas un seul montage KV ?**

- **Sécurité** : le rayon d'impact élevé contredit les
  [principes de défense en profondeur](https://csrc.nist.gov/glossary/term/defense_in_depth)
- **Exploitation** : les ACL par chemin sont difficiles à auditer et à maintenir
- **Efficacité de l'intégration** : l'
  [impact sur les performances d'ESO](https://external-secrets.io/latest/provider/hashicorp-vault/#performance-considerations)
  avec des modèles de chemins complexes

**Pourquoi pas plusieurs instances OpenBao ?**

- **Fragmentation opérationnelle** : plusieurs systèmes contredisent les
  [principes de consolidation de l'infrastructure](https://kubernetes.io/docs/concepts/overview/what-is-kubernetes/)
- **Surcoût de complexité** : la synchronisation entre instances est plus complexe que l'isolation par montage
- **Inefficacité des ressources** : multiplication de l'infrastructure sans bénéfice de sécurité proportionnel

## Décision retenue

**Option retenue : « Plusieurs montages KV par projet + un montage partagé » (option 2)**, parce qu'elle offre le
meilleur équilibre entre isolation de sécurité, simplicité opérationnelle et compatibilité d'intégration, tout en
évitant la complexité supplémentaire des espaces de noms à l'échelle actuelle.

Cette décision s'aligne sur les
[pratiques recommandées par HashiCorp pour les déploiements de taille moyenne](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#when-to-use-namespaces),
où l'isolation au niveau des montages fournit des frontières de sécurité suffisantes sans la charge d'administration des
espaces de noms.

### Architecture de mise en œuvre

Structure des montages telle que décidée :

```text
Instance OpenBao (espace de noms racine)
├── amiya.akn/     (montage KV v2)
├── hass/          (montage KV v2)
├── maison/        (montage KV v2)
├── shodan.akn/    (montage KV v2)
└── shared/        (montage KV v2)
    ├── certificates/       (Let's Encrypt, CA internes)
    ├── third-party/        (jetons GitHub, clés de fournisseurs cloud)
    ├── infrastructure/     (identifiants de supervision et de sauvegarde)
    └── network/            (clés VPN, certificats de maillage de services)
```

> [!NOTE]\
> Note du 2026-10-11 : cette structure est celle décidée à l'origine. Les montages réellement déclarés dans le dépôt
> sont décrits dans « Détails de mise en œuvre et état ».

### Principes de conception clés

D'après les
[bonnes pratiques de sécurité de Vault](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening)
et les [principes du Zero Trust](https://www.nist.gov/publications/zero-trust-architecture) :

- **Isolation au niveau des montages** : chaque projet dispose d'un montage KV v2 dédié pour une séparation complète des
  politiques
- **Nommage cohérent** : le format `{project-name}` assure clarté et automatisation
- **Centralisation des ressources partagées** : un seul montage `shared/`, avec des sous-chemins organisés pour les
  dépendances entre projets
- **Compatibilité future** : la structure permet une évolution vers les espaces de noms si des besoins de délégation
  apparaissent

### Architecture du contrôle d'accès

La stratégie de contrôle d'accès met en œuvre les principes du
[contrôle d'accès par rôles (RBAC)](https://kubernetes.io/docs/reference/access-authn-authz/rbac/), avec une séparation
claire des responsabilités.

**Modèle d'isolation des projets :** chaque montage de projet dispose de politiques dédiées qui empêchent l'accès entre
projets, selon le [principe du moindre privilège](https://csrc.nist.gov/glossary/term/least_privilege).

**Gouvernance des ressources partagées :** administration centralisée des secrets partagés, avec un accès en lecture
seule pour les projets, conformément à la
[séparation des tâches](https://csrc.nist.gov/glossary/term/separation_of_duty).

**Stratégie d'authentification :**

1. **Authentification Kubernetes** : méthode principale pour l'intégration d'External Secrets Operator
2. **Authentification OIDC** : accès humain via Authelia, avec mappage des rôles par groupes
3. **Authentification par jeton** : comptes de service et automatisation, avec des jetons à durée limitée

> [!NOTE]\
> Note du 2026-10-11 : Authelia n'existe plus dans le dépôt. Pocket-Id est le fournisseur d'identité unique
> (`AGENTS.md`) et `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts` déclare le backend d'authentification
> OIDC Pocket-Id d'OpenBao ; le même fichier précise que `rhodes.akn` ne fait pas tourner Authelia. La mention
> d'Authelia dans le contexte actuel ci-dessus reste celle de l'époque de la décision.

## Conséquences

### Positives

- (+) **Isolation de sécurité** : la séparation complète des politiques empêche les accès accidentels entre projets et
  contient les incidents de sécurité ([défense en profondeur](https://csrc.nist.gov/glossary/term/defense_in_depth))
- (+) **Clarté du contrôle d'accès** : les frontières par montage rendent le RBAC intuitif et auditable
- (+) **Résilience opérationnelle** : un problème propre à un montage ne se propage pas aux autres projets
- (+) **Efficacité de l'intégration** : des configurations SecretStore dédiées optimisent les
  [performances d'External Secrets Operator](https://external-secrets.io/latest/provider/hashicorp-vault/#performance-considerations)
- (+) **Scalabilité de la croissance** : mise à l'échelle linéaire grâce à la création standardisée de montages et à des
  modèles de politiques
- (+) **Gouvernance des ressources partagées** : gestion centralisée avec des modèles d'accès contrôlés
- (+) **Évolution de l'architecture** : compatible avec une adoption future des espaces de noms pour les scénarios de
  délégation
- (+) **Préparation à la conformité** : des frontières d'audit claires soutiennent les exigences réglementaires

### Négatives

- (-) **Complexité d'infrastructure** : une automatisation supplémentaire est nécessaire pour gérer le cycle de vie des
  montages
- (-) **Charge de coordination** : les modifications de secrets partagés exigent une communication entre équipes
- (-) **Coût de mise en place initial** : complexité plus élevée que l'approche à montage unique
- (-) **Limites de montages** : contraintes de mise à l'échelle possibles à très grande échelle
  ([plus de 4500 montages par instance](https://developer.hashicorp.com/vault/docs/internals/limits))

### Neutres

- (\~) **Cadre d'automatisation** : Infrastructure-as-Code complète pour une gestion cohérente
- (\~) **Standards de documentation** : procédures opérationnelles claires pour les ressources partagées
- (\~) **Infrastructure de supervision** : alertes proactives sur la santé des montages et les modèles d'accès

## Détails de mise en œuvre et état

La décision est implémentée (`implementation-completed: 2026-03-19`). Vérification faite le 2026-10-11 dans le dépôt
uniquement, sans accès aux clusters :

| Élément                             | Preuve dans le dépôt                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Montage `rhodes.akn/` par cluster   | `ClusterVaultComponent("rhodes.akn")` dans `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`                    |
| Montage `lungmen.akn/` par cluster  | `ClusterVaultComponent("lungmen.akn")` dans `projects/lungmen.akn/src/infrastructure/pulumi/stack/vault.ts`                  |
| Montage partagé `shared/`           | `new vault.Mount("shared", ...)` dans `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts`                         |
| Montage `personal/` (non prévu ici) | `new vault.Mount("personal", ...)` dans le même fichier ; politiques `personal-user-access` et `personal-admin-access`       |
| Automatisation du cycle de vie      | composant `catalog/pulumi/components/cluster-vault/` : montage KV v2 `<nom>/`, backend Kubernetes, politique et rôle ESO     |
| Montages `amiya.akn/`, `maison/`    | aucun appel `ClusterVaultComponent` correspondant dans l'arborescence actuelle ; le montage `amiya.akn/` n'est plus déclaré  |
| Montages `hass/`, `shodan.akn/`     | aucun appel `ClusterVaultComponent` ni `vault.Mount` trouvé pour ces projets dans `projects/` ; état à vérifier côté cluster |

L'écart entre la structure décidée et celle du dépôt est le résultat attendu de l'évolution des clusters, pas d'un
changement de principe : un montage KV v2 par cluster, nommé d'après le cluster, plus un montage `shared/`. Le montage
`personal/` a été ajouté depuis ; il n'est couvert par aucune des décisions de cet ADR. La convention de chemins relève
de [ADR-003](ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) et celle des politiques de
[ADR-004](ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md).

La sauvegarde et la restauration d'OpenBao sont décrites dans le guide
[Restaurer OpenBao](../plan-de-reprise/brouillon/Restaurer-OpenBao.md).

### Évolutions envisagées

Ces pistes figuraient dans l'ADR d'origine et ne sont pas décidées.

**Chemin d'évolution vers les espaces de noms.** Si des besoins de délégation apparaissent, la structure actuelle peut
évoluer vers les espaces de noms OpenBao, selon les
[modèles de migration de HashiCorp](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure#migration-strategies)
:

```text
platform/ (espace de noms racine)
├── projects/ (les montages actuels restent en place)
└── delegated/
    ├── external-team-a/ (espace de noms enfant)
    └── external-team-b/ (espace de noms enfant)
```

**Intégration de moteurs de secrets avancés.** Une extension future de l'architecture pourrait inclure :

- **Moteur PKI** : pour l'automatisation du cycle de vie des certificats
- **Moteur de base de données** : pour la gestion dynamique des identifiants
- **Moteur Transit** : pour des capacités de chiffrement en tant que service

## Historique des modifications

- _2026-10-11_ : Migration vers le standard de documentation en français (gabarit 2.0.0) : traduction, suppression du
  sommaire manuel, remplacement des émojis par des marqueurs textuels, regroupement des sections « Pros and Cons of the
  Options » et « Alternatives Considered and Rejected » dans « Options envisagées », déplacement des « Future
  Considerations » dans « Détails de mise en œuvre et état », ajout de notes datées. `status` et `date` inchangés : le
  statut `implemented` reste cohérent avec les montages `rhodes.akn/`, `lungmen.akn/` et `shared/` déclarés dans le
  dépôt.
- _2026-05-24_ : CHORE : renommage de `consulted` en `assisted-by` dans le front matter ; suppression du préfixe `ai/`
  des identifiants de modèles.
- _2026-03-19_ : CHORE : migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.

## Pour aller plus loin

- [ADR-001](ADR-001-Gestion-Centralisee-des-Secrets.md) : établit OpenBao comme solution de gestion des secrets retenue.
- [ADR-003](ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) : conventions de nommage des chemins dans les
  montages définis ici.
- [ADR-004](ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md) : conventions de nommage et de portée des
  politiques.
- [Restaurer OpenBao](../plan-de-reprise/brouillon/Restaurer-OpenBao.md) : restauration de l'instance OpenBao.
- [Composant cluster-vault](../../catalog/pulumi/components/cluster-vault/README.md) : automatisation Pulumi des
  montages par cluster.
- [Guide de structure des espaces de noms de HashiCorp](https://developer.hashicorp.com/vault/tutorials/enterprise/namespace-structure)
  : orientation officielle sur les stratégies d'espaces de noms et de montages.
- [Documentation d'OpenBao](https://openbao.org/docs/) : documentation officielle du fork communautaire, dont le
  [moteur KV v2](https://openbao.org/docs/secrets/kv/kv-v2/).
- [External Secrets Operator, fournisseur Vault](https://external-secrets.io/latest/provider/hashicorp-vault/) : modèles
  d'intégration et considérations de performance.
- [NIST Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture) : principes de sécurité Zero
  Trust.
