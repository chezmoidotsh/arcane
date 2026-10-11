---
title: "PushSecrets 504 des bases de données de lungmen.akn — NetworkPolicy du namespace vault"
date: 2026-05-30
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Medium"
status: "Open"
detection-method: "User report"
duration: "Unknown — detected via user report; interruption duration not measured"
services-affected:
  - "databases PushSecrets (lungmen.akn) — n8n, atuin, forgejo, immich, linkding, paperless"
users-affected: "No direct user impact; database credential sync to OpenBao interrupted"
root-cause-family:
  - "network-policy-incomplete"
related-incidents:
  - path: "docs/incidents/Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md"
    relation: "Même chaîne d'authentification (ESO → OpenBao → authentification Kubernetes de lungmen)"
related-adrs: []
related-issues: []
---

# Incident 2026-05-30 PushSecrets 504 Vault NetworkPolicy Lungmen

Migré le 2026-10-11 ; les faits décrits sont ceux de l'époque et n'ont pas été revérifiés.

Les PushSecrets du namespace `databases` de `lungmen.akn` ne parvenaient plus à pousser leurs identifiants dans OpenBao,
à cause de CiliumNetworkPolicies du namespace `vault` de `amiya.akn`. Cette page décrit l'événement, l'analyse des
causes racines, les actions de suivi et les connaissances à retenir.

## Résumé exécutif

Les PushSecrets du namespace `databases` de `lungmen.akn` ne parvenaient plus à pousser leurs identifiants de bases de
données dans OpenBao. La cause racine : des CiliumNetworkPolicies récemment ajoutées au namespace `vault` de `amiya.akn`
bloquaient l'egress d'OpenBao vers le serveur d'API Kubernetes de lungmen, une connexion qu'OpenBao doit établir pour
valider les JWT lors de l'authentification Kubernetes. Le correctif est une CiliumNetworkPolicy dédiée, qui autorise
l'accès limité par FQDN à `kubernetes.lungmen.akn.chezmoi.sh:6443`.

## Résumé de l'événement

**Résultat attendu :** les PushSecrets du namespace `databases` synchronisent les identifiants PostgreSQL (nom
d'utilisateur, mot de passe, URI, etc.) vers OpenBao toutes les 5 minutes.

**Résultat obtenu :** tous les PushSecrets de `databases` ont renvoyé
`set secret failed: unable to log in with Kubernetes auth [...] Code: 504. Raw Message: upstream request timeout` sur
`PUT https://vault.chezmoi.sh/v1/auth/lungmen.akn/login`.

**Impact :** la synchronisation des identifiants CNPG vers OpenBao a été interrompue. Les identifiants déjà présents
dans OpenBao sont restés valides (aucune perte de données) ; l'impact se limite aux nouvelles rotations d'identifiants
et au provisionnement de clusters.

**Durée :** inconnue — détecté par un signalement de l'utilisateur ; la durée de l'interruption n'a pas été mesurée.
Chronologie omise : horodatages non reconstituables de façon fiable.

**Premier signal :** signalement par l'utilisateur d'erreurs ESO dans le namespace `databases`.

## Chronologie

_Omise : horodatages non reconstituables de façon fiable._

## Ce qui a bien fonctionné

- Le message d'erreur d'ESO était précis et directement exploitable : URL exacte, code HTTP, message brut. La cause
  racine a été localisée en moins de 5 minutes.
- Le diagnostic a écarté à raison les fausses pistes (certificat CA périmé, échec DNS, Tailscale) en se concentrant sur
  le code 504, un délai dépassé côté OpenBao et non côté ESO.
- Le correctif est ciblé : une politique limitée par `toFQDNs` par cluster distant, plutôt qu'une autorisation d'egress
  générale vers `world` sur le port 6443.

## Analyse des causes racines

**Technique :** 5 Whys **Pourquoi cette technique :** chaîne de défaillance unique, avec un enchaînement causal clair du
symptôme à la condition structurelle ; aucune ramification vers des causes indépendantes.

### Analyse

1. **Pourquoi les PushSecrets ont-ils échoué ?** → ESO a reçu un 504 en s'authentifiant auprès d'OpenBao via
   `auth/lungmen.akn`.
2. **Pourquoi OpenBao a-t-il renvoyé un 504 ?** → OpenBao ne pouvait pas joindre
   `kubernetes.lungmen.akn.chezmoi.sh:6443` pour valider le JWT Kubernetes présenté par ESO (TokenReview).
3. **Pourquoi OpenBao ne pouvait-il pas joindre ce point d'accès ?** → Cilium bloquait l'egress du pod OpenBao vers
   cette destination (entité `world`, port 6443).
4. **Pourquoi cet egress était-il bloqué ?** → La CiliumNetworkPolicy `default-hardened` du namespace `vault` refuse
   tout egress par défaut, et `allow-openbao-to-kubernetes-api` n'autorisait le port 6443 que vers le kube-apiserver
   local (endpoint `kube-system` + entité `host`), pas vers les serveurs d'API des clusters distants.
5. **Pourquoi la politique ne couvrait-elle pas les clusters distants ?** → Lors de l'écriture de
   `allow-openbao-to-kubernetes-api`, seul le cas d'usage local (amiya → kube-apiserver d'amiya) a été modélisé. Le
   besoin d'OpenBao de joindre les serveurs d'API des clusters distants pour valider leurs JWT n'a pas été identifié
   comme un chemin d'egress nécessaire.

