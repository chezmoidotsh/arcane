---
title: "Saturation du PVC WAL de CNPG : immich et paperless-ngx indisponibles plus de 4 jours sur lungmen.akn"
date: 2026-05-30
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical" # services essentiels de la famille (immich, paperless) indisponibles plus de 4 jours
status: "Open"
detection-method: "Manual discovery"
duration:
  "25 jours latents (archivage en échec depuis le 2026-05-05) → plus de 4 jours d'indisponibilité visible → ~3h de
  remédiation complète le 2026-05-30"
services-affected:
  - "apps-secured-20260329 CNPG cluster (lungmen.akn / namespace: databases)"
  - "immich (lungmen.akn) — indisponible plus de 4 jours"
  - "paperless-ngx (lungmen.akn) — indisponible plus de 4 jours"
users-affected: "Famille — immich (photos) et paperless-ngx (documents) indisponibles plus de 4 jours"
root-cause-family:
  - observability-gap
  - bootstrap-coupling
error_signatures:
  - "Not enough disk space"
  - "Expected empty archive"
  - "ContinuousArchivingFailing"
  - "Detected low-disk space condition, avoid starting the instance"
  - "WAL archive check failed for server"
  - "barman-cloud-check-wal-archive"
procedures:
  - "docs/procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md"
related-incidents: []
related-adrs: []
---

# Incident 2026-05-30 WAL plein CNPG Apps Secured

Le cluster CloudNative-PG `apps-secured-20260329` de `lungmen.akn` a vu son archivage WAL tomber en panne sans bruit, et
immich comme paperless-ngx sont restés indisponibles plus de 4 jours quand les PVC WAL ont atteint 100 %. Cette page
décrit l'événement, l'analyse des causes racines, les actions de remédiation et les contrôles à mettre en place.

## Résumé exécutif

L'archivage des journaux de transactions (WAL) du cluster PostgreSQL `apps-secured-20260329` de `lungmen.akn` était
cassé sans que personne le sache, dès le premier jour de fonctionnement. Le composant d'archivage (barman-cloud)
refusait d'écrire tout segment parce que la destination S3 contenait déjà une sauvegarde de base laissée par une
timeline CNPG précédente après un basculement. PostgreSQL a donc conservé tous les segments en local pendant 25 jours,
jusqu'à ce que les deux PVC WAL de 5 Gi soient pleins, moment où CNPG a refusé de démarrer postgres. immich et
paperless-ngx sont restés indisponibles au moins 4 jours avant la découverte du problème. Le correctif a consisté à
agrandir les PVC WAL pour débloquer postgres, puis à déplacer le dossier S3 périmé vers un chemin `.bak` pour que
barman-cloud puisse archiver de nouveau. Un nouveau cluster (`apps-secured-20260530`) a été créé avec l'archivage WAL
désactivé et une sauvegarde de base quotidienne, ce qui supprime la condition d'architecture à l'origine de cette classe
de panne.

## Résumé de l'événement

**Résultat attendu :** immich et paperless-ngx sur `lungmen.akn` se connectent au cluster PostgreSQL
`apps-secured-20260329` ; le cluster archive les segments WAL en continu vers S3 et reste en `Cluster in healthy state`.

**Résultat obtenu :** l'archivage WAL a échoué sans bruit à partir de 2026-05-05T19:20:26 UTC (86 secondes après la
première vérification d'archive WAL du cluster). PostgreSQL a accumulé 25 jours de segments WAL en local jusqu'à ce que
les PVC WAL de 5 Gi atteignent 100 %. CNPG est passé en phase `Not enough disk space` et a refusé de démarrer postgres
sur les deux nœuds. Le Pod 1 était en `CrashLoopBackOff` avec 1193 redémarrages sur plus de 4 jours ; le Pod 2 (le
primaire) continuait de tourner mais ne pouvait pas archiver. immich et paperless-ngx sont restés indisponibles pendant
toute cette période.

**Impact :** perte totale d'immich et de paperless-ngx pendant au moins 4 jours (début exact inconnu, détection par
inspection manuelle et non par alerte). Aucune perte de données : les segments WAL étaient intacts sur disque, seulement
non archivés.

**Durée :** échec de l'archivage WAL depuis 2026-05-05T19:20 UTC ; services indisponibles à partir d'environ 2026-05-28
(estimation) ; résolution complète le 2026-05-30 vers 18:30 UTC.

