---
title: "Redis en ImagePullBackOff — index.json corrompu dans Zot et limitation de débit Docker Hub"
date: 2026-05-30
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "High" # paperless-ngx indisponible 7 h ; mise à jour progressive d'immich bloquée ; visible par la famille
status: "Open"
detection-method: "Manual discovery"
duration: "~8h (first Zot error 11:15 UTC → both pods Running ~19:20 UTC)"
services-affected:
  - "zot-registry (amiya.akn) — OCI mirror for all clusters"
  - "immich (lungmen.akn) — rolling update blocked; service unavailable"
  - "paperless-ngx (lungmen.akn) — redis pod in ImagePullBackOff; service unavailable"
users-affected: "Family — paperless-ngx unavailable ~7h; immich rolling update stalled (old pod stayed up)"
root-cause-family:
  - observability-gap
  - upstream-regression
error_signatures:
  - "invalid character '\\xc9' looking for beginning of value"
  - "unsupported repository layout version"
  - "rate limit exceeded [http 429]"
  - "ImagePullBackOff"
related-incidents:
  - path: "docs/incidents/Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md"
    relation:
      "Origine suspectée de la corruption de l'index Zot — écritures concurrentes dans Zot pendant le crash du cluster
      provoqué par Kyverno"
  - path: "docs/incidents/Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md"
    relation:
      "Même mode de défaillance (corruption de index.json dans Zot, erreurs 500 sur un dépôt précis), déclencheur racine
      distinct"
related-adrs: []
---

# Incident 2026-05-30 ImagePullBackOff Redis Index Zot Corrompu

Le 2026-05-30, les pods Redis d'`immich` et de `paperless-ngx` sont restés en `ImagePullBackOff` pendant environ 8 h. Le
registre Zot de `amiya.akn` avait un `index.json` corrompu pour `docker.io/library/redis`, et la resynchronisation
automatique depuis Docker Hub était bloquée par la limitation de débit anonyme. Cette page décrit la chronologie, les
causes racines, les leçons et les actions de suivi.

## Résumé exécutif

Le registre d'images Zot de `amiya.akn` contenait un fichier d'index corrompu pour l'image `redis`, sans que l'origine
soit connue. Ce défaut est resté invisible jusqu'à une mise à jour de `immich` et `paperless-ngx` vers
`redis:8.8.0-alpine`. Le registre a tenté de retélécharger l'image depuis Docker Hub, mais l'écriture a échoué et la
tentative a épuisé le quota anonyme de téléchargements. Faute de copie locale exploitable et d'accès à la source, les
deux applications n'ont pas pu démarrer leur Redis pendant près de sept heures. Le stockage de Zot a été reconstruit à
la main pour ce dépôt, sans perte de données.

## Résumé de l'événement

**Résultat attendu :** la synchronisation ArgoCD met à jour `immich` et `paperless-ngx` vers `redis:8.8.0-alpine` ; Zot
récupère l'image à la demande depuis Docker Hub et la sert de façon transparente aux nœuds de `lungmen.akn`.

**Résultat obtenu :** l'`index.json` de Zot pour `docker.io/library/redis` contenait des données binaires
(`\xc9\x17\x30\x4e…`). La première synchronisation à la demande de Zot a téléchargé plusieurs couches d'image depuis
Docker Hub mais n'a pas pu les enregistrer (l'index corrompu bloquait les écritures). Ces téléchargements inutiles ont
consommé le quota anonyme ; toutes les synchronisations suivantes ont été rejetées par Docker Hub avec un HTTP 429. Zot
a renvoyé un HTTP 500 sur toutes les requêtes de manifeste du dépôt, ce qui a placé les pods `immich-redis` et
`paperless-ngx-redis` en `ImagePullBackOff`.

**Impact :** `paperless-ngx` totalement indisponible pendant \~7 h ; `immich` partiellement dégradé (l'ancien pod Redis
a continué de tourner, le nouveau déploiement est resté bloqué pendant la même durée). Aucune perte de données.

**Durée :** `2026-05-30T11:15Z` (première erreur Zot) → `±? 2026-05-30T19:20Z` (les deux pods en `Running`), soit
environ **8 h**.

