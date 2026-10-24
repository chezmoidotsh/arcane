---
title:
  "Politique de réécriture d'images Kyverno → dépendance circulaire Zot/Longhorn — ImagePullBackOff sur tout le cluster
  amiya.akn"
date: 2026-05-26
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical" # cluster de plateforme à l'arrêt ; tous les clusters en aval touchés indirectement
status: "Open"
detection-method: "Manual discovery (post-upgrade monitoring)"
duration: "~1h (déclenché immédiatement après les mises à jour du cluster)"
services-affected:
  - "Toutes les charges de travail d'amiya.akn — ImagePullBackOff sur tout le cluster"
  - "longhorn-system — couche de stockage dégradée"
  - "zot-registry (amiya.akn) — miroir OCI indisponible"
  - "Clusters en aval (lungmen.akn) — impact indirect via l'instance Zot partagée"
users-affected: "Famille — chaque cluster a perdu l'accès à OpenBao, Pocket-Id et Zot pendant la panne de la plateforme"
root-cause-family:
  - dependency-cycle
  - policy-scope-too-broad
related-incidents:
  - path: "docs/incidents/Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md"
    relation:
      "Le contournement Kyverno par `system-cluster-critical` découvert dans cet incident était le signal d'alerte
      ignoré de celui-ci"
related-adrs: []
related-issues:
  - "https://github.com/chezmoidotsh/arcane/issues/1005"
---

# Incident 2026-05-26 ImagePullBackOff circulaire Kyverno Zot Amiya

Une `MutatingPolicy` Kyverno redirigeait toutes les images vers le miroir Zot sans exclure `longhorn-system`, ce qui a
créé une dépendance circulaire entre le registre et son stockage. Cette page décrit l'incident du 2026-05-26 sur
`amiya.akn`, ses causes racines, les actions décidées et le calendrier de vérification.

## Résumé exécutif

La `MutatingPolicy` Kyverno `enforce-local-registry` était configurée pour rediriger chaque image de conteneur vers le
miroir OCI Zot local (`oci.chezmoi.sh`) et fixer `imagePullPolicy: Always`. La politique excluait `kube-system`,
`kyverno-system`, `kube-public` et `kube-node-lease`, mais **pas `longhorn-system`**. Cela a créé une dépendance
circulaire : les pods Longhorn devaient tirer leurs images depuis Zot, alors que le PVC de stockage de Zot reposait sur
Longhorn. Quand les mises à jour du cluster ont provoqué le redémarrage des pods de `longhorn-system`, la chaîne s'est
rompue : Longhorn ne pouvait plus tirer ses images depuis Zot, Longhorn s'est dégradé, Zot a perdu son PVC, et tout le
cluster est tombé en cascade en `ImagePullBackOff`. Le rétablissement a exigé de mettre Kyverno à zéro réplica et de
redémarrer tous les pods touchés. Kyverno a ensuite été retiré d'`amiya.akn` et de `lungmen.akn` dans l'attente d'une
refonte suivie dans l'issue #1005.

## Résumé de l'événement

**Résultat attendu :** Kyverno réécrit les références d'images des applications vers le miroir Zot à `oci.chezmoi.sh`,
ce qui améliore la sécurité de la chaîne d'approvisionnement et réduit la charge sur les registres amont. Les namespaces
d'infrastructure de stockage et de réseau fonctionnent normalement.

**Résultat obtenu :** la politique `enforce-local-registry` s'appliquait aussi aux pods de `longhorn-system`. Avec
`imagePullPolicy: Always`, chaque redémarrage d'un pod Longhorn tentait de tirer ses images via Zot. Le PVC de Zot est
un volume Longhorn : si Longhorn se dégrade, Zot devient indisponible et empêche Longhorn de se rétablir. Tous les
autres namespaces échouent alors aussi à tirer leurs images, ce qui produit des `ImagePullBackOff` sur tout le cluster.

**Impact :** `ImagePullBackOff` sur tout le cluster `amiya.akn` ; toutes les charges de travail redémarrées pendant la
fenêtre d'incident sont restées bloquées. Les clusters en aval qui dépendent de l'instance Zot partagée ont aussi été
touchés indirectement.

**Durée :** \~1h (déclenché immédiatement après les mises à jour du cluster).

**Premier signal :** Alexandre a observé des pods Zot en attente et des pods Longhorn en échec immédiatement après les
mises à jour du cluster, et l'a relié à l'incident Zot de la veille.

## Chronologie

<!-- skew: ±? — horodatages déduits de l'âge des redémarrages de pods au moment de l'investigation (~7h à 17:41 UTC) ; aucune source de journaux fiable pour le début de l'incident ; actions de rétablissement ±5m d'après l'historique du shell -->