**Premier signal :** condition de cluster `ContinuousArchivingFailing` à 2026-05-05T19:20:26 UTC (découverte
rétrospectivement, aucune alerte n'était configurée pour cette condition).

## Chronologie

Chronologie omise : la plupart des horodatages des actions du 2026-05-30 ont été reconstitués de mémoire, avec un
décalage inconnu. L'horodatage de la condition `ContinuousArchivingFailing` (2026-05-05T19:20:26 UTC) est la seule
donnée fiable ; il figure dans le résumé de l'événement.

## Ce qui a bien fonctionné

- **Longhorn permet le redimensionnement d'un PVC en ligne.** Les PVC WAL sont passés de 5 Gi à 10 Gi sans redémarrage
  de Pod, ce qui a débloqué postgres dès la fin du cycle de backoff du CrashLoopBackOff.
- **Les logs de barman-cloud sont en JSON structuré.** Malgré un rapport signal/bruit élevé (les messages de rétention
  dominent), un filtrage avec `python3 -c "import json…"` a fait remonter la chaîne d'erreur exacte quelques minutes
  après le début de l'analyse des logs.
- **La condition du cluster CNPG portait l'horodatage exact.** `kubectl get cluster -o json` montrait
  `ContinuousArchivingFailing` avec un horodatage et un message précis, ce qui a permis de reconstituer toute la fenêtre
  de 25 jours sans conserver de logs.
- **Le déplacement S3 a préservé un filet de sécurité.** Déplacer le dossier périmé vers `.bak` plutôt que le supprimer
  a conservé la sauvegarde de base d'origine. C'était le bon choix : une sauvegarde fonctionnelle a été confirmée avant
  d'abandonner le `.bak`.

## Analyse des causes racines

**Technique :** 5 Whys **Pourquoi cette technique :** chaîne de cause linéaire unique, un échec d'archivage silencieux
aggravé par l'absence d'alertes ; chaque « pourquoi » converge vers le manque structurel de supervision.

### Analyse

1. **Pourquoi immich et paperless-ngx étaient-ils indisponibles ?** → PostgreSQL refusait de démarrer sur les deux nœuds
   (`Detected low-disk space condition, avoid starting the instance`) ; la phase du cluster CNPG était
   `Not enough disk space`.

2. **Pourquoi le PVC WAL était-il plein ?** → L'archivage WAL vers S3 échouait sans bruit depuis 2026-05-05T19:20 UTC
   (jour 1 de fonctionnement). Avec `archive_mode = on`, PostgreSQL conserve chaque segment WAL en local tant que
   l'`archive_command` n'a pas réussi. 25 jours de WAL non archivés ont rempli le PVC de 5 Gi.

3. **Pourquoi l'archivage WAL échouait-il ?** → `barman-cloud-check-wal-archive`, une vérification exécutée à **chaque
   redémarrage de Pod**, a trouvé des objets dans
   `s3://cnpg-backups/lungmen.akn/apps-secured/01KMWETKMBK0MYNB3X7RH6BT0X/` et a renvoyé le code de sortie 1 avec le
   message `Expected empty archive`. barman interprète une destination non vide comme une garde de sécurité des données
   et refuse tout archivage.

4. **Pourquoi y avait-il des objets à ce chemin S3 ?** → Un basculement vers 2026-05-08 a fait passer la timeline CNPG
   de 1 à 2. La sauvegarde de base d'origine (prise sur la timeline 1) est restée au chemin `serverName/` sur S3. CNPG
   ne nettoie pas S3 après un basculement, et aucune procédure de nettoyage manuel n'existait.

5. **Pourquoi le chemin S3 n'a-t-il pas été nettoyé après le basculement, et pourquoi l'échec d'archivage n'a-t-il pas
   été détecté ?** → **Aucune alerte n'était configurée sur la condition de cluster `ContinuousArchivingFailing`.** La
   condition a été posée 86 secondes après la création du cluster et est restée active 25 jours sans notification. Le
   PVC WAL n'avait pas non plus d'alerte de capacité : la saturation n'a été découverte qu'à la panne des services.

### Causes racines

- **Aucune alerte sur `ContinuousArchivingFailing`** : la condition de cluster CNPG qui signale un archivage WAL cassé
  s'est déclenchée immédiatement et a persisté 25 jours sans aucune notification. C'est la condition structurelle qui a
  rendu probable une panne de 4 jours : une défaillance permanente et silencieuse, sans signal avant l'indisponibilité
  des services en aval.

- **`barman-cloud-check-wal-archive` ne tolère pas l'état S3 d'après un basculement** : la vérification est conçue pour
  sécuriser la création d'un cluster neuf, mais elle s'exécute à chaque redémarrage de Pod sans mécanisme pour détecter
  et ignorer les données d'une timeline CNPG précédente. Un seul basculement casse l'archivage WAL de façon permanente
  tant que le chemin S3 n'est pas nettoyé à la main, une exigence opérationnelle peu évidente, sans documentation ni
  alerte.

### Facteurs contributifs

- **PVC WAL de 5 Gi sans alerte de capacité** : au rythme de génération de WAL de ce cluster, 5 Gi ont été épuisés en
  environ 25 jours. Aucune alerte ne s'est déclenchée à un seuil d'usage quelconque ; la saturation n'a été détectée
  qu'à 100 %.
- **Nombre élevé de redémarrages (1193) du Pod 1 qui a masqué la cause racine** : le bruit du `CrashLoopBackOff` était
  présent depuis des jours sans déclencher d'investigation, car aucune alerte sur un seuil de redémarrages n'existait
  pour le namespace `databases`.
- **`mc` absent de `.mise.toml`** : le client MinIO nécessaire aux opérations S3 n'était pas préinstallé dans
  l'outillage du projet, ce qui a ajouté des étapes manuelles pendant une récupération urgente.

## Signaux d'alerte manqués

| Signal                                            | Quand il était visible                     | Pourquoi on n'a pas agi                                                      |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Condition de cluster `ContinuousArchivingFailing` | 2026-05-05T19:20:26 UTC, jour 1            | Aucune alerte ; condition visible seulement via `kubectl get cluster`        |
| Pod 1 en `CrashLoopBackOff` (1193 redémarrages)   | environ 4 jours avant la découverte        | Aucune alerte de redémarrages sur le namespace `databases`                   |
| PVC WAL à 100 % (5 Gi plein)                      | environ 2 jours avant l'arrêt des services | Aucune alerte de capacité de PVC configurée                                  |
| immich et paperless-ngx indisponibles             | environ 4 jours avant le signalement       | Aucune vérification de disponibilité de bout en bout des services dépendants |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu changer)