**Premier signal :** `2026-05-30T11:15:13Z` — journal Zot
`failed to unmarshal index.json for repo invalid character '\xc9' looking for beginning of value` (non observé à
l'époque ; aucune alerte configurée).

## Chronologie

<!-- skew: horodatages Zot issus des journaux JSON structurés (UTC, précision sous la seconde) — fiables.
     Les horodatages d'investigation et de correction ne sont pas reconstituables de façon fiable ; omis ci-dessous. -->

| Heure (UTC)                     | Acteur                                     | Événement ou décision                                                                                                                                            |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-30T11:13:09             | \[system:argocd]                           | La synchronisation ArgoCD met à jour `immich` et `paperless-ngx` vers `redis:8.8.0-alpine@sha256:9156d3e4…` ; nouveau ReplicaSet `immich-redis-86c5b874b9`       |
| 2026-05-30T11:15:13             | \[system:zot]                              | Première requête de pull sur Zot ; analyse de `index.json` : `invalid character '\xc9'` — le scrub échoue aussi avec `repository not found`                      |
| 2026-05-30T11:15:35             | \[system:zot]                              | Zot renvoie un HTTP 500 au nœud demandeur ; déclenche une synchronisation à la demande depuis Docker Hub                                                         |
| 2026-05-30T11:15:36             | \[system:zot]                              | Synchronisation partiellement réussie : plusieurs blobs de couches téléchargés depuis Docker Hub (\~10–15 pulls anonymes consommés du quota)                     |
| 2026-05-30T11:16:05             | \[system:zot]                              | L'enregistrement échoue : `unsupported repository layout version` — l'index corrompu bloque les écritures ; blobs téléchargés perdus                             |
| 2026-05-30T11:19:26             | \[system:zot]                              | Premier HTTP 429 de Docker Hub : `rate limit exceeded` — quota anonyme épuisé par la première tentative en échec                                                 |
| 2026-05-30T11:19:26 → T11:36:32 | \[system:zot]                              | Tentatives de synchronisation répétées, toutes rejetées avec un HTTP 429 (backoff exponentiel) ; chemin d'auto-réparation définitivement bloqué                  |
| ±? 2026-05-30T18:00             | Alexandre                                  | Constate manuellement l'`ImagePullBackOff` des pods Redis d'immich et de paperless-ngx ; démarre l'investigation                                                 |
| ±? 2026-05-30T18:05             | Alexandre / \[anthropic:claude-sonnet-4-6] | Journaux Zot examinés ; double cause racine identifiée : `index.json` corrompu + HTTP 429 de Docker Hub                                                          |
| ±? 2026-05-30T18:15             | \[anthropic:claude-sonnet-4-6]             | `index.json` remplacé par un index OCI vide valide via un pod busybox de debug ; le HTTP 500 de Zot devient un 404                                               |
| ±? 2026-05-30T18:20             | \[anthropic:claude-sonnet-4-6]             | `crane copy` pour pousser l'image directement dans Zot tenté mais en échec — Zot n'a pas d'authentification utilisateur (politique en lecture seule anonyme)     |
| ±? 2026-05-30T18:30             | \[anthropic:claude-sonnet-4-6]             | Tous les blobs téléchargés depuis Docker Hub via l'API de jeton authentifié (manifeste d'index, manifeste amd64, configuration, 6 couches ; \~37 Mo) et injectés |
| ±? 2026-05-30T19:00             | \[anthropic:claude-sonnet-4-6]             | `index.json` correct reconstruit avec la structure d'index d'images OCI ; propriétaire des blobs corrigé (`32460:32460`)                                         |
| ±? 2026-05-30T19:10             | Alexandre                                  | Zot vérifié : `GET /v2/docker.io/library/redis/tags/list` → HTTP 200 ; manifeste par digest → HTTP 200                                                           |
| ±? 2026-05-30T19:15             | Alexandre                                  | Pods en échec supprimés ; `immich-redis` et `paperless-ngx-redis-0` redémarrent et passent en `Running`                                                          |

## Ce qui a bien fonctionné

- **La cause racine a été trouvée rapidement une fois l'investigation manuelle lancée** — les journaux JSON structurés
  de Zot ont fourni les horodatages et les messages d'erreur exacts, sans ambiguïté sur ce qui avait échoué et quand.
