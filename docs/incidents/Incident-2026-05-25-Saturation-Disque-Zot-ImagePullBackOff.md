---
title: "Saturation du disque de Zot : ImagePullBackOff généralisé sur lungmen.akn"
date: 2026-05-25
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "High" # tous les workloads de lungmen indisponibles ; 2 h de panne supplémentaires pour actual-budget
status: "Open"
detection-method: "Manual discovery"
duration: "~5h20m (saturation 16:28 UTC → actual-budget Running 21:50 UTC)"
services-affected:
  - "zot-registry (amiya.akn) — miroir/proxy OCI pour tous les clusters"
  - "tous les workloads de lungmen.akn — ImagePullBackOff à l'échelle du cluster"
  - "actual-budget (lungmen.akn) — 2 h de panne supplémentaires dues à la corruption de l'index"
users-affected: "Moi — tous les services de lungmen.akn indisponibles pendant ~3h20m"
root-cause-family:
  - observability-gap
related-incidents:
  - path: "docs/incidents/Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md"
    relation:
      "Le contournement Kyverno par `system-cluster-critical` utilisé ici est devenu le signal d'alerte ignoré avant
      l'effondrement du cluster amiya le lendemain"
related-adrs: []
---

# Incident 2026-05-25 Saturation disque Zot ImagePullBackOff

Migré le 2026-10-11 ; les faits décrits sont ceux de l'époque et n'ont pas été revérifiés.

Cette page est le post-mortem de la saturation du PVC du registre OCI Zot, qui a placé tous les workloads de
`lungmen.akn` en `ImagePullBackOff`, puis de la corruption d'un index qui a prolongé de 2 h la panne d'`actual-budget`.

> [!NOTE]\
> **Note du 2026-10-11 :** `amiya.akn` n'existe plus dans `projects/` et Zot ne tourne plus dans un cluster : il est
> déployé sur un LXC NixOS (`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/modules/zot.nix`, pile
> Pulumi `projects/chezmoi.sh/src/infrastructure/pulumi/stack/zot-registry.ts`). Cette configuration fixe
> `gcInterval = "24h"` et une politique `retention` (3 derniers tags). Aucune procédure Zot n'existe dans
> `docs/procedures/`. Le reste du texte est conservé tel qu'écrit à l'époque.

## Résumé exécutif

Le registre OCI Zot d'`amiya.akn` a manqué d'espace sur son PVC de 50 Gi et a renvoyé des erreurs 404 pour toutes les
demandes de synchronisation d'images. Tous les workloads de `lungmen.akn` sont passés en `ImagePullBackOff`. Le
correctif immédiat, agrandir le PVC de 50 Gi à 100 Gi, a rétabli la plupart des workloads, mais `actual-budget` est
resté en panne : une écriture interrompue par le disque plein avait laissé un `index.json` corrompu (octets nuls) dans
le dépôt `actualbudget/actual-server`, et Zot renvoyait une erreur 500 à chaque requête de manifeste pour cette image.
La corruption a été résolue en arrêtant Zot, en supprimant le répertoire corrompu puis en redémarrant. Aucune donnée n'a
été perdue. Les deux pannes découlent d'une même condition racine : aucune supervision ni alerte sur la capacité du PVC
de Zot.

## Résumé de l'événement

**Résultat attendu :** tous les workloads de `lungmen.akn` récupèrent leurs images à la demande via le proxy Zot
`oci.chezmoi.sh`, qui synchronise de façon transparente les images depuis les registres amont.

**Résultat obtenu :** le PVC de Zot a atteint 99,6 % de sa capacité (52,31 Gi utilisés pour 52,52 Gi au total sur un
volume de 50 Gi). Les nouvelles synchronisations échouaient avec `no space left on device`. Zot renvoyait 404 pour
toutes les images non mises en cache et 500 pour le dépôt `ghcr.io/actualbudget/actual-server`, dont l'`index.json`
avait été corrompu par une écriture incomplète à la saturation du disque.

**Impact :** `ImagePullBackOff` à l'échelle de `lungmen.akn` ; tous les démarrages de Pods reposant sur des images non
mises en cache étaient bloqués. `actual-budget` est resté indisponible environ 2 h de plus après le correctif général.