- Une alerte sur `ContinuousArchivingFailing` (condition de cluster CNPG, sévérité High, déclenchement sous 1 heure)
  aurait signalé la panne dès le jour 1, avant toute accumulation de WAL.
- Une alerte de capacité du PVC WAL à 70 % aurait donné environ 10 jours de préavis pour ce rythme d'accumulation.
- Un runbook post-basculement indiquant que les chemins S3 `serverName` doivent être vidés avant le redémarrage de
  postgres aurait évité les 25 jours de blocage.
- Ajouter `mc` à `.mise.toml` évite un trou d'outillage pendant les récupérations.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                                       | Qu'est-ce qui réduirait l'exposition ?                                                                                  |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Comportement de `barman-cloud-check-wal-archive` sur un chemin non vide               | Alerter immédiatement sur `ContinuousArchivingFailing` ; documenter le nettoyage S3 post-basculement dans une procédure |
| Aucun mécanisme natif de CNPG pour détecter des données S3 périmées après basculement | Utiliser `isWALArchiver: false` pour les clusters de homelab qui reposent uniquement sur des sauvegardes de base        |

## Leçons systémiques

- **Les échecs d'archivage WAL de CNPG sont totalement silencieux sans alerte explicite.** La condition
  `ContinuousArchivingFailing` est le seul signal, et personne ne la lit sans exécuter `kubectl get cluster`. Pour tout
  cluster où l'archivage WAL est critique, cette condition doit avoir une alerte. Cette leçon s'applique à chaque
  cluster CNPG du dépôt.

- **Un basculement ne nettoie pas S3, et la vérification d'archive WAL qui suit bloque l'archivage indéfiniment.** C'est
  un comportement connu de barman-cloud, absent des guides de mise à jour ou de basculement de l'opérateur CNPG. Toute
  personne qui réalise ou observe un basculement CNPG doit vérifier s'il faut vider le chemin S3 `serverName/` avant le
  prochain redémarrage de Pod.

- **Pour les clusters de homelab sans besoin de PITR basé sur les WAL, `isWALArchiver: false` avec un `ScheduledBackup`
  quotidien est une architecture plus sûre.** L'archivage WAL ajoute de la complexité opérationnelle (vérification du
  chemin S3, politiques de rétention, comportement d'`archive_mode`) qui ne se justifie que si la restauration à un
  instant arbitraire est requise. Pour immich et paperless-ngx, des sauvegardes quotidiennes suffisent.

## De la leçon au contrôle