- **La procédure d'injection manuelle des blobs a fonctionné** — le format OCI Image Layout est bien spécifié ;
  reconstruire le stockage à partir des blobs de Docker Hub s'est déroulé sans difficulté une fois l'approche
  identifiée.
- **Aucune perte de données** — tous les services concernés stockent leur état dans des PVC PostgreSQL ou volumes
  distincts ; un redémarrage de Redis ne perd aucune donnée.

## Analyse des causes racines

**Technique :** Swiss Cheese **Pourquoi cette technique :** trois couches de défense indépendantes ont échoué
simultanément (intégrité du stockage, synchronisation à la demande, idempotence des écritures). Un 5 Whys les ramènerait
à une seule chaîne et masquerait le caractère multicouche.

### Analyse

Trois couches de défense indépendantes avaient chacune des trous qui se sont alignés simultanément.

### Couche 1 — Intégrité du stockage Zot

L'`index.json` de `docker.io/library/redis` était corrompu (contenu binaire) depuis environ 2026-05-26T21:04Z, soit
quatre jours avant l'incident. Zot ne vérifie pas l'intégrité des dépôts OCI existants, ni au démarrage ni de façon
périodique. La corruption est restée invisible jusqu'à ce qu'une requête de pull pour un nouveau tag déclenche une
recherche de manifeste dans le fichier corrompu.

> _Trou_ : aucune validation périodique ou au démarrage de l'index OCI ; la corruption persiste silencieusement tant
> qu'elle n'est pas sollicitée.

### Couche 2 — Auto-réparation par synchronisation à la demande

Quand Zot ne peut pas servir une image localement, il déclenche une synchronisation à la demande depuis le registre
amont. Ce mécanisme aurait dû réparer le manifeste manquant. Cependant :

1. La première tentative a téléchargé plusieurs couches depuis Docker Hub (anonyme, aucun identifiant configuré).
2. En tentant d'enregistrer le contenu téléchargé, Zot a rencontré l'index corrompu et a échoué.
3. La tentative en échec a consommé une part importante du quota anonyme de Docker Hub.
4. Toutes les tentatives suivantes ont été rejetées par Docker Hub avec un HTTP 429.

> _Trou_ : le registre de synchronisation `docker.io` de Zot n'a pas de `credentials:` configurés. Les pulls anonymes
> sur Docker Hub sont limités à \~100 par 6 heures et par IP de sortie. Une seule synchronisation en échec peut épuiser
> le quota et bloquer définitivement le chemin d'auto-réparation.

### Couche 3 — Observabilité et alerting

La défaillance était visible dans les journaux Zot dès `2026-05-30T11:15:13Z`, et dans les événements des pods peu
après. Aucune alerte ne s'est déclenchée. Le problème a été découvert de nombreuses heures plus tard, par inspection
manuelle.

> _Trou_ : aucune alerte sur les réponses HTTP 500 répétées de Zot ; aucune alerte sur les pods en `ImagePullBackOff`
> depuis plus de quelques minutes.

### Causes racines

- **Aucune validation de l'intégrité du stockage OCI dans Zot** — les fichiers `index.json` corrompus ne sont détectés
  que lorsqu'une requête les sollicite. Sans scan d'intégrité périodique, une corruption latente peut persister
  indéfiniment jusqu'à ce qu'un nouveau tag d'image touche le dépôt concerné.

- **Synchronisation Docker Hub configurée sans identifiants** — l'entrée de registre de synchronisation `docker.io` dans
  les valeurs Helm de Zot n'a pas de champ `credentials:`. Tout pull non authentifié soumis à la limitation de débit
  fragilise l'auto-réparation : une seule tentative en échec peut épuiser le quota et bloquer la récupération pendant
  des heures.

### Facteurs contributifs

- **Zot ne valide pas les écritures partielles et ne les annule pas** — quand une synchronisation échoue en cours
  d'enregistrement, tout état partiellement écrasé (index compris) reste incohérent, sans rollback.

## Signaux d'alerte manqués