### Causes racines

- **`allow-openbao-to-kubernetes-api` a été écrite sans modéliser les backends d'authentification Kubernetes distants.**
  OpenBao doit joindre le serveur d'API de _chaque cluster distant_ enregistré via un `RemoteClusterVault` Crossplane
  pour effectuer le TokenReview des JWT. Cette connexion sortante n'apparaît pas dans la configuration d'ESO et risque
  de passer inaperçue : c'est OpenBao, et non ESO, qui l'initie.

### Facteurs contributifs

- **Pas de test de fumée après l'ajout des NetworkPolicies du namespace vault.** Rien ne vérifiait que tous les backends
  d'authentification d'OpenBao fonctionnaient encore après l'application des nouvelles politiques.
- **Incident récent** (`2026-05-25`) sur la même chaîne d'authentification (ESO de lungmen ↔ OpenBao), qui aurait pu
  inciter à tester explicitement ce chemin.

## Signaux d'alerte manqués

| Signal                                                                                           | Quand il était visible            | Pourquoi on n'a pas agi                                                                                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| L'incident du 2026-05-25 touchait déjà la même chaîne d'authentification ESO → OpenBao → lungmen | À l'écriture des NetPols du vault | L'attention portait sur le cas d'authentification local ; les chemins d'authentification distants n'étaient pas dans le périmètre |

## Analyse du contrôle

### Sous contrôle

- `allow-openbao-to-kubernetes-api` aurait dû être écrite en tenant compte de tous les backends d'authentification
  Kubernetes configurés dans OpenBao, et pas seulement du backend local.
- Un test de fumée après déploiement (vérifier que le `ClusterSecretStore` est `Ready` et que les PushSecrets sont
  `Synced`) aurait détecté la régression immédiatement.

### Hors de contrôle

| Facteur externe                            | Qu'est-ce qui réduirait l'exposition ? |
| ------------------------------------------ | -------------------------------------- |
| Aucun — l'incident est entièrement interne | —                                      |

## Leçons systémiques

- **Ajouter des NetworkPolicies à un namespace de courtier (OpenBao, ArgoCD) exige de modéliser _tous_ les chemins
  d'egress, y compris les connexions sortantes que le courtier initie vers des systèmes tiers.** Ces connexions
  sortantes indirectes (OpenBao → kube-apiserver distant) sont invisibles dans la configuration d'ESO et passent
  risquent de passer inaperçues.
- **Chaque `RemoteClusterVault` ajouté via Crossplane exige une CNP correspondante dans le namespace `vault`.** Ce
  couplage n'est pas exprimé dans le code : c'est une convention implicite qui doit être rendue explicite dans la liste
  de contrôle d'amorçage ou dans la Composition Crossplane elle-même.

## De la leçon au contrôle

| Leçon                                                                              | Type d'artefact                | Artefact lié                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| Les NetPols d'un namespace de courtier doivent modéliser tous les chemins d'egress | Vérification avant déploiement | `docs/guides/Initialiser-Lungmen.md` — liste de contrôle de test de fumée après NetPol |
| Chaque RemoteClusterVault exige une CNP dans vault                                 | Commentaire dans le code       | `catalog/crossplane/clustervault.vault.chezmoi.sh/remote.x.v1alpha1.openbao.yaml`      |