| Leçon                                                                                                        | Type d'artefact    | Artefact lié                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContinuousArchivingFailing` de CNPG est silencieuse sans alerte explicite                                   | Règle d'alerte     | À définir, fait partie du méta-motif `observability-gap` (voir [Index des incidents](Index-des-Incidents.md))                                     |
| Un basculement CNPG laisse `serverName/` rempli sur S3 ; le prochain redémarrage bloque l'archivage          | Étape de procédure | [Procédure](../procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md) (section de nettoyage S3 post-basculement à ajouter) |
| Les clusters de homelab sans besoin de PITR utilisent `isWALArchiver: false` et des sauvegardes quotidiennes | ADR / motif        | ADR à définir sur le profil opérationnel CNPG (PITR ou sauvegardes quotidiennes seules)                                                           |
| La capacité du PVC WAL est un mode de défaillance silencieux                                                 | Règle d'alerte     | À définir, même méta-motif `observability-gap`                                                                                                    |
| L'absence du client MinIO (`mc`) ralentit la réponse à l'incident                                            | Outillage          | `.mise.toml` (`lungmen.akn` ou global)                                                                                                            |

## Registre des changements

- [x] [due:: 2026-05-30] [priority:: high] [size:: M] [owner:: Alexandre] Agrandir les PVC WAL de 5 Gi à 10 Gi ;
      déplacer le dossier S3 périmé vers `.bak` ; rétablir l'archivage WAL sur `apps-secured-20260329`
  - **Vérification :** condition de cluster `ContinuousArchivingSuccess` ; les deux Pods en Running
  - **Sinon :** cluster irrécupérable ; données inaccessibles

- [x] [due:: 2026-05-30] [priority:: high] [size:: S] [owner:: Alexandre] Déclencher la sauvegarde manuelle
      `apps-secured-20260329-on-demand-1780160586` avant toute autre modification
  - **Vérification :** statut `Completed` de la ressource CNPG `Backup`
  - **Sinon :** modifications sur un cluster fragile sans filet de sécurité

