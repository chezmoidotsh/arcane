---
title:
  "Saturation du PVC WAL de la base Grafana sur rhodes.akn : Secret de sauvegarde absent après un changement de
  namespace"
date: 2026-11-12
author: "[anthropic:claude-opus-5-5]"
participants:
  - "Alexandre"
  - "[anthropic:claude-opus-5-5]"
  - "[system:argocd]"
  - "[system:cloudnative-pg]"
severity: "High" # Grafana indisponible plus de 30 min, moi seul touché. La suppression de la base est un choix de reprise
# volontaire sur une base de 10 h dont le contenu vient de Git ou de la connexion OIDC, pas une perte subie.
status: "Open"
detection-method: "Manual discovery"
duration:
  "~4h50 latent (archivage WAL en échec dès le bootstrap) → ~5h40 d'indisponibilité de la base → ~4 min de remédiation"
services-affected:
  - "grafana-database CNPG cluster (rhodes.akn / namespace: o11y)"
  - "Grafana (rhodes.akn) — o11y.chezmoi.sh"
users-affected: "moi seul"
root-cause-family:
  - bootstrap-coupling
  - observability-gap
error_signatures:
  - "Not enough disk space"
  - "Detected low-disk space condition"
  - "ContinuousArchivingFailing"
  - 'while getting secret cnpg-backup-credentials: secrets "cnpg-backup-credentials" not found'
  - "Instances are present, but none have reported a system ID."
procedures:
  - "docs/procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md"
related-incidents:
  - path: "docs/incidents/Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md"
    relation: "Même forme : archivage WAL en échec silencieux puis PVC WAL plein ; l'alerte promise n'existe plus"
related-adrs:
  - "ADR-013"
related-issues: []
---

# Incident 2026-11-12 WAL plein CNPG Grafana Secret manquant

Le cluster CloudNative-PG `grafana-database` de `rhodes.akn` n'a jamais pu archiver ses WAL après son déplacement du
namespace `o11y-system` vers `o11y` : le Secret `cnpg-backup-credentials` qu'il lit est écrit par Pulumi, et la stack
n'avait pas été réappliquée. Les WAL ont rempli le PVC de 1 Gi en moins de 5 h et Grafana est resté sans base jusqu'au
matin. Cette page décrit l'événement, sa cause et les contrôles qui manquent.

## Résumé exécutif

Grafana, l'outil qui affiche les métriques et les journaux du homelab, a cessé de fonctionner pendant la nuit. Sa base
de données s'est remplie de fichiers qu'elle aurait dû envoyer vers le stockage de sauvegarde, parce que la clé d'accès
à ce stockage n'avait pas été recréée lors d'un déménagement de l'application. Aucune alerte n'a prévenu, ni de l'échec
des envois, ni du disque qui se remplissait. La clé a été recréée et la base, âgée de 10 heures, a été reconstruite à
neuf.

## Résumé de l'événement

**Résultat attendu :** après la PR #1494 (déplacement de Grafana de `infrastructure/` vers `apps/`, namespace `o11y`),
le cluster `grafana-database` archive ses WAL dans `s3://cnpg-rhodes-akn/grafana` sous le nom de serveur
`grafana-database-o11y` ; le PVC WAL de 1 Gi reste presque vide.

**Résultat obtenu :** la condition `ContinuousArchiving` est passée à `False` 51 s après le bootstrap, avec le message
`while getting secret cnpg-backup-credentials: secrets "cnpg-backup-credentials" not found`. Aucun WAL n'est sorti du
PVC. Vers 02:07 UTC, l'instance manager a refusé de redémarrer postgres (`Detected low-disk space condition`), le
cluster est passé en phase `Not enough disk space`, et le Pod a enchaîné 69 redémarrages en `CrashLoopBackOff`.

**Impact :** Grafana sans base (Pod `0/1`) de 02:07 à 07:49 UTC. L'accès public `o11y.chezmoi.sh` était aussi coupé : la
cible Pangolin, gérée par la même stack Pulumi, visait encore `grafana-service.o11y-system`. Aucune sauvegarde de la
base n'existait (archivage en échec, `ScheduledBackup` en `@weekly` pas encore déclenché). La base a été supprimée et
reconstruite ; son contenu (10 h, tableaux de bord et sources de données provisionnés depuis Git, comptes recréés par
`allow_sign_up` à la connexion OIDC) n'a pas été conservé.