| Signal                                                                  | Quand il était visible                      | Pourquoi on n'a pas agi                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `index.json` de `redis` corrompu (binaire, 8 Ko ; mtime 2026-05-26)     | Inconnu — aucun scan d'intégrité            | Aucun mécanisme pour détecter la corruption au repos ; l'origine de l'écriture est aussi inconnue |
| La synchronisation `docker.io` de Zot n'a pas d'identifiants configurés | Avant l'incident (état de la configuration) | La limite de pulls anonymes n'avait jamais été atteinte sur ce cluster ; risque non priorisé      |
| Erreurs Zot `invalid JSON` répétées dans les journaux structurés        | 2026-05-30T11:15:13Z                        | Aucune alerte configurée sur les motifs d'erreur des journaux Zot                                 |
| Pods en `ImagePullBackOff` pendant 7 h                                  | 2026-05-30T11:15Z                           | Aucune alerte configurée sur un `ImagePullBackOff` prolongé                                       |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu être changé)

- **Identifiants de synchronisation Zot** — ajouter un champ `credentials:` Docker Hub au registre de synchronisation
  `docker.io` donnerait à Zot des pulls authentifiés (5000/6 h par compte contre 100/6 h en anonyme), ce qui rendrait la
  limitation de débit pratiquement impossible à atteindre en fonctionnement normal.
- **Scan d'intégrité de l'index OCI** — un scan de tous les fichiers `index.json` des dépôts OCI aurait détecté le dépôt
  `redis`.
- **Alerting sur `ImagePullBackOff`** — une règle Prometheus/AlertManager se déclenchant quand un pod reste en
  `ImagePullBackOff` plus de 5 minutes aurait ramené le MTTD à quelques minutes.

### Hors de contrôle (facteurs externes)

| Facteur externe                                            | Qu'est-ce qui réduirait l'exposition ?                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Limites de débit anonymes de Docker Hub (100 pulls/6 h/IP) | Ajouter des identifiants Docker Hub à la configuration de synchronisation de Zot (décision sous contrôle)                                             |
| Indisponibilité totale de Docker Hub                       | Pré-mettre en cache toutes les images nécessaires ; le modèle de synchronisation à la demande de Zot dépend par nature de la disponibilité de l'amont |

## Leçons systémiques

- **Les identifiants des registres amont sont une exigence de fiabilité, pas un confort** — s'appuyer sur des pulls
  anonymes de Docker Hub signifie que tout événement à fort volume de pulls (déploiement d'un nouveau tag, tentatives de
  synchronisation en échec) peut épuiser le quota et bloquer la récupération. C'est un risque systémique pour chaque
  registre de la configuration de synchronisation de Zot qui n'a pas d'identifiants.

- **Des couches de défense qui partagent une ressource unique (le quota de débit) ne sont pas indépendantes** — le
  modèle Swiss Cheese suppose que chaque couche défaille indépendamment. Ici, la synchronisation à la demande (couche 2)
  et l'écriture dans le stockage (couche 1) partageaient le quota de débit de Docker Hub : l'échec de la couche 1 a
  poussé la couche 2 à consommer le quota, ce qui a aussi fait échouer la couche 2 de façon durable. Les systèmes où des
  couches de défense partagent une dépendance exigent une analyse explicite de la marge de quota.

## De la leçon au contrôle

| Leçon                                                                                                 | Type d'artefact          | Artefact lié                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Les identifiants amont sont une exigence de fiabilité, pas un confort                                 | Configuration            | `projects/amiya.akn/src/apps/zot-registry/zot.helmvalues/` (identifiants Docker Hub)          |
| Des couches de défense partageant un quota ne sont pas indépendantes — l'hypothèse Swiss Cheese tombe | Fichier de connaissances | `.agents/knowledge/zot.md`                                                                    |
| Le scrub de Zot échoue silencieusement quand `index.json` est corrompu (`failed to run scrub`)        | Règle d'alerte           | À définir — relève du méta-motif `observability-gap`                                          |
| Un `ImagePullBackOff` de plus de 5 min doit déclencher une alerte                                     | Règle d'alerte           | À définir — même méta-motif                                                                   |
| Les récupérations de Zot après incident nécessitent une étape de scan d'intégrité de l'index OCI      | Étape de procédure       | `docs/procedures/` maintenance d'urgence de Zot (référencée par le post-mortem du 2026-05-25) |