**Durée :** saturation du disque confirmée dans les journaux de Zot à `2026-05-25T16:28 UTC` ; résolution complète à
`~2026-05-25T21:50 UTC` (fenêtre totale de l'incident ≥ 5h20m).

**Premier signal :** entrée de journal Zot `"no space left on device"` à `2026-05-25T16:28:24 UTC` (découverte
rétrospectivement). Détection signalée par l'utilisateur : `~2026-05-25T18:30 UTC`.

## Chronologie

<!-- skew: exact for [system:zot] events (sourced from structured JSON logs); ±5m for AI agent actions (shell history); ±? for user-reported times -->

| Heure (UTC)          | Acteur                         | Événement ou décision                                                                                                                                                |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-25T16:28:24  | \[system:zot]                  | Première erreur `no space left on device` journalisée pendant la synchronisation d'une couche de `csi-resizer`                                                       |
| ±? 2026-05-25T18:30  | Alexandre                      | `ImagePullBackOff` généralisé sur `lungmen.akn` découvert ; début de l'investigation                                                                                 |
| ±5m 2026-05-25T18:37 | \[anthropic:claude-sonnet-4-6] | Journaux de Zot consultés ; `no space left on device` identifié comme cause racine                                                                                   |
| ±5m 2026-05-25T18:38 | \[anthropic:claude-sonnet-4-6] | `talosctl mounts` confirme le PVC à 99,6 % (0,21 Gi libres)                                                                                                          |
| ±5m 2026-05-25T18:39 | \[anthropic:claude-sonnet-4-6] | PVC modifié à chaud : 50 Gi → 100 Gi (`kubectl patch pvc`)                                                                                                           |
| ±5m 2026-05-25T18:40 | \[system:longhorn]             | Volume redimensionné et système de fichiers étendu ; espace libre 0,21 Gi → 53 Gi (49,65 % utilisés)                                                                 |
| ±5m 2026-05-25T18:40 | Alexandre                      | Décision : mettre aussi à jour la taille du PVC dans le code (`zot.helmvalues/default.yaml`)                                                                         |
| 2026-05-25T19:37     | \[system:zot]                  | Début de la synchronisation d'`actual-server:26.5.0` ; écriture interrompue par le disque plein ; `index.json` partiellement écrasé par des octets nuls              |
| 2026-05-25T19:37     | \[system:zot]                  | Les requêtes de manifeste suivantes pour `actual-server` renvoient 500 (`invalid JSON` / `unsupported repository layout version`)                                    |
| ±? 2026-05-25T20:18  | \[system:kubernetes]           | Pod `actual-budget-0` redémarré, puis en `ImagePullBackOff` (estimation d'après l'âge du Pod au moment de la vérification)                                           |
| ±? 2026-05-25T21:20  | Alexandre                      | `actual-budget` toujours en `ImagePullBackOff` ; seconde investigation                                                                                               |
| ±5m 2026-05-25T21:21 | \[anthropic:claude-sonnet-4-6] | Erreur 500 sur le manifeste d'`actual-server` identifiée ; les journaux de Zot montrent un `index.json` corrompu (octets nuls)                                       |
| ±5m 2026-05-25T21:22 | \[anthropic:claude-sonnet-4-6] | Première tentative de mise à l'échelle à 0 ; ArgoCD (selfHeal=true) restaure aussitôt le Pod de Zot                                                                  |
| ±5m 2026-05-25T21:24 | \[anthropic:claude-sonnet-4-6] | `selfHeal` d'ArgoCD désactivé sur l'application `zot-registry`                                                                                                       |
| ±5m 2026-05-25T21:41 | \[anthropic:claude-sonnet-4-6] | Zot mis à l'échelle à 0, Pod confirmé supprimé ; Pod de nettoyage créé avec `system-cluster-critical` pour contourner la politique de réécriture d'images de Kyverno |
| ±5m 2026-05-25T21:43 | \[anthropic:claude-sonnet-4-6] | Le Pod de nettoyage se termine : répertoire `ghcr.io/actualbudget/actual-server` supprimé du PVC                                                                     |
| ±5m 2026-05-25T21:44 | \[anthropic:claude-sonnet-4-6] | Zot remis à l'échelle à 1 ; Pod Ready                                                                                                                                |
| ±5m 2026-05-25T21:44 | \[anthropic:claude-sonnet-4-6] | `selfHeal` d'ArgoCD réactivé                                                                                                                                         |
| ±5m 2026-05-25T21:45 | \[anthropic:claude-sonnet-4-6] | `HEAD /v2/ghcr.io/actualbudget/actual-server/manifests/26.5.0` renvoie 200 ; Zot resynchronisé depuis ghcr.io                                                        |
| ±5m 2026-05-25T21:50 | \[system:kubernetes]           | `actual-budget-0` Running 1/1                                                                                                                                        |

## Ce qui a bien fonctionné

- **Les journaux de Zot sont en JSON structuré et immédiatement lisibles.** La cause racine a été identifiée dans les 5
  minutes suivant le début de l'investigation : un seul grep a fait remonter `no space left on device`.
- **Longhorn permet le redimensionnement en ligne.** Le PVC est passé de 50 Gi à 100 Gi sans redémarrage de Pod et sans
  interruption de service pour les autres clusters.
- **La politique Kyverno prévoyait une porte de sortie documentée.** L'exclusion par
  `priorityClassName: system-cluster-critical` a permis au Pod de nettoyage d'urgence de récupérer `busybox` directement
  depuis Docker Hub pendant que le registre Zot était hors ligne, sans identifiants particuliers ni modification de
  politique.
- **Le `selfHeal` d'ArgoCD a été compris et désactivé sans risque.** La première mise à l'échelle à 0 a été annulée par
  ArgoCD en quelques secondes, mais le mécanisme a été identifié et neutralisé rapidement avant de poursuivre.

## Analyse des causes racines

**Technique :** Swiss Cheese **Pourquoi cette technique :** trois défenses ont cédé l'une après l'autre (intervalle de
GC trop long, aucune rétention basée sur la taille, aucune alerte de capacité sur le PVC). Les 5 Whys seuls masquent
cette structure en couches ; Swiss Cheese rend explicite l'absence de défenses multiples.

> Les 5 Whys sont conservés ci-dessous comme vue complémentaire de la chaîne de cause immédiate, mais le cadre principal
> est multicouche : chaque défense, si elle avait existé, aurait empêché la saturation.

### Analyse

1. **Pourquoi les workloads de lungmen étaient-ils en `ImagePullBackOff` ?** → Zot renvoyait 404 (la plupart des images)
   et 500 (`actual-server`) pour les requêtes de manifeste.

2. **Pourquoi Zot renvoyait-il 404/500 ?** → Le PVC était à 99,6 % de sa capacité. Les nouvelles écritures de
   synchronisation échouaient avec `no space left on device`, empêchant Zot de mettre les images en cache. Une écriture
   partielle antérieure avait aussi corrompu l'index du dépôt `actual-server`.

3. **Pourquoi le PVC était-il plein ?** → Zot met en cache en proxy toutes les images demandées à tous les registres
   amont configurés (docker.io, ghcr.io, gcr.io, registry.k8s.io, …). Le cache cumulé a atteint 52,31 Gi en \~165 jours,
   atteignant la limite de 50 Gi.

4. **Pourquoi le cache n'était-il pas maîtrisé ?** → L'intervalle de GC est de 168 h (hebdomadaire) et aucune éviction
   explicite basée sur la taille n'est configurée. Des politiques de rétention existent pour les images sans tag ou
   anciennes, mais elles n'étaient pas assez agressives pour maintenir l'utilisation totale sous la limite du PVC.

5. **Pourquoi la limite n'a-t-elle pas été repérée avant la saturation ?** → **Aucune alerte n'existe sur l'utilisation
   du PVC de Zot.** Il n'y a ni règle Prometheus, ni alerte Longhorn, ni revue périodique de la capacité de stockage de
   ce PVC.

### Causes racines

- **Aucune supervision de la capacité du PVC de Zot** : aucune alerte ni signal automatisé ne se déclenche quand le PVC
  approche de sa limite. Sans signal, la saturation n'est découverte que lorsque les défaillances se propagent aux
  clusters dépendants. C'est la condition structurelle qui rend cette classe d'incident probable.

### Facteurs contributifs

- **Intervalle de GC trop espacé (168 h)** : un GC hebdomadaire laisse le cache s'accumuler pendant jusqu'à une semaine
  avant le nettoyage. Un intervalle plus court réduirait la consommation de marge entre deux cycles, mais ne traite pas
  l'absence d'alerte de capacité.
- **PVC de 50 Gi sous-dimensionné** pour le nombre et la taille des images mises en miroir pour tous les workloads de
  `lungmen.akn` : il laissait moins de temps de marge avant le remplissage.
- **L'écriture corrompue par le disque plein a créé une défaillance secondaire** : une écriture partielle a laissé des
  octets nuls dans `index.json`, produisant une erreur différente et moins évidente (500 au lieu de 404), qui a prolongé
  de \~2 h la panne d'`actual-budget` après le correctif principal.
- **Le `selfHeal` d'ArgoCD a retardé la remédiation** : la première mise à l'échelle à 0 a été immédiatement annulée,
  ajoutant \~20 minutes au chemin de résolution.

## Signaux d'alerte manqués

| Signal                                             | Quand il était visible                            | Pourquoi on n'a pas agi                                                                |
| -------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| PVC à 99,6 % (52,31 Gi / 52,52 Gi)                 | En continu, la veille                             | Pas d'alerte ; personne ne vérifiait l'utilisation du PVC                              |
| `no space left on device` dans les journaux de Zot | 2026-05-25T16:28 UTC (\~2 h avant le signalement) | Pas d'alerte sur les journaux ; journaux consultés seulement lors de l'incident        |
| Journal Zot : opérations `Copy layer` constantes   | Plusieurs jours avant                             | Trafic de synchronisation d'apparence normale ; pas d'alerte sur le débit ni la taille |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu être changé)