| Heure (UTC)          | Acteur                         | Événement ou décision                                                                                                                                                          |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ±5m 2026-05-26T16:40 | Alexandre                      | Mises à jour du cluster effectuées sur amiya.akn ; redémarrages de pods déclenchés dans tous les namespaces                                                                    |
| ±5m 2026-05-26T16:41 | \[system:kubernetes]           | Pods Longhorn redémarrés ; Kyverno mute les images avec le préfixe Zot + `imagePullPolicy: Always`                                                                             |
| ±5m 2026-05-26T16:41 | \[system:longhorn]             | Les pods Longhorn ne parviennent pas à tirer depuis Zot ; la couche de stockage commence à se dégrader                                                                         |
| ±5m 2026-05-26T16:41 | \[system:zot]                  | PVC de Zot indisponible (Longhorn dégradé) ; toutes les requêtes de tirage d'image échouent                                                                                    |
| ±5m 2026-05-26T16:42 | \[system:kubernetes]           | Cascade : tous les namespaces avec des pods en `imagePullPolicy: Always` passent en `ImagePullBackOff`                                                                         |
| ±? 2026-05-26T17:40  | Alexandre                      | `ImagePullBackOff` confirmé sur tout le cluster ; cause racine identifiée d'après l'état des pods Zot/Longhorn et la connaissance de l'incident de la veille ; Kyverno mis à 0 |
| ±5m 2026-05-26T17:41 | \[anthropic:claude-sonnet-4-6] | Cause racine confirmée par la lecture de la politique `enforce-local-registry` : `longhorn-system` absent de la liste d'exclusion                                              |
| ±5m 2026-05-26T17:48 | \[anthropic:claude-sonnet-4-6] | Correctif commité : `longhorn-system` ajouté à la liste d'exclusion de namespaces de la MutatingPolicy                                                                         |
| ±5m 2026-05-26T17:48 | \[anthropic:claude-sonnet-4-6] | Politique corrigée appliquée directement par `kubectl apply` (ArgoCD indisponible)                                                                                             |
| ±5m 2026-05-26T17:49 | \[anthropic:claude-sonnet-4-6] | Kyverno réinstallé par `helm template \| kubectl apply` pour rétablir les webhooks avec la politique corrigée                                                                  |
| ±5m 2026-05-26T17:51 | Alexandre                      | Décision : retirer Kyverno entièrement dans l'attente de la refonte de l'issue #1005                                                                                           |
| ±5m 2026-05-26T17:51 | \[anthropic:claude-sonnet-4-6] | Déploiements Kyverno supprimés ; webhooks retirés ; namespace laissé avec les seuls jobs terminés                                                                              |
| ±5m 2026-05-26T17:55 | Alexandre                      | Toutes les charges de travail redémarrées ; cluster rétabli                                                                                                                    |

## Ce qui a bien fonctionné

- **Cause racine identifiée immédiatement par l'opérateur.** Alexandre a relié les pods Zot en attente et les pods
  Longhorn en échec à la dépendance circulaire, grâce à sa connaissance de l'infrastructure et de l'incident Zot de
  saturation de disque de la veille. Le fichier de politique a confirmé l'hypothèse en quelques minutes.
- **Aucune perte de données.** Les volumes Longhorn étaient dégradés mais pas corrompus. Tous les PVC étaient intacts
  après le rétablissement.
- **Le signal d'alerte de l'incident précédent était documenté.** Le post-mortem du 2026-05-25 notait explicitement le
  contournement par `priorityClassName: system-cluster-critical` utilisé pour échapper à la politique Kyverno pendant
  l'incident de saturation de disque de Zot. Avec le recul, la nécessité de ce contournement signalait directement que
  la politique Kyverno avait une couverture dangereuse.

## Analyse des causes racines

**Technique :** 5 Whys **Pourquoi cette technique :** chaîne causale unique : une politique d'admission redirigeait les
images de la couche de stockage via un registre qui dépend de ce même stockage. Linéaire, sans ramification.

### Analyse

1. **Pourquoi `amiya.akn` était-il en `ImagePullBackOff` sur tout le cluster ?** → Les pods ne pouvaient pas tirer leurs
   images depuis Zot (`oci.chezmoi.sh`), car Zot était indisponible.

2. **Pourquoi Zot était-il indisponible ?** → Le PVC Longhorn de Zot était inaccessible, car Longhorn lui-même était
   dégradé.

3. **Pourquoi Longhorn était-il dégradé ?** → Les pods Longhorn ont redémarré pendant les mises à jour du cluster et ne
   pouvaient pas tirer leurs propres images de conteneur, car Kyverno avait réécrit leurs références d'image vers Zot
   avec `imagePullPolicy: Always`.

