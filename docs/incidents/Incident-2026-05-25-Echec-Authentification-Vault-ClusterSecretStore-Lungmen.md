---
title: "Échec d'authentification Vault du ClusterSecretStore de lungmen.akn"
date: 2026-05-25
author: "[zai-coding-plan:glm-5.1]"
participants:
  - "Alexandre"
  - "[zai-coding-plan:glm-5.1]"
severity: "Medium" # les applications ont continué sur les secrets en cache ; seuls les chemins de rotation étaient bloqués
status: "Open"
detection-method: "Manual discovery"
duration: "~4h52m (défaillance latente révélée vers 10:42 UTC à la fusion de la PR #996 → résolue vers 15:34 UTC)"
services-affected:
  - "external-secrets-operator (lungmen.akn)"
  - "Les 33 ExternalSecrets et les 6 PushSecrets de lungmen.akn"
users-affected:
  "Aucun impact pour les utilisateurs finaux : les applications ont continué sur les secrets en cache ; seuls les
  chemins de rotation des secrets étaient bloqués"
root-cause-family:
  - bootstrap-coupling
  - observability-gap
  - state-drift
trigger:
  "PR #996 fusionnée le 2026-05-25T10:42:53Z : migration des applications du mécanisme shoot vers le modèle
  d'infrastructure par projet, qui a supprimé le ServiceAccount historique `openbao-auth-delegator` déployé par le
  mécanisme shoot et révélé que le JWT du token reviewer provenait depuis toujours du mauvais cluster"
related-incidents:
  - path: "docs/incidents/Incident-2026-05-30-PushSecrets-504-Vault-NetworkPolicy-Lungmen.md"
    relation:
      "Même chaîne d'authentification ESO → OpenBao → kube-apiserver de lungmen : second mode de défaillance sur le même
      chemin"
related-adrs:
  - "docs/decisions/ADR-001-Gestion-Centralisee-des-Secrets.md"
  - "docs/decisions/ADR-002-Topologie-des-Secrets-OpenBao.md"
  - "docs/decisions/ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md"
  - "docs/decisions/ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md"
---

# Incident 2026-05-25 Echec Authentification Vault ClusterSecretStore Lungmen

Le 2026-05-25, le ClusterSecretStore `vault.chezmoi.sh` de `lungmen.akn` n'a plus pu s'authentifier auprès d'OpenBao, ce
qui a bloqué la synchronisation de tous les ExternalSecrets et PushSecrets du cluster. Cette page décrit la chronologie,
les causes racines, les leçons et les actions de suivi.

## Résumé exécutif