**Durée :** de 2026-11-11T21:17:07 (premier échec d'archivage) à 2026-11-12T07:49:49 (Grafana `Ready`).

**Premier signal :** la condition `ContinuousArchiving=False` du `Cluster`, visible dès 2026-11-11T21:17:07, que rien ne
surveille.

## Chronologie

<!-- skew: exact pour [system:cloudnative-pg] (lastTransitionTime des conditions du Cluster), l'heure du commit
(git show %cI), la fusion de la PR (gh, mergedAt) et [system:pulumi] (pulumi stack history) ; ±1m pour la demande
d'Alexandre (horodatage du message de session, 08:43 CET). L'heure de suppression du namespace o11y-system n'est pas
connue. -->

| Heure (UTC)          | Acteur                       | Événement ou décision                                                                                                                      |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-19T20:33:40  | \[system:pulumi]             | Dernière application de la stack `rhodes_akn.live` avant l'incident ; l'état contient le Secret `cnpg-backup-credentials-o11y-system`      |
| 2026-11-11T21:08:47  | Alexandre                    | Commit `f7faa4fa8` : déplacement de Grafana vers `apps/`, `o11y-system` → `o11y` dans `cloudnative-pg.ts` et dans la cible Pangolin        |
| 2026-11-11T21:13:48  | Alexandre                    | Fusion de la PR #1494 ; `pulumi up` n'est pas lancé                                                                                        |
| 2026-11-11T21:16:16  | \[system:cloudnative-pg]     | Bootstrap du nouveau cluster `grafana-database` dans `o11y` (`BootstrapCompleted`)                                                         |
| 2026-11-11T21:17:07  | \[system:cloudnative-pg]     | `ContinuousArchivingFailing` : `secrets "cnpg-backup-credentials" not found`                                                               |
| 2026-11-12T02:07:18  | \[system:cloudnative-pg]     | `Ready=False` : PVC WAL plein, phase `Not enough disk space`, début du `CrashLoopBackOff`                                                  |
| ±1m 2026-11-12T07:43 | Alexandre                    | Demande de réparer la base Grafana                                                                                                         |
| 2026-11-12T07:45:27  | \[anthropic:claude-opus-5-5] | `pulumi up` validé par Alexandre : création du Secret dans `o11y`, cible Pangolin corrigée                                                 |
| ±1m 2026-11-12T07:46 | \[anthropic:claude-opus-5-5] | Suppression du `Cluster` et de ses PVC (choix d'Alexandre contre l'agrandissement du PVC WAL), puis synchronisation de l'app ArgoCD `o11y` |
| 2026-11-12T07:46:36  | \[system:argocd]             | Nouveau `Cluster` `grafana-database` créé                                                                                                  |
| 2026-11-12T07:47:33  | \[system:cloudnative-pg]     | `Ready=True` (07:47:28) puis `ContinuousArchivingSuccess`                                                                                  |
| 2026-11-12T07:49:49  | \[system:kubernetes]         | Pod Grafana `Ready`                                                                                                                        |

## Ce qui a bien fonctionné

- **Le message de la condition nommait la cause.** `ContinuousArchiving` donnait le nom exact du Secret manquant : le
  diagnostic a pris quelques minutes, sans lire les journaux de barman.
- **`pulumi preview` a montré tout le reste de la dérive.** La même stack portait la cible Pangolin encore sur
  `o11y-system` : un seul `pulumi up` a réparé la base et l'accès public.
- **La garde d'espace disque de CNPG.** L'instance manager refuse de démarrer postgres sur un PVC WAL plein plutôt que
  de corrompre la base.
- **Le `serverName` dédié `grafana-database-o11y`.** Il évite l'erreur `Expected empty archive` de l'incident du
  2026-05-30 : une fois le Secret présent, l'archivage est reparti du premier coup.

## Analyse des causes racines

**Technique :** Swiss Cheese **Pourquoi cette technique :** la cause directe (Secret absent) est simple, mais trois
défenses indépendantes auraient chacune arrêté l'incident, et les trois ont manqué.

### Analyse

| Couche                        | Défense attendue                                                                     | Trou                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Déploiement                | Un changement de `projects/rhodes.akn/src/infrastructure/pulumi/` est appliqué       | Rien ne relie la fusion d'une PR à un `pulumi up` ; la PR #1494 touchait à la fois ArgoCD (appliqué seul) et Pulumi (jamais appliqué)    |
| 2. Ordre de démarrage         | Le Cluster ne démarre pas sans ses dépendances                                       | Le `Cluster` CNPG démarre sans le Secret de l'`ObjectStore` ; seul l'archivage échoue, la base fonctionne, l'app paraît saine            |
| 3. Supervision de l'archivage | Alerte sur `ContinuousArchivingFailing` (action cochée du post-mortem du 2026-05-30) | Aucune règle n'existe dans l'arbre ; aucun collecteur ne lit les métriques CNPG des clusters (ADR-013 : agents par cluster pas déployés) |
| 4. Supervision du disque      | Alerte sur un PVC WAL au-dessus de 70 % (même post-mortem)                           | Même trou : aucune règle, aucun collecteur                                                                                               |
| 5. Dimensionnement            | Un PVC WAL qui laisse plusieurs jours de marge                                       | 1 Gi rempli en moins de 5 h par une base Grafana neuve ; `max_slot_wal_keep_size` ne limite pas les WAL en attente d'archivage           |

### Causes racines

- **Le Secret de sauvegarde de `rhodes.akn` vit hors de GitOps, dans une stack Pulumi appliquée à la main.** Tout
  changement de namespace d'une app à base CNPG demande un `pulumi up` que ni la PR, ni ArgoCD, ni la CI ne déclenchent
  ou ne vérifient. Le choix est voulu (la base de OpenBao ne peut pas dépendre d'OpenBao, voir `cloudnative-pg.ts`),
  mais son coût n'est pas encodé dans le processus.
- **L'échec d'archivage WAL ne produit aucun signal.** Les alertes `ContinuousArchivingFailing` et WAL > 70 % annoncées
  comme faites après l'incident du 2026-05-30 n'existent plus dans le dépôt, et les clusters n'envoient pas leurs
  métriques au datastore o11y.

### Facteurs contributifs

- **Un PVC WAL de 1 Gi.** Il réduit la fenêtre entre l'échec et la panne à quelques heures ; plus grand, il aurait
  retardé la panne sans la supprimer.
- **Aucune sauvegarde initiale.** Le `ScheduledBackup` en `@weekly` sans `immediate: true` laisse une base neuve sans
  sauvegarde de base pendant jusqu'à 7 jours ; ici, la reprise ne pouvait pas restaurer.
- **Le changement a eu lieu le soir, suivi d'autres PR sur Grafana jusqu'à minuit**, sans relecture de l'état du cluster
  CNPG.

## Signaux d'alerte manqués

| Signal                                                       | Quand il était visible        | Pourquoi on n'a pas agi                                                                  |
| ------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------- |
| Condition `ContinuousArchiving=False` sur `grafana-database` | Dès 2026-11-11T21:17:07       | Sans visibilité : aucune alerte, la condition ne se lit qu'avec `kubectl get cluster -o` |
| `cloudnative-pg.ts` modifié dans la PR #1494                 | 2026-11-11, à la fusion       | Aucun rappel « appliquer Pulumi » dans la PR ni dans la CI                               |
| Action « alerte `ContinuousArchivingFailing` » du 2026-05-30 | Depuis la migration de l'o11y | Cochée comme faite, jamais revérifiée après le passage au datastore LXC (ADR-013)        |

Le dernier signal est un échec d'apprentissage entre post-mortems : la même forme d'incident revient parce qu'un
contrôle promis a disparu sans que rien ne le signale.

## Analyse du contrôle

### Sous contrôle (ce que nous aurions pu changer)

- Lancer `pulumi preview` sur la stack du projet après la fusion d'une PR qui touche `src/infrastructure/pulumi/`.
- Garder les alertes CNPG en vie lors de la migration de l'observabilité vers le datastore LXC.
- Déclencher une sauvegarde initiale à la création d'un cluster CNPG.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                          | Qu'est-ce qui réduirait l'exposition ?                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| CNPG démarre un `Cluster` sans vérifier les Secrets de son `ObjectStore` | Une alerte sur `ContinuousArchivingFailing` dans l'heure qui suit le bootstrap |

## Leçons systémiques

- **Une ressource Pulumi qui dépend d'un namespace ArgoCD se désynchronise en silence.** Troisième incident de la
  famille `bootstrap-coupling` (après le 2026-05-25 et le 2026-05-30) : la famille atteint le seuil de Pareto et appelle
  un projet structurel, pas un correctif de plus.
- **Un contrôle promis par un post-mortem peut disparaître sans bruit.** Les alertes de l'incident du 2026-05-30 sont
  cochées mais absentes ; la revue de suivi ne revérifie pas un contrôle après une migration de la plateforme qui le
  porte.

## De la leçon au contrôle

| Leçon                                 | Type d'artefact | Artefact lié (chemin / lien / « À définir »)                                                         |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Pulumi désynchronisé après une fusion | Test CI         | À définir : `pulumi preview` sur les stacks touchées, en échec si la stack a une dérive après fusion |
| Pulumi désynchronisé après une fusion | ADR             | À définir : traitement de la famille `bootstrap-coupling` (Pareto)                                   |
| Archivage WAL en échec silencieux     | Règle d'alerte  | À définir : collecte des métriques CNPG + alertes vmalert `ContinuousArchivingFailing` et WAL > 70 % |
| Base CNPG neuve sans sauvegarde       | Règle OPA       | À définir : `ScheduledBackup` avec `immediate: true` exigé dans `catalog/opa/`                       |

## Registre des changements

- [x] [due:: 2026-11-12] [priority:: high] [size:: S] [owner:: Alexandre] Appliquer la stack `rhodes_akn.live` (Secret
      `cnpg-backup-credentials` dans `o11y`, cible Pangolin de Grafana) et recréer `grafana-database`
  - **Vérification :** `ContinuousArchivingSuccess` et `Cluster in healthy state` sur `grafana-database` ; Pod Grafana
    `1/1`
  - **Sinon :** Grafana reste sans base

- [ ] [due:: 2026-11-13] [priority:: high] [size:: S] [owner:: Alexandre] Déclencher une sauvegarde à la demande de
      `grafana-database` (skill `cnpg-backup`) et passer son `ScheduledBackup` en `immediate: true`
  - **Vérification :** une ressource `backup.postgresql.cnpg.io` en `completed` existe dans `o11y`
  - **Sinon :** la prochaine panne de la base ne peut pas être restaurée

- [ ] [due:: 2026-11-26] [priority:: high] [size:: M] [owner:: Alexandre] Collecter les métriques CNPG de `rhodes.akn`
      et `lungmen.akn` vers le datastore o11y, avec des règles vmalert sur `ContinuousArchivingFailing` et sur l'usage
      des PVC WAL au-dessus de 70 %
  - **Vérification :** en retirant le Secret d'un cluster CNPG de test, une alerte arrive dans Alertmanager en moins
    d'une heure
  - **Sinon :** le prochain échec d'archivage reste invisible jusqu'à la panne, comme le 2026-05-30 et le 2026-11-12

- [ ] [due:: 2026-12-10] [priority:: medium] [size:: M] [owner:: Alexandre] Ajouter à la CI un `pulumi preview` des
      stacks dont la PR touche le code, signalant toute dérive restante après la fusion
  - **Vérification :** la prochaine PR qui modifie une stack Pulumi sans `pulumi up` fait apparaître la dérive dans la
    CI ou dans une issue
  - **Sinon :** un autre changement Pulumi reste non appliqué en silence

- [ ] [due:: 2026-12-10] [priority:: medium] [size:: S] [owner:: Alexandre] Exiger `immediate: true` sur les
      `ScheduledBackup` CNPG par une règle OPA
  - **Vérification :** `conftest` refuse un `ScheduledBackup` sans `immediate: true` dans les `dist/`
  - **Sinon :** une base neuve reste sans sauvegarde jusqu'à une semaine

## Connaissances pour les agents

- [CNPG rhodes.akn] : le Secret `cnpg-backup-credentials` des namespaces CNPG de `rhodes.akn` est écrit par Pulumi
  (`projects/rhodes.akn/src/infrastructure/pulumi/stack/cloudnative-pg.ts`), pas par ArgoCD ni ESO ; changer le
  namespace d'une app à base CNPG demande un `pulumi up` sur `rhodes_akn.live`.
- [CNPG] : un `Cluster` démarre et sert ses clients même quand le Secret de son `ObjectStore` manque ; seule la
  condition `ContinuousArchiving` le montre, et le PVC WAL se remplit jusqu'à la panne.
- [CNPG] : sur un PVC WAL plein, l'instance manager refuse de démarrer postgres (`Detected low-disk space condition`) ;
  rétablir l'archivage ne suffit pas, il faut d'abord agrandir le PVC ou recréer le cluster.
- [o11y] : aucune alerte CNPG n'existe dans l'arbre au 2026-11-12, malgré les actions cochées du post-mortem du
  2026-05-30 ; ne pas supposer qu'un échec d'archivage sera signalé.

## Suivi de résolution

### Fait

- [x] Stack `rhodes_akn.live` appliquée, `grafana-database` recréé, archivage WAL rétabli

### En attente

- [ ] Sauvegarde initiale de `grafana-database`
- [ ] Alertes CNPG et collecte des métriques
- [ ] `pulumi preview` en CI et règle OPA sur `immediate: true`

## Calendrier de vérification

| Point de contrôle | Date       | Ce que nous vérifierons                                                          | Instance      |
| ----------------- | ---------- | -------------------------------------------------------------------------------- | ------------- |
| 1 semaine         | 2026-11-19 | Sauvegarde de `grafana-database` présente ; alertes CNPG en cours ?              | Revue en solo |
| 1 mois            | 2026-12-12 | Alertes testées ; `pulumi preview` en CI ; règle OPA active ?                    | Revue en solo |
| 3 mois            | 2027-02-12 | Un échec d'archivage ou une dérive Pulumi s'est-il reproduit sans être signalé ? | Revue en solo |

## Pour aller plus loin

- [DB-20260530-00](../procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md) : la procédure de
  reprise d'un PVC WAL plein, dont l'étape 2 (agrandissement) était l'alternative à la recréation.
- [Incident WAL plein CNPG Apps Secured](Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md) : la même forme d'incident
  sur `lungmen.akn`, et les alertes qu'il avait promises.