4. **Pourquoi Kyverno réécrivait-il les images de Longhorn ?** → La MutatingPolicy `enforce-local-registry` excluait
   `kube-system`, `kyverno-system`, `kube-public` et `kube-node-lease`, mais **n'excluait pas `longhorn-system`**. Les
   pods Longhorn correspondaient à la politique et étaient mutés à chaque CREATE/UPDATE.

5. **Pourquoi `longhorn-system` n'était-il pas exclu ?** → La politique a été rédigée sans cartographier le graphe de
   dépendances entre le registre vers lequel elle route le trafic (Zot) et la couche de stockage dont ce registre dépend
   (Longhorn). La liste d'exclusion a été écrite du point de vue des « namespaces système », pas du point de vue de « ce
   dont Zot dépend ».

### Causes racines

- **La MutatingPolicy `enforce-local-registry` ne modélisait pas la chaîne de dépendances entre le miroir OCI (Zot) et
  le backend de stockage (Longhorn).** Rediriger les images de Longhorn lui-même via Zot a créé une dépendance
  circulaire stricte qui a fait s'effondrer tout le cluster à chaque redémarrage des pods Longhorn (par exemple pendant
  les mises à jour du cluster).

### Facteurs contributifs

- **L'incident précédent (2026-05-25) fournissait un signal implicite.** Le pod de nettoyage `busybox` de l'incident de
  saturation de disque de Zot a exigé `system-cluster-critical` pour contourner la politique Kyverno. Ce contournement
  indiquait que le périmètre de la politique était trop large, mais aucune action de suivi n'a été menée pour le
  restreindre.
- **ArgoCD était indisponible pendant le rétablissement.** Cela a imposé des opérations directes `kubectl apply` et
  `helm template`, a compliqué le chemin de rétablissement et laissé temporairement le cluster hors GitOps.

## Signaux d'alerte manqués

| Signal                                                                                      | Quand il était visible    | Pourquoi on n'a pas agi                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Contournement par `system-cluster-critical` nécessaire pendant l'incident Zot du 2026-05-25 | 2026-05-25                | Perçu comme une astuce ingénieuse, pas comme le signe d'une politique trop large |
| `longhorn-system` absent de la liste d'exclusion                                            | Rédaction de la politique | Graphe de dépendances (Zot → Longhorn) non pris en compte                        |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu changer)

- Exclure `longhorn-system` (et tout autre namespace hébergeant l'infrastructure de stockage ou de réseau dont dépend le
  miroir OCI) aurait rompu la dépendance circulaire.
- Une revue du graphe de dépendances avant le déploiement de la politique aurait fait apparaître le cycle Zot → Longhorn
  → Zot.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                   | Qu'est-ce qui réduirait l'exposition ?                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Redémarrages de pods pendant les mises à jour normales du cluster | Le périmètre de la politique doit tenir compte de tous les cycles de dépendances |
| Indisponibilité d'ArgoCD pendant le rétablissement                | Runbook d'urgence pour les opérations directes avec kubectl                      |

## Leçons systémiques

- **Les politiques de réécriture d'images doivent modéliser le graphe de dépendances complet du registre vers lequel
  elles routent.** Tout namespace dont les charges de travail sont nécessaires au fonctionnement du registre (stockage,
  CNI, DNS) doit être exclu. Les « namespaces système » (`kube-system`, etc.) ne forment pas une liste d'exclusion
  suffisante quand le registre dépend d'une infrastructure de niveau applicatif comme Longhorn.

- **Les signaux d'alerte d'incidents voisins doivent déclencher une revue de politique.** Le contournement par
  `system-cluster-critical` utilisé pendant l'incident du 2026-05-25 indiquait directement que la couverture de la
  politique Kyverno était dangereuse. Une action de suivi post-incident pour revoir la liste d'exclusion aurait évité
  cet incident.

- **Un remplaçant à la réécriture d'images de Kyverno doit être conçu avant toute réactivation.** L'issue #1005 suit la
  refonte. Tant que ce travail n'est pas terminé, le cluster fonctionne sans l'application de règles de chaîne
  d'approvisionnement qu'apportait Kyverno : c'est un risque accepté et limité dans le temps.

## De la leçon au contrôle