Le ClusterSecretStore `vault.chezmoi.sh` du cluster lungmen.akn ne pouvait plus s'authentifier auprès d'OpenBao, ce qui
empêchait la synchronisation des 33 ExternalSecrets et des 6 PushSecrets. La cause racine est un JWT de token reviewer
stocké dans OpenBao qui n'a pas été mis à jour après la fusion de la PR
[#996](https://github.com/chezmoidotsh/arcane/pull/996) et la suppression de l'ancien ServiceAccount, d'où un rejet
(403) lorsque l'opérateur tentait de s'authentifier auprès d'OpenBao. Le correctif a consisté à régénérer le token à
partir du ServiceAccount `external-secrets` de lungmen et à mettre à jour OpenBao directement.

## Résumé de l'événement

**Résultat attendu :** External Secrets Operator sur lungmen.akn s'authentifie auprès d'OpenBao par la méthode
d'authentification Kubernetes, au mount `lungmen.akn`, avec le rôle `lungmen.akn-eso-role`. Tous les ExternalSecrets se
synchronisent.

**Résultat obtenu :** statut du ClusterSecretStore `InvalidProviderConfig: unable to create client`. 33 ExternalSecrets
en `SecretSyncedError`, 6 PushSecrets en échec avec `403 permission denied` sur `PUT /v1/auth/lungmen.akn/login`.

**Impact :** toutes les applications de lungmen.akn qui dépendent de secrets synchronisés depuis Vault ne pouvaient plus
recevoir de mises à jour d'identifiants : mots de passe de bases de données, secrets de clients OIDC, certificats TLS,
identifiants SMB et clés de sauvegarde S3. Les applications qui tournaient avec des secrets en cache ont continué à
fonctionner, mais toute rotation de secret aurait échoué silencieusement.

**Durée :** l'échec est devenu visible à la fusion de la PR #996, le 2026-05-25 vers 10:42 UTC, qui a migré toutes les
applications gérées par le mécanisme shoot vers le même modèle de déploiement que les autres charges de travail et
supprimé le ServiceAccount historique. La défaillance d'authentification, jusque-là latente, s'est alors manifestée
comme une panne complète. Résolution le 2026-05-25 vers 15:34 UTC.

**Premier signal :** Alexandre a remarqué l'échec du ClusterSecretStore sur lungmen environ 4 h après la fusion de la PR
#996, en relisant les changements avant la PR #994.

## Chronologie

<!-- skew: ±15m pour la détection par Alexandre (remarquée ~4h après la fusion de la PR) ; ±5m pour les actions de l'agent IA ; exact pour l'événement [system:external-secrets] (issu du journal du contrôleur ESO) -->

| Heure (UTC) | Acteur                     | Événement ou décision                                                                                                           |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
|             | Alexandre                  | Demande l'investigation de l'échec du ClusterSecretStore sur lungmen                                                            |
|             | \[zai-coding-plan:glm-5.1] | Identifie l'erreur 403 sur `/v1/auth/lungmen.akn/login` dans les journaux d'ESO via `kubectl logs`                              |
|             | \[zai-coding-plan:glm-5.1] | Décode le JWT du secret `lungmen-akn-eso-credentials` : le ServiceAccount `openbao-auth-delegator` n'existe pas sur lungmen     |
|             | \[zai-coding-plan:glm-5.1] | Génère un nouveau token depuis le ServiceAccount `external-secrets` de lungmen, met à jour OpenBao par `bao kv patch` (v2 → v3) |
|             | \[zai-coding-plan:glm-5.1] | Force le rafraîchissement de l'ExternalSecret sur amiya pour propager le nouveau token vers le secret Crossplane                |
|             | \[zai-coding-plan:glm-5.1] | Crossplane ne réapplique pas `AuthBackendConfig` malgré le déclenchement de la réconciliation                                   |
|             | \[zai-coding-plan:glm-5.1] | Met à jour directement la configuration du backend d'authentification OpenBao par `bao write auth/lungmen.akn/config`           |
|             | \[system:external-secrets] | Le ClusterSecretStore passe à `Ready: store validated`. 33 des 34 ExternalSecrets se synchronisent.                             |

## Ce qui a bien fonctionné

- **Architecture de catalogue partagé** : la définition de base du `ClusterSecretStore` dans
  `catalog/kubernetes/external-secrets/kustomize/`, avec les patches par cluster dans la kustomization de chaque projet,
  a garanti que le code source de vérité était correct. Le défaut se trouvait dans les données d'exécution, pas dans la
  configuration déclarative.
- **Binding `system:auth-delegator` existant** : les `extraObjects` du chart Helm liaient déjà `system:auth-delegator`
  au ServiceAccount `external-secrets` sur chaque cluster. Aucun nouveau RBAC n'était nécessaire ; seul le token devait
  être régénéré.
- **Débogage par couches** : suivre la chaîne ClusterSecretStore → journaux d'ESO → décodage du JWT → vérification de
  l'existence du ServiceAccount → ressources Crossplane a permis d'isoler rapidement la cause racine.

## Analyse des causes racines

**Technique :** 5 Whys **Pourquoi cette technique :** chaîne linéaire unique : un token issu du mauvais cluster a
traversé le bootstrap sans jamais être validé. La chaîne de causes converge sans se ramifier.

### Analyse

1. **Pourquoi tous les ExternalSecrets de lungmen.akn échouaient-ils ?** Parce que le ClusterSecretStore
   `vault.chezmoi.sh` ne pouvait pas s'authentifier auprès d'OpenBao et recevait un 403 sur
   `/v1/auth/lungmen.akn/login`.

2. **Pourquoi OpenBao rejetait-il l'authentification ?** Parce que le JWT du token reviewer configuré dans
   `AuthBackendConfig` n'était pas valide. Quand OpenBao appelait l'API TokenReview sur
   `kubernetes.lungmen.akn.chezmoi.sh:6443` avec ce token, l'API server de lungmen le rejetait comme non reconnu.

3. **Pourquoi le JWT du token reviewer n'était-il pas valide ?** Parce que le ServiceAccount associé
   (`openbao-auth-delegator`) n'existait plus sur lungmen.akn, et que le token ne pouvait donc plus être validé
   correctement par l'API server. La revendication `iss` du token ne correspondait pas non plus à l'émetteur attendu
   pour le cluster lungmen.

4. **Pourquoi le ServiceAccount `openbao-auth-delegator` n'existait-il plus sur lungmen ?** Parce que la PR #996 a
   supprimé ce ServiceAccount historique en migrant external-secrets du mécanisme shoot vers le modèle d'infrastructure
   par projet, alors que le token stocké dans OpenBao y faisait toujours référence.

5. **Pourquoi l'émetteur du token n'était-il pas validé par rapport au cluster cible ?** Parce que la composition
   Crossplane `RemoteClusterVault` lit le token reviewer dans un secret Kubernetes référencé par label, mais ne vérifie
   jamais que la revendication `iss` du token correspond à `spec.host`. La composition part du principe que le secret
   contient le bon token. Aucun contrôle préalable ni webhook d'admission ne valide cette relation.

### Causes racines

- **Aucune validation de l'émetteur dans le flux de bootstrap de RemoteClusterVault** : la composition Crossplane de
  `RemoteClusterVault` accepte n'importe quel token dans le secret référencé et le transmet tel quel à
  `AuthBackendConfig` d'OpenBao. Elle ne vérifie jamais que l'émetteur du token correspond au `kubernetesHost` du
  cluster. Cette lacune structurelle permet de stocker le token de n'importe quel cluster pour n'importe quel backend
  d'authentification, et le système l'accepte silencieusement.

### Facteurs contributifs

- **Crossplane ne réapplique pas `AuthBackendConfig` quand le secret référencé change** : même après la mise à jour du
  secret dans OpenBao et le rafraîchissement de l'ExternalSecret sur amiya, le provider-vault de Crossplane n'a pas
  détecté le changement et n'a pas réappliqué la configuration du backend d'authentification. Le correctif a nécessité
  un `bao write` direct sur OpenBao, en contournant GitOps. Toute future rotation du token demandera donc aussi une
  intervention manuelle.
- **Format de token historique sans expiration** : le token d'origine utilisait l'émetteur historique
  `kubernetes/serviceaccount`, sans revendication `exp`. Cela a masqué le problème, car le token n'expirait jamais et
  paraissait valide à l'inspection. Le nouveau token utilise le format projeté, avec une URL d'émetteur correcte et une
  expiration.

## Signaux d'alerte manqués

| Signal                                                                      | Quand il était visible                | Pourquoi on n'a pas agi                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ClusterSecretStore `Ready=False` avec `InvalidProviderConfig`               | Après la fusion de la PR (~10:42 UTC) | Aucune alerte sur le statut du ClusterSecretStore ; aucun tableau de bord ne le suivait                    |
| ExternalSecrets en `SecretSyncedError` dans tous les namespaces             | Après la fusion de la PR (~10:42 UTC) | Les applications continuaient à tourner sur des secrets en cache, donc aucune panne visible                |
| Revendication `iss` du JWT au format historique `kubernetes/serviceaccount` | Avant l'incident (au bootstrap)       | Aucune étape de validation du bootstrap ne contrôlait l'émetteur                                           |
| ServiceAccount `openbao-auth-delegator` absent de lungmen                   | Avant l'incident (au bootstrap)       | Aucune réconciliation ne garantit que le ServiceAccount référencé par le token existe sur le cluster cible |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu être changé)

- Aucune alerte ni supervision sur l'état de disponibilité du ClusterSecretStore.
- Aucun chemin de réconciliation imposé par GitOps pour la configuration du backend d'authentification OpenBao quand le
  secret sous-jacent change.
- La composition `RemoteClusterVault` ne valide pas la revendication `iss` du token référencé.
  - La mise en oeuvre est difficile : la composition est générique et le contenu du token est opaque pour la couche
    Crossplane.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                        | Qu'est-ce qui réduirait l'exposition ?                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Le provider-vault de Crossplane met en cache les références de secrets | Ajouter un déclencheur `reconcile` explicite ou une annotation de synchronisation forcée périodique dans la composition |

## Leçons systémiques

- **La détection de dérive de Crossplane est insuffisante pour les références de secrets** : quand une ressource gérée
  par Crossplane référence un secret Kubernetes (via `*SecretRef`), le provider lit le secret à la création ou à la mise
  à jour, mais ne le relit pas aux réconciliations suivantes tant que la spec ne change pas. La rotation d'un secret
  exige donc soit un changement de spec (par exemple modifier une annotation), soit un appel direct à l'API en dehors de
  GitOps. Cela concerne toutes les ressources `AuthBackendConfig` qui utilisent `tokenReviewerJwtSecretRef`.

- **Aucune observabilité sur la santé de la gestion des secrets** : les écosystèmes ESO et Crossplane remontent leur
  état par les conditions des CRD, mais rien dans la pile de supervision actuelle n'expose la disponibilité des
  ClusterSecretStores ni des ExternalSecrets. La défaillance d'un seul `ClusterSecretStore` se propage à toutes les
  applications qui en dépendent. Ajouter des alertes sur les conditions des CRD est la solution durable ; elle n'est pas
  encore planifiée.

## De la leçon au contrôle

| Leçon                                                                                                        | Type d'artefact                      | Artefact lié                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `*SecretRef` de Crossplane ne relit pas le secret après changement : la rotation exige un changement de spec | Fichier de connaissances             | `.agents/knowledge/crossplane.md`                                                  |
| Aucun signal sur la disponibilité des ClusterSecretStores et ExternalSecrets                                 | Règle d'alerte                       | À définir, dépend du déploiement de la supervision (pas de supervision à l'époque) |
| La composition `RemoteClusterVault` fait confiance à n'importe quel token du secret référencé                | Règle OPA / garde-fou de composition | `catalog/crossplane/clustervault.vault.chezmoi.sh/` : contrôle de l'émetteur       |