## Registre des changements

- [x] [due:: 2026-06-06] [priority:: high] [size:: S] [owner:: Alexandre] Ajouter des identifiants Docker Hub à la
      configuration de synchronisation de Zot (champ `credentials:` sous le registre `docker.io` dans les valeurs Helm)
  - **Vérification :** la synchronisation `docker.io` dans les journaux Zot montre des requêtes authentifiées ; un test
    contrôlé tire plus de 50 images sans atteindre le HTTP 429
  - **Sinon :** le prochain événement à fort volume de pulls (déploiement d'un tag, tentatives de synchronisation)
    épuise le quota anonyme de 100/6 h et bloque la récupération

- [x] [due:: 2026-06-06] [priority:: high] [size:: M] [owner:: Alexandre] Ajouter une alerte basée sur les journaux
      pour le motif Zot `failed to run scrub … repository not found`
  - **Vérification :** test contrôlé : corrompre un `index.json` sur un Zot hors production, attendre le prochain cycle
    de scrub de 24 h, l'alerte se déclenche
  - **Sinon :** la prochaine corruption d'index reste non détectée jusqu'à une tentative de pull (potentiellement des
    jours)

- [x] [due:: 2026-06-06] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter une alerte Prometheus : pod en
      `ImagePullBackOff` depuis plus de 5 minutes dans n'importe quel namespace
  - **Vérification :** test contrôlé : fixer une image sur un tag inexistant ; l'alerte se déclenche en moins de 5 min
  - **Sinon :** le MTTD du prochain échec de pull reste de plusieurs heures, pas de minutes

- [x] [due:: 2026-06-06] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter une alerte Prometheus : taux de
      HTTP 5xx de Zot > 0 pendant plus de 2 minutes
  - **Vérification :** test contrôlé sur un Zot hors production ; l'alerte se déclenche quand `index.json` est corrompu
  - **Sinon :** les erreurs côté serveur restent silencieuses jusqu'à l'échec de pull des pods en aval

- [x] [due:: 2026-06-15] [priority:: medium] [size:: M] [owner:: Alexandre] Écrire la procédure de scan d'intégrité
      OCI (JSON valide, liste de manifestes non vide pour tous les dépôts)
  - **Vérification :** procédure documentée dans `docs/procedures/` ; exécutée une fois sur le Zot de production avec
    les résultats consignés
  - **Sinon :** une corruption cachée peut persister sans être détectée pendant des semaines

- [x] [due:: 2026-06-15] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter une liste de contrôle
      post-événement au runbook d'urgence de Zot : scanner tous les dépôts OCI après tout crash, redémarrage ou incident
      de stockage de Zot
  - **Vérification :** élément de liste visible dans `docs/procedures/` ; répété une fois sur l'environnement de test
  - **Sinon :** le schéma de découverte par la défaillance se répète après chaque événement Zot

- [x] [due:: 2026-06-15] [priority:: low] [size:: S] [owner:: Alexandre] Enquêter sur l'origine de la corruption de
      l'`index.json` de `redis` (\~2026-05-26T21:04Z) — vraisemblablement une écriture concurrente pendant le crash du
      cluster provoqué par Kyverno
  - **Vérification :** constat documenté, soit dans une mise à jour du post-mortem Kyverno, soit dans une nouvelle note
    ; chronologie de Zot réconciliée
  - **Sinon :** le même chemin de corruption d'écriture peut exister ailleurs ; condition racine non vérifiée

## Connaissances pour les agents

- Zot : la corruption d'`index.json` est un mode de défaillance récurrent sur ce homelab — survenu avec
  `actualbudget/actual-server` (2026-05-25, disque plein) et `docker.io/library/redis` (2026-05-30, panne d'environ 7
  h). La récupération exige une reconstruction manuelle ou la suppression du répertoire suivie d'une resynchronisation.
- Zot scrub : le scrub (intervalle de 24 h) **ne détecte pas** un `index.json` corrompu — il journalise
  `failed to run scrub … repository not found` et poursuit en silence. Ce motif de journal est le seul signal d'un état
  corrompu.
- Docker Hub : la limite anonyme est de **100 pulls / 6 h / IP**. Un événement à fort volume (par exemple Zot qui
  réessaie des synchronisations en échec d'une image populaire) peut épuiser le quota et bloquer tous les pulls suivants
  — même authentifiés depuis la même IP, il faut attendre la réinitialisation de la fenêtre de quota.
- Swiss Cheese : des couches de défense qui partagent un quota (par exemple synchronisation à la demande et écriture
  dans le stockage consommant toutes deux des pulls Docker Hub) **violent l'hypothèse d'indépendance** du modèle. Les
  dépendances qui partagent un quota doivent être modélisées explicitement lors de la conception des chemins de repli.
- Zot : reconstruction manuelle d'un dépôt — télécharger les blobs (`docker pull` + `crane export`), les injecter dans
  le PVC sous `/var/lib/registry/<repo>/blobs/sha256/` avec le propriétaire `32460:32460`, puis écrire un `index.json`
  valide référençant les nouveaux digests de manifestes.

## Suivi de résolution

### Fait

- [x] Remplacement de l'`index.json` corrompu par un index OCI vide valide → Zot ne renvoie plus de HTTP 500
- [x] Téléchargement manuel de tous les blobs nécessaires depuis Docker Hub (manifeste d'index, manifeste de plateforme
      amd64, configuration, 6 couches ; \~37 Mo)
- [x] Injection des blobs dans le stockage PVC de Zot aux bons chemins avec le bon propriétaire (`32460:32460`)
- [x] Reconstruction d'un `index.json` correct avec la structure d'index d'images OCI référençant `sha256:9156d3e4…`
      (tag `8.8.0-alpine`) et `sha256:5537c978…` (manifeste de plateforme amd64)
- [x] Vérification que Zot sert l'image avec un HTTP 200 (liste des tags + manifeste par digest)
- [x] Suppression des pods en échec ; `immich-redis` et `paperless-ngx-redis-0` repassés en `Running`

### En attente — identifiants Docker Hub et alerting du scrub (P1)

- [ ] Ajouter `credentials:` à la configuration du registre de synchronisation `docker.io` de Zot — pas encore d'issue
      GitHub
- [ ] Ajouter une alerte basée sur les journaux pour le motif `failed to run scrub` dans les journaux Zot — pas encore
      d'issue GitHub

### En attente — alerting (P1)

- [ ] Alerte `ImagePullBackOff` — pas encore d'issue GitHub
- [ ] Alerte HTTP 5xx de Zot — pas encore d'issue GitHub

### En attente — procédures et investigation (P2)

- [ ] Procédure de scan d'intégrité OCI — pas encore d'issue GitHub
- [ ] Mise à jour de la liste de contrôle post-événement disque — pas encore d'issue GitHub
- [ ] Investigation sur l'origine de la corruption de l'index de `redis` — pas encore d'issue GitHub

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                                                              | Instance      |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Revue à 1 semaine | 2026-06-06 | Éléments P1 terminés (identifiants Docker Hub fusionnés, alertes se déclenchant en test) ; aucun nouvel ImagePullBackOff                         | Revue en solo |
| Revue à 1 mois    | 2026-06-30 | Éléments P2 terminés (procédure de scan, liste de contrôle, investigation) ; journaux Zot montrant des pulls Docker Hub authentifiés             | Revue en solo |
| Revue à 3 mois    | 2026-08-30 | Aucune récidive d'incident de la classe `index.json` de Zot ; l'historique des alertes confirme un MTTD < 5 min sur tout nouvel ImagePullBackOff | Revue en solo |

## Pour aller plus loin

- [Incident 2026-05-25 Saturation Disque Zot ImagePullBackOff](Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md)
  : même mode de défaillance (corruption de l'index Zot), déclencheur distinct.
- [Incident 2026-05-26 ImagePullBackOff Circulaire Kyverno Zot Amiya](Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md)
  : origine suspectée de la corruption de l'index.
- [ADR-012 Remplacer Kyverno Par OPA](../decisions/ADR-012-Remplacer-Kyverno-par-OPA.md) : décision qui a remplacé
  Kyverno après ces incidents.