> [!NOTE]\
> Note du 2026-10-11 : ni `catalog/crossplane/` ni `projects/amiya.akn/` n'existent plus dans l'arborescence (Crossplane
> a été remplacé par Pulumi, voir [ADR-015](../decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md)), et
> [Initialiser Lungmen](../guides/Initialiser-Lungmen.md) ne contient aucune liste de contrôle de test de fumée après
> NetPol (`grep` sur « netpol », « smoke », « NetworkPolicy », « ClusterSecretStore » et « PushSecret » sans résultat).
> Le texte d'origine est conservé tel quel.

## Registre des changements

- [ ] [due:: 2026-06-06] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter un commentaire dans
      `remote.x.v1alpha1.openbao.yaml` (Composition Crossplane) indiquant qu'une CNP du namespace vault est requise pour
      chaque nouveau `RemoteClusterVault`
  - **Vérification :** commentaire visible dans la Composition ; la prochaine création d'un `RemoteClusterVault` est
    précédée d'une CNP correspondante
  - **Sinon :** le prochain nouveau cluster distant casse silencieusement les PushSecrets, et l'incident se reproduit
    sous la même forme

- [ ] [due:: 2026-06-15] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter une liste de contrôle de test de
      fumée après NetPol dans `docs/guides/Initialiser-Lungmen.md` : vérifier que le `ClusterSecretStore` est Ready et
      que les PushSecrets sont Synced
  - **Vérification :** section « Validation après NetPol » présente dans le document ; le prochain changement de NetPol
    dans le namespace vault déclenche la liste de contrôle
  - **Sinon :** les futurs changements de NetPol du namespace vault peuvent casser silencieusement des backends
    d'authentification sans être détectés

## Connaissances pour les agents

- \[OpenBao + Cilium] : lors de l'ajout ou de la modification de CiliumNetworkPolicies dans le namespace `vault`,
  modéliser les chemins d'egress de TOUS les backends d'authentification Kubernetes — chaque serveur d'API de cluster
  distant (par exemple `kubernetes.lungmen.akn.chezmoi.sh:6443`) exige une règle `toFQDNs` explicite.
- \[OpenBao + authentification Kubernetes] : OpenBao initie des connexions sortantes vers les serveurs d'API des
  clusters distants pour le TokenReview des JWT — c'est invisible dans la configuration d'ESO et facile à manquer en
  écrivant des NetworkPolicies.
- \[RemoteClusterVault] : chaque ressource Crossplane `RemoteClusterVault` exige implicitement une CiliumNetworkPolicy
  correspondante dans le namespace `vault`. Ce couplage n'est pas exprimé dans le code.

## Suivi de résolution

### Fait

- [x] Ajouter la CiliumNetworkPolicy `allow-openbao-to-lungmen-api` (`toFQDNs: kubernetes.lungmen.akn.chezmoi.sh:6443`)
      — appliquée dans `projects/amiya.akn/src/apps/vault/security/` et `dist/`

### En attente — après la fusion de la PR

- [ ] Ajouter un commentaire dans `catalog/crossplane/clustervault.vault.chezmoi.sh/remote.x.v1alpha1.openbao.yaml`
      signalant l'exigence d'une CiliumNetworkPolicy par `RemoteClusterVault`
- [ ] Ajouter une liste de contrôle de test de fumée après NetPol dans `docs/guides/Initialiser-Lungmen.md`

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                        | Instance      |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------ | ------------- |
| 1 semaine         | 2026-06-06 | Tous les PushSecrets de `databases` en `Synced` ; aucun nouveau 504 sur `auth/lungmen.akn` | Revue en solo |
| 1 mois            | 2026-06-30 | Actions 1 et 2 du registre des changements terminées ; aucune récidive                     | Revue en solo |

## Pour aller plus loin

- [Incident 2026-05-25 : échec d'authentification Vault du ClusterSecretStore de Lungmen](Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md)
  : l'incident précédent sur la même chaîne d'authentification ESO → OpenBao
- [Initialiser Lungmen](../guides/Initialiser-Lungmen.md) : le guide d'amorçage visé par la liste de contrôle de test de
  fumée
- [ADR-015](../decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md) : la décision qui remplace Crossplane par Pulumi