## Registre des changements

- [ ] [due:: 2026-06-15] [priority:: high] [size:: M] [owner:: Alexandre] Ajouter la validation de la revendication
      `iss` dans le chemin de bootstrap de la composition `RemoteClusterVault` (ou une règle OPA de contrôle préalable)
      afin qu'un token issu du mauvais cluster ne puisse pas être accepté silencieusement
  - **Vérification :** test manuel : stocker un token d'amiya dans l'emplacement de lungmen ; la composition le rejette
    avec un message d'erreur clair
  - **Sinon :** la même classe de défaillance d'authentification latente reste possible à chaque nouveau
    `RemoteClusterVault`

- [ ] [due:: 2026-06-22] [priority:: high] [size:: L] [owner:: Alexandre] Planifier une pile d'observabilité couvrant la
      disponibilité des ClusterSecretStores et des ExternalSecrets (c'est le méta-motif de la famille
      `observability-gap`)
  - **Vérification :** une proposition de supervision concrète (jeu de règles Prometheus ou alternative) est documentée
    et versionnée dans `docs/decisions/` ou `docs/experiments/`
  - **Sinon :** la prochaine défaillance d'authentification ESO/Vault sera encore découverte par un utilisateur, pas par
    un signal

- [ ] [due:: 2026-06-08] [priority:: medium] [size:: S] [owner:: Alexandre] Documenter dans la composition
      `RemoteClusterVault` la procédure de rotation manuelle (Crossplane ne réappliquant pas automatiquement la
      configuration du backend d'authentification)
  - **Vérification :** un bloc de commentaire est visible dans `remote.x.v1alpha1.openbao.yaml` ; la prochaine rotation
    utilise la procédure documentée sans redécouverte
  - **Sinon :** la prochaine rotation de token redécouvrira sous pression le contournement par `bao write`

## Connaissances pour les agents

- Crossplane `provider-vault` `AuthBackendConfig.tokenReviewerJwtSecretRef` : lit le secret référencé à la création ou à
  la mise à jour, **ne le relit pas** aux réconciliations suivantes. La rotation du token exige un changement de spec
  (par exemple une modification d'annotation) ou un `bao write auth/<mount>/config` direct.
- Méthode d'authentification Kubernetes d'OpenBao : depuis un cluster distant, OpenBao effectue lui-même un appel
  TokenReview vers le kube-apiserver de ce cluster. Le JWT du token reviewer doit provenir d'un ServiceAccount **du
  cluster cible**, pas du cluster qui héberge OpenBao.
- JWT : la revendication `iss` révèle le cluster source. `kubernetes/serviceaccount` historique (sans `exp`) désigne
  l'ancien format de token de ServiceAccount ; les tokens projetés portent une URL d'émetteur complète. Toujours
  recouper `iss` avec le cluster vers lequel pointe le backend d'authentification.
- External Secrets Operator : les `extraObjects` du Helm servent à lier `system:auth-delegator` au ServiceAccount
  `external-secrets` sur chaque cluster ; ce binding est le prérequis pour que le TokenReview d'OpenBao réussisse.

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                                                   | Instance      |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1 semaine         | 2026-06-08 | Action medium terminée ; procédure de rotation documentée dans la composition                                                         | Revue en solo |
| 1 mois            | 2026-06-22 | Actions high 1 et 2 avancées ; validation de l'émetteur testée ; plan d'observabilité rédigé                                          | Revue en solo |
| 3 mois            | 2026-08-25 | Aucune récidive de défaillance d'authentification du store de secrets découverte par un utilisateur (détection par signal uniquement) | Revue en solo |

## Pour aller plus loin

- [ADR-002](../decisions/ADR-002-Topologie-des-Secrets-OpenBao.md) : topologie des secrets OpenBao, dont les mounts par
  cluster utilisés par le backend d'authentification Kubernetes
- [ADR-001](../decisions/ADR-001-Gestion-Centralisee-des-Secrets.md) : décision de gestion centralisée des secrets à
  l'origine de la chaîne ESO → OpenBao
- [Incident 2026-05-30 : PushSecrets 504 et NetworkPolicy Vault](Incident-2026-05-30-PushSecrets-504-Vault-NetworkPolicy-Lungmen.md)
  : second mode de défaillance sur la même chaîne d'authentification