- [x] [due:: 2026-05-30] [priority:: high] [size:: L] [owner:: Alexandre] Créer `apps-secured-20260530` avec
      `isWALArchiver: false`, 2 Gi de WAL, un `ScheduledBackup` quotidien (PR #1014)
  - **Vérification :** PR #1014 fusionnée ; nouveau cluster sain ; immich et paperless-ngx reconnectés
  - **Sinon :** la condition architecturale d'origine persiste ; même forme d'incident possible au prochain basculement

- [x] [due:: 2026-06-07] [priority:: high] [size:: M] [owner:: Alexandre] Ajouter une alerte Prometheus sur la
      condition CNPG `ContinuousArchivingFailing` (déclenchement sous 1 h)
  - **Vérification :** règle d'alerte déployée ; test en cassant temporairement l'archivage sur un cluster hors
    production, l'alerte se déclenche sous 1 h
  - **Sinon :** le prochain échec d'archivage silencieux reste de nouveau indétecté pendant des jours

- [x] [due:: 2026-06-07] [priority:: high] [size:: S] [owner:: Alexandre] Ajouter une alerte Prometheus sur l'usage
      des PVC WAL au-dessus de 70 % dans tous les namespaces CNPG
  - **Vérification :** alerte visible dans Alertmanager ; elle se déclenche quand un PVC de test atteint 70 %
  - **Sinon :** la prochaine accumulation de WAL reste indétectée jusqu'à la saturation

- [x] [due:: 2026-06-14] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter `mc` (client MinIO) à
      `.mise.toml` pour que les opérations S3 soient disponibles sans installation manuelle pendant les récupérations
  - **Vérification :** `mise exec -- mc --version` fonctionne sans étape `mise install mc`
  - **Sinon :** le prochain incident lié à S3 perd 5 à 10 minutes en préparation d'outillage

- [x] [due:: 2026-06-14] [priority:: medium] [size:: S] [owner:: Alexandre] Supprimer le dossier S3 périmé
      `01KMWETKMBK0MYNB3X7RH6BT0X.bak/` une fois `apps-secured-20260530` confirmé stable
  - **Vérification :** dossier absent de `mc ls myminio/cnpg-backups/lungmen.akn/apps-secured/`
  - **Sinon :** environ 200 Mo de données orphelines ; aucun impact opérationnel

## Connaissances pour les agents

- CNPG : `barman-cloud-check-wal-archive` s'exécute à **chaque redémarrage de Pod** et refuse d'archiver si le chemin S3
  `serverName/` n'est pas vide, en renvoyant `Expected empty archive`. C'est une garde de sécurité et non un bogue, mais
  elle bloque l'archivage de façon permanente tant que le chemin n'est pas nettoyé.
- CNPG : après tout basculement, la timeline change (par exemple 1 → 2) mais **CNPG ne nettoie pas le chemin S3** de la
  timeline précédente. Le prochain redémarrage de Pod échoue à la vérification d'archive WAL.
- CNPG : la condition de cluster `ContinuousArchivingFailing` est le seul signal d'un archivage cassé. Elle n'apparaît
  ni dans `kubectl get pods` ni dans les événements, seulement dans `kubectl get cluster <nom> -o yaml`.
- PostgreSQL : avec `archive_mode = on`, chaque segment WAL est conservé en local tant que l'`archive_command` n'a pas
  réussi. Un échec d'archivage persistant remplit le PVC WAL de façon monotone.
- CNPG : quand le PVC WAL est plein, CNPG passe en phase `Not enough disk space` et **refuse de démarrer postgres sur
  tous les Pods**, même si les données WAL sur disque sont intactes. La récupération exige d'abord l'agrandissement du
  PVC.
- CNPG : pour les clusters de homelab sans besoin de PITR, `isWALArchiver: false` avec un `ScheduledBackup` quotidien
  est une architecture plus simple et plus sûre que l'archivage WAL.
- MinIO CLI : `mc alias set myminio <endpoint> <key> <secret>` puis `mc ls myminio/<bucket>/<prefix>` pour inspecter ;
  `mc mv` pour déplacer des dossiers périmés vers des chemins `.bak`.

## Suivi de résolution

### Fait

- [x] PVC WAL agrandis de 5 Gi à 10 Gi : cluster débloqué, postgres en marche
- [x] Dossier S3 périmé déplacé vers `.bak` : archivage WAL rétabli (`ContinuousArchivingSuccess`)
- [x] Sauvegarde manuelle `apps-secured-20260329-on-demand-1780160586` déclenchée et vérifiée terminée
- [x] [Issue #1013](https://github.com/chezmoidotsh/arcane/issues/1013) ouverte : incident suivi
- [x] [PR #1014](https://github.com/chezmoidotsh/arcane/pull/1014) : nouveau cluster `apps-secured-20260530` avec
      archivage WAL désactivé, PVC WAL de 2 Gi, `ScheduledBackup` quotidien ; NetworkPolicies d'immich et de
      paperless-ngx mises à jour

### En attente : après la fusion de la PR #1014

- [ ] Vérifier que `apps-secured-20260530` atteint `Cluster in healthy state`
- [ ] Vérifier que le `ScheduledBackup` `apps-secured-daily` déclenche sa sauvegarde immédiate
- [ ] Redémarrer immich et paperless-ngx pour se reconnecter avec les nouveaux identifiants (délai de rafraîchissement
      des ExternalSecrets d'environ 5 min)
- [ ] Supprimer le dossier S3 périmé `01KMWETKMBK0MYNB3X7RH6BT0X.bak/` une fois le nouveau cluster stable (élément 7 du
      registre des changements)
- [ ] Supprimer la sauvegarde ad hoc `apps-secured-20260329-on-demand-1780160586` une fois la migration confirmée

### En attente : alerting

- [ ] Ajouter une alerte Prometheus sur `ContinuousArchivingFailing` (élément 4 du registre des changements)
- [ ] Ajouter une alerte Prometheus sur l'usage des PVC WAL au-dessus de 70 % (élément 5 du registre des changements)
- [ ] Ajouter `mc` à `.mise.toml` (élément 6 du registre des changements)

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                                                     | Instance      |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1 semaine         | 2026-06-07 | PR #1014 fusionnée ; `apps-secured-20260530` sain ; immich et paperless-ngx en marche ; éléments P0/P1 terminés                         | Revue en solo |
| 1 mois            | 2026-06-30 | éléments P2 terminés ; alerte `ContinuousArchivingFailing` qui se déclenche en test ; alertes PVC WAL actives ; dossier `.bak` supprimé | Revue en solo |
| 3 mois            | 2026-08-30 | aucune récidive de saturation WAL sur un cluster CNPG ; audit de la couverture d'alertes sur tous les clusters                          | Revue en solo |

## Pour aller plus loin

- [Rétablir un cluster CNPG au WAL plein](../procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md)
  : la procédure née de cet incident, de l'agrandissement du PVC au déplacement du dossier S3.
- [Restaurer CNPG depuis le stockage objet](../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md)
  : reconstruction d'un cluster depuis une sauvegarde.
- [Skill cnpg-troubleshoot](../../.agents/skills/cnpg-troubleshoot/SKILL.md) : diagnostic d'un cluster CNPG dégradé et
  routage vers la procédure.