| Leçon                                                                                                            | Type d'artefact    | Artefact lié                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Les politiques de réécriture d'images doivent modéliser le graphe de dépendances complet du registre cible       | Règle OPA / ADR    | Validation `catalog/opa/rules/` pour toute politique redirigeant vers `oci.chezmoi.sh` |
| Les signaux d'alerte d'incidents voisins doivent déclencher une revue de politique                               | Étape de processus | Ce post-mortem recoupe lui-même le contournement précédent, propagé via INDEX.md       |
| Le remplaçant de Kyverno doit précéder la réactivation de l'application des règles de chaîne d'approvisionnement | ADR + issue        | [issue #1005](https://github.com/chezmoidotsh/arcane/issues/1005) + ADR-TBD            |
| L'auto-réparation d'ArgoCD complique le rétablissement d'urgence : séquence de suspension à documenter           | Étape de runbook   | `docs/procedures/`, suspension d'urgence d'ArgoCD (à écrire, commune au PM Zot)        |

## Registre des changements

- [x] [due:: 2026-05-26] [priority:: high] [size:: S] [owner:: Alexandre] Retirer Kyverno d'amiya.akn et de
      lungmen.akn (cluster en production)
  - **Vérification :**
    `kubectl get pods,validatingwebhookconfigurations,mutatingwebhookconfigurations -n kyverno-system` ne renvoie rien
    sur les deux clusters
  - **Sinon :** l'effondrement du cluster se reproduit à la prochaine mise à jour

- [x] [due:: 2026-05-26] [priority:: high] [size:: S] [owner:: Alexandre] Retirer les sources Kyverno du catalogue
      et de tous les arbres src des projets
  - **Vérification :** `find . -path '*/kyverno*' -type d` ne renvoie aucun répertoire de politique
  - **Sinon :** ArgoCD réinstalle Kyverno à la prochaine synchronisation

- [x] [due:: 2026-07-15] [priority:: high] [size:: L] [owner:: Alexandre] Concevoir et mettre en œuvre la politique
      d'images de remplacement (issue #1005) avec les bonnes exclusions de dépendances : elle doit inclure
      `longhorn-system`, les namespaces CNI, DNS et tout autre namespace dont dépendent les charges de travail du miroir
      OCI
  - **Vérification :** nouvelle politique déployée ; test contrôlé : tuer un pod Longhorn, qui tire son image et se
    rétablit dans la fenêtre normale de redémarrage
  - **Sinon :** le cluster fonctionne sans application des règles de chaîne d'approvisionnement indéfiniment (risque
    accepté mais non borné)

- [x] [due:: 2026-06-15] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter une liste de contrôle d'audit
      des cycles de dépendances au processus de rédaction des politiques : « De quoi dépend le registre ou la cible
      d'admission ? Ces namespaces sont-ils exclus ? »
  - **Vérification :** liste de contrôle visible à côté des futures PR de politique ; relue au moins une fois sur un
    vrai changement de politique
  - **Sinon :** la même classe de cycle reste possible sur la prochaine politique d'admission ou de mutation

## Connaissances pour les agents

- Kyverno `MutatingPolicy` avec redirection en `imagePullPolicy: Always` : force un nouveau tirage à chaque redémarrage
  de pod. Appliquée au namespace qui héberge le backend de stockage du registre (par exemple `longhorn-system`), elle
  crée une dépendance circulaire stricte. Toute politique qui réécrit les images vers le miroir OCI du cluster **doit**
  exclure chaque namespace dont le miroir dépend transitivement.
- L'exclusion des « namespaces système » (`kube-system`, `kube-public`, `kube-node-lease`) est **insuffisante** dans ce
  homelab : l'infrastructure de niveau applicatif (Longhorn, namespace de l'opérateur Cilium, etc.) est aussi sur le
  chemin critique du registre.
- Rétablissement d'un `ImagePullBackOff` sur tout le cluster quand ArgoCD est aussi indisponible : `helm template` +
  `kubectl apply` directement, puis réactiver la synchronisation d'ArgoCD ensuite.

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                    | Instance      |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| 1 semaine         | 2026-06-02 | Aucun reste de Kyverno ; discussion de conception de l'issue #1005 lancée                              | Revue en solo |
| 1 mois            | 2026-06-26 | Liste de contrôle des cycles de dépendances en place ; mise en œuvre de #1005 planifiée ou en cours    | Revue en solo |
| 3 mois            | 2026-08-26 | Nouvelle politique déployée et validée par un redémarrage contrôlé d'un pod Longhorn ; aucune récidive | Revue en solo |

## Pour aller plus loin

- [Incident 2026-05-25 Saturation du disque de Zot](Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md) :
  l'incident de la veille, dont le contournement `system-cluster-critical` était le signal d'alerte manqué
- [ADR-012 Remplacer Kyverno par OPA](../decisions/ADR-012-Remplacer-Kyverno-par-OPA.md) : la décision qui a remplacé la
  réécriture d'images à l'exécution par une vérification en CI
- [SEC001 Imposer le registre local](../../catalog/opa/rules/SEC001-enforce-local-registry.md) : la règle OPA qui
  remplace la politique Kyverno