- Une règle Prometheus/Alertmanager sur l'utilisation du PVC Longhorn à 80 % aurait donné \~10 Gi de marge avant la
  saturation.
- Réduire `gcInterval` de 168 h à 24 h aurait réduit la fenêtre pendant laquelle les couches obsolètes s'accumulent.
- Une politique de rétention basée sur la taille (taille totale maximale d'un dépôt ou du registre) aurait borné la
  croissance illimitée du cache.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                                      | Qu'est-ce qui réduirait l'exposition ?                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Les images amont grossissent avec le temps (inflation des index OCI)                 | Superviser la taille totale du registre et alerter avant saturation ; rétention par taille             |
| Les registres amont exigent une synchronisation à la demande (pas de préremplissage) | Préchauffer les images critiques (p. ex. `actual-server`) par des tâches de synchronisation planifiées |

## Leçons systémiques

- **La capacité de stockage de l'infrastructure partagée n'a ni responsable ni supervision.** Le PVC de Zot est une
  dépendance de tous les clusters. Sa capacité n'est suivie nulle part. C'est la même lacune structurelle qui produit
  des incidents de « disque soudainement plein » dans toute l'infrastructure : ce n'est le travail de personne de
  surveiller, donc personne ne surveille. Chaque PVC partagé qui est une dépendance de cluster devrait avoir une alerte
  d'utilisation.

- **Un disque plein pendant une écriture produit de la corruption, pas seulement un échec.** L'erreur 500 sur
  `actual-server` était un mode de défaillance distinct, plus difficile à diagnostiquer que les 404. Quand une écriture
  échoue en cours de route, le stockage reste dans un état incohérent qui survit au déclencheur initial. Le nettoyage
  des écritures partielles devrait faire partie de toute procédure de récupération après disque plein.

- **Le `selfHeal` d'ArgoCD sur les composants d'infrastructure complique les opérations d'urgence.** Mettre un registre
  à l'échelle 0 pour maintenance alors qu'ArgoCD le restaure aussitôt est un vrai point de friction. Pour les composants
  d'infrastructure qui exigent une intervention manuelle (registre, magasin de secrets), il convient de documenter la
  séquence de suspension/réactivation dans une procédure plutôt que de la découvrir sous pression.

## De la leçon au contrôle

| Leçon                                                                                    | Type d'artefact    | Artefact lié                                                         |
| ---------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| Les PVC d'infrastructure partagée ont besoin d'alertes de capacité avant saturation      | Règle d'alerte     | À définir : partie du méta-motif `observability-gap` (voir INDEX.md) |
| Un disque plein pendant une écriture laisse les stockages incohérents : nettoyage requis | Étape de procédure | `docs/procedures/` : maintenance d'urgence de Zot (à écrire)         |
| Le `selfHeal` d'ArgoCD combat la mise à l'échelle manuelle sur les composants d'infra    | Étape de procédure | Même procédure d'urgence Zot : `argocd app set --sync-policy none`   |
| Le cache de Zot croît sans limite en l'absence de rétention par taille                   | Configuration      | `projects/amiya.akn/src/apps/zot-registry/zot.helmvalues/`           |

## Registre des changements

- [ ] \[due:: 2026-06-01] \[priority:: high] \[size:: S] \[owner:: Alexandre] Réduire le `gcInterval` de Zot de 168h à
      24h dans `zot.helmvalues/default.yaml`
  - **Vérification :** l'utilisation du PVC de Zot reste sous 70 % pendant 7 jours consécutifs après le changement
    (contrôle quotidien par l'utilisateur) ; une entrée de journal de GC est visible toutes les 24 h
  - **Sinon :** le cache continue de croître sans contrôle ; prochaine saturation attendue d'ici \~5 mois au rythme
    actuel de croissance des images amont

- [ ] \[due:: 2026-06-15] \[priority:: high] \[size:: M] \[owner:: Alexandre] Ajouter une politique de rétention basée
      sur la taille dans la configuration de Zot (`storage.retention`, taille totale maximale et/ou par dépôt)
  - **Vérification :** la configuration de Zot expose la politique de rétention ; le premier balayage de rétention est
    visible dans les journaux ; l'utilisation du PVC diminue après le déploiement
  - **Sinon :** le GC seul est insuffisant : les anciennes couches s'accumulent jusqu'à la prochaine saturation

- [ ] \[due:: 2026-06-15] \[priority:: high] \[size:: M] \[owner:: Alexandre] Écrire une procédure de maintenance
      d'urgence pour Zot couvrant la mise à l'échelle à 0, la suspension d'ArgoCD, le nettoyage des écritures partielles
      et le contournement Kyverno par `system-cluster-critical`
  - **Vérification :** la prochaine maintenance planifiée de Zot suit la procédure de bout en bout sans redécouvrir le
    conflit avec le `selfHeal` d'ArgoCD
  - **Sinon :** le prochain événement de disque plein ou de corruption répète les 20 minutes de lutte contre le
    `selfHeal` d'ArgoCD

- [ ] \[due:: 2026-06-22] \[priority:: high] \[size:: L] \[owner:: Alexandre] Établir un plan d'observabilité de base
      pour les PVC d'infrastructure partagée (Zot, système Longhorn) : c'est le méta-motif de la famille
      `observability-gap`
  - **Vérification :** une proposition concrète est commitée (ADR ou document d'expérience) ; elle couvre les seuils
    d'utilisation des PVC et le canal d'alerte
  - **Sinon :** le prochain événement de type « soudainement plein » sur un PVC partagé sera découvert par la panne, pas
    par un signal

## Connaissances pour les agents

- Zot (registre OCI) : met en cache toute image demandée aux registres amont configurés. Sans rétention basée sur la
  taille, le cache croît de façon monotone ; `gcInterval` pilote le nettoyage des couches obsolètes, pas la taille
  totale.
- Zot : un disque plein pendant une écriture peut corrompre `index.json` avec des octets nuls, ce qui produit des
  erreurs 500 sur ce dépôt précis (distinctes du 404 pour une image absente). Récupération : mettre Zot à l'échelle 0,
  supprimer le répertoire du dépôt corrompu dans le PVC, remettre à l'échelle.
- ArgoCD : le `selfHeal` annule les mises à l'échelle manuelles en quelques secondes. Pour une maintenance manuelle,
  exécuter d'abord `argocd app set <app> --sync-policy none`, effectuer les changements, puis réactiver.
- Kyverno : l'exclusion de la politique `enforce-local-registry` par `priorityClassName: system-cluster-critical` sert
  de porte de sortie pour les Pods d'urgence qui doivent contourner la réécriture vers le registre. (Remarque : Kyverno
  a ensuite été entièrement retiré ; voir l'incident lié.)
- Longhorn : le redimensionnement en ligne d'un PVC par
  `kubectl patch pvc <name> -p '{"spec":{"resources":{"requests":{"storage":"<size>"}}}}'` fonctionne sans redémarrage
  de Pod ; le volume et le système de fichiers sont étendus de façon transparente.

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                   | Instance      |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| 1 semaine         | 2026-06-01 | `gcInterval` réduit ; utilisation du PVC de Zot en baisse                                             | Revue en solo |
| 1 mois            | 2026-06-25 | Rétention active ; PVC de Zot stable sous 70 % ; procédure utilisée ou répétée une fois               | Revue en solo |
| 3 mois            | 2026-08-25 | Aucune saturation de disque sur un PVC d'infrastructure partagée ; audit de la couverture des alertes | Revue en solo |

## Pour aller plus loin

- [Incident 2026-05-26 ImagePullBackOff circulaire Kyverno Zot Amiya](Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md)
  : l'effondrement du cluster amiya du lendemain, précédé par le contournement `system-cluster-critical` décrit ici
- [Incident 2026-05-30 ImagePullBackOff Redis Index Zot Corrompu](Incident-2026-05-30-ImagePullBackOff-Redis-Index-Zot-Corrompu.md)
  : une nouvelle corruption d'index Zot
- [ADR-012 Remplacer Kyverno par OPA](../decisions/ADR-012-Remplacer-Kyverno-par-OPA.md) : la décision qui a retiré
  Kyverno
