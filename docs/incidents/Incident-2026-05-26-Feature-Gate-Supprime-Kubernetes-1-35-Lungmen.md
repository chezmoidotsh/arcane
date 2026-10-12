---
title:
  "Échec de la mise à jour Kubernetes 1.35 — le feature gate supprimé UserNamespacesPodSecurityStandards fait planter
  kube-apiserver et kubelet sur lungmen.akn"
date: 2026-05-26
author: "[anthropic:claude-sonnet-4-6]"
participants:
  - "Alexandre"
  - "[anthropic:claude-sonnet-4-6]"
severity: "Low" # kube-apiserver arrêté 45 min pendant une maintenance planifiée, aucun impact utilisateur (homelab)
status: "Open"
detection-method: "Manual discovery (during upgrade)"
duration: "~45min (09:30 → 10:16 UTC)"
services-affected:
  - "kube-apiserver (lungmen.akn) — arrêté ~45min pendant la fenêtre de mise à jour"
  - "kubelet (lungmen.akn) — panic au démarrage de la v1.35.0"
users-affected: "Aucun impact sur les charges de travail (fenêtre de maintenance planifiée)"
root-cause-family:
  - missing-pre-deploy-check
  - merge-vs-replace
related-incidents: []
related-adrs: []
---

# Incident 2026-05-26 Feature gate supprimé Kubernetes 1.35 Lungmen

Pendant la mise à jour de Kubernetes 1.34.0 vers 1.35.0 sur `lungmen.akn`, le feature gate
`UserNamespacesPodSecurityStandards`, supprimé dans Kubernetes 1.35 mais toujours présent dans le patch de configuration
Talos, a fait planter `kube-apiserver` puis `kubelet`. Cette page décrit la chronologie, les causes racines, les leçons
et les actions de suivi.

Migré le 2026-10-11 ; les faits décrits sont ceux de l'époque et n'ont pas été revérifiés.

> [!NOTE]\
> Note du 2026-10-11 : la mise à jour de Kubernetes passe désormais par le template Omni (`kubernetes.version` du
> cluster template, appliqué par `omnictl cluster template sync`), et non plus par `talosctl upgrade-k8s`. La
> pré-vérification des feature gates et des flags retirés dans la version cible est l'étape 2 de la procédure
> [Mettre à jour Kubernetes avec Omni](../procedures/infrastructure/INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md).
> Le texte ci-dessous reste celui de l'époque.

## Résumé exécutif

Pendant la mise à jour de Kubernetes 1.34.0 vers 1.35.0 sur `lungmen.akn` (procédure `INF-20260525-01`), le
kube-apiserver v1.35.0 s'est arrêté dès son démarrage avec
`unrecognized feature gate: UserNamespacesPodSecurityStandards`. Ce feature gate avait été supprimé dans Kubernetes 1.35
mais figurait encore dans le patch de configuration Talos du cluster. Le kubelet v1.35.0 a paniqué pour la même raison.
Une première tentative de correction avec `talosctl patch machineconfig` a échoué, car cette commande applique une
**fusion stratégique** : elle ajoute ou modifie des clés mais ne supprime jamais une clé existante d'une map. La
correction effective a nécessité d'extraire la configuration machine complète, de retirer le gate supprimé par une
substitution par expression régulière, puis de réappliquer la configuration avec `talosctl apply-config` pour écraser
l'état du nœud. Aucune donnée n'a été perdue. Le cluster était pleinement opérationnel en v1.35.0 en moins de 45
minutes.

## Résumé de l'événement

**Résultat attendu :** `talosctl upgrade-k8s --to 1.35.0` termine toutes les phases sans erreur et fait passer tous les
composants du plan de contrôle et du plan de données en Kubernetes 1.35.0.

**Résultat obtenu :** kube-apiserver v1.35.0 s'est arrêté immédiatement avec
`unrecognized feature gate: UserNamespacesPodSecurityStandards`, ce qui a mis l'API server hors ligne. Le kubelet a
ensuite paniqué pour la même raison lors de la mise à jour de son propre binaire. `kubectl` a renvoyé
`connection refused` sur le port 6443 pendant toute la durée de la remédiation.

**Impact :** kube-apiserver indisponible pendant \~45 min. Aucune charge de travail visible des utilisateurs n'a été
touchée, car la mise à jour était une opération de maintenance planifiée.

**Durée :** kube-apiserver arrêté de \~09:30 UTC à \~10:16 UTC le 2026-05-26.

**Premier signal :** `talosctl containers -k` affichant `CONTAINER_EXITED` pour kube-apiserver aussitôt après l'étape de
mise à jour ; `talosctl logs -k` révélant `unrecognized feature gate: UserNamespacesPodSecurityStandards`.

## Chronologie

<!-- skew: ±5m — horodatages issus de l'historique du shell et des sorties de journal talosctl ; pas de précision à la seconde -->

| Heure (UTC)          | Acteur                         | Événement ou décision                                                                                                                                                                  |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ±5m 2026-05-26T09:11 | \[anthropic:claude-sonnet-4-6] | `talosctl upgrade-k8s --to 1.35.0` lancé sur lungmen.akn                                                                                                                               |
| ±5m 2026-05-26T09:30 | \[system:talos]                | kube-apiserver v1.35.0 démarre, panique immédiatement, le conteneur s'arrête (`CONTAINER_EXITED`)                                                                                      |
| ±5m 2026-05-26T09:30 | \[system:kubernetes]           | Port 6443 : connexion refusée, cluster inaccessible via kubectl                                                                                                                        |
| ±5m 2026-05-26T09:42 | \[system:talos]                | dmesg : boucle de crash et de redémarrage, `Authorization error (user=apiserver-kubelet-client)` répété pendant que l'apiserver échoue à démarrer                                      |
| ±5m 2026-05-26T09:48 | \[anthropic:claude-sonnet-4-6] | `talosctl containers -k` confirme `CONTAINER_EXITED` pour kube-apiserver                                                                                                               |
| ±5m 2026-05-26T09:48 | \[anthropic:claude-sonnet-4-6] | `talosctl logs -k` révèle `unrecognized feature gate: UserNamespacesPodSecurityStandards`                                                                                              |
| ±5m 2026-05-26T10:03 | \[anthropic:claude-sonnet-4-6] | `UserNamespacesPodSecurityStandards` retiré de `lungmen-akn-01.patch-config.yaml` (deux occurrences : `featureGates` du kubelet et `feature-gates` de l'apiServer)                     |
| ±5m 2026-05-26T10:03 | \[anthropic:claude-sonnet-4-6] | `talosctl patch machineconfig --patch @patch-config.yaml` appliqué : « Applied configuration without a reboot »                                                                        |
| ±5m 2026-05-26T10:04 | \[system:talos]                | kube-apiserver redémarre ; le kubelet panique aussi avec `unrecognized feature gate: UserNamespacesPodSecurityStandards`                                                               |
| ±5m 2026-05-26T10:04 | Alexandre                      | Signale la panique du kubelet : le patch de fusion n'a pas supprimé la clé de la configuration en cours d'exécution du nœud                                                            |
| ±5m 2026-05-26T10:05 | \[anthropic:claude-sonnet-4-6] | `/etc/kubernetes/kubelet.yaml` sur le nœud : `UserNamespacesPodSecurityStandards: true` toujours présent                                                                               |
| ±5m 2026-05-26T10:05 | \[anthropic:claude-sonnet-4-6] | L'inspection de la configuration machine complète confirme que la clé n'a pas été retirée : comportement de fusion stratégique confirmé                                                |
| ±5m 2026-05-26T10:13 | \[anthropic:claude-sonnet-4-6] | Patch JSON6902 (`op: remove`) tenté → `JSON6902 patches are not supported for multi-document machine configuration`                                                                    |
| ±5m 2026-05-26T10:15 | \[anthropic:claude-sonnet-4-6] | Configuration machine complète extraite avec `talosctl get machineconfig -o yaml` ; clé retirée par une expression régulière Python ; enregistrée dans `/tmp/fixed-machineconfig.yaml` |
| ±5m 2026-05-26T10:15 | \[anthropic:claude-sonnet-4-6] | `talosctl apply-config --file /tmp/fixed-machineconfig.yaml` : configuration complète appliquée, état du nœud écrasé                                                                   |
| ±5m 2026-05-26T10:16 | \[system:talos]                | kube-apiserver v1.35.0 démarre sans panique, `READY: True`                                                                                                                             |
| ±5m 2026-05-26T10:16 | \[system:kubernetes]           | Nœud `lungmen-akn-01` : Ready v1.35.0, cluster opérationnel                                                                                                                            |
| ±5m 2026-05-26T10:17 | \[anthropic:claude-sonnet-4-6] | `talosctl upgrade-k8s --to 1.35.0` relancé : toutes les phases se terminent sans erreur                                                                                                |
| ±5m 2026-05-26T10:17 | \[anthropic:claude-sonnet-4-6] | Commit `bddec2cb` : `-[project:lungmen.akn]: Drop UserNamespacesPodSecurityStandards feature gate`                                                                                     |

## Ce qui a bien fonctionné

- **L'outillage Talos reste opérationnel indépendamment de kube-apiserver.** `talosctl containers -k`,
  `talosctl logs -k` et `talosctl apply-config` ont tous fonctionné alors que le port 6443 renvoyait
  `connection refused`. Le diagnostic et la remédiation étaient entièrement possibles sans `kubectl`.
- **`talosctl logs -k` a fait remonter l'erreur exacte immédiatement.** Une seule commande a révélé le feature gate non
  reconnu et a levé toute ambiguïté sur la cause racine en quelques minutes après le plantage.
- **`talosctl upgrade-k8s` est idempotent.** Une fois la configuration corrigée, la commande de mise à jour a pu être
  relancée sans risque de double application ni d'état partiel.
- **`kubelet-serving-cert-approver` s'est rétabli de lui-même.** Ce contrôleur était en `CrashLoopBackOff` depuis \~15 h
  avant la mise à jour ; le cycle de redémarrage pendant la mise à jour a permis d'approuver les CSR en attente, ce qui
  a résolu le problème préexistant sans intervention supplémentaire.

## Analyse des causes racines

**Technique :** 5 Whys **Pourquoi cette technique :** chaîne causale linéaire unique : un seul contrôle préalable
manquant a laissé un flag non reconnu atteindre le binaire en cours d'exécution.

### Analyse

1. **Pourquoi kube-apiserver et kubelet v1.35.0 ont-ils planté ?** → Le feature gate
   `UserNamespacesPodSecurityStandards` figurait dans le patch de configuration machine Talos. Ce gate a été **supprimé
   dans Kubernetes 1.35** (il était valide de 1.29 à 1.34) ; passer un gate non reconnu est une erreur fatale pour les
   deux composants.

2. **Pourquoi le feature gate supprimé était-il toujours dans la configuration ?** → Il avait été ajouté lors de la
   première activation de la prise en charge des user namespaces et n'avait jamais été nettoyé. La procédure de mise à
   jour (`INF-20260525-01`) comporte une étape intitulée « checking for removed Kubernetes component flags », mais
   `talosctl upgrade-k8s` n'inspecte que les flags des composants qu'il gère nativement : il n'analyse ni `extraArgs`,
   ni `extraConfig`, ni les maps de feature gates injectées par le patch Talos de l'utilisateur.

3. **Pourquoi la première correction (patch de fusion) n'a-t-elle pas résolu le problème ?** →
   `talosctl patch machineconfig` implémente un **patch de fusion stratégique** : il fusionne le YAML fourni dans la
   configuration machine courante en ajoutant ou en mettant à jour des clés. Retirer une clé du fichier de patch n'a
   aucun effet : la clé reste dans la configuration en cours d'exécution. C'est la sémantique correcte pour des mises à
   jour incrémentales, mais elle est silencieusement fausse quand l'intention est de supprimer une clé.

4. **Pourquoi ce comportement de fusion n'était-il pas connu à l'avance ?** → La distinction entre la sémantique de
   patch de fusion et la sémantique de remplacement n'est documentée ni dans la procédure de mise à jour ni dans les
   commentaires de `patch-config.yaml`. Le modèle mental par défaut, « retirer du fichier retire du nœud », est faux
   pour cette commande, mais rien dans la documentation locale ne le contredit.

5. **Pourquoi aucune protection n'existait-elle contre cette classe de défaillance ?** → Aucune étape de la liste de
   contrôle préalable à la mise à jour ne valide les feature gates présents dans le patch Talos par rapport à l'ensemble
   des gates supprimés ou passés en GA dans la version cible de Kubernetes. Le contrôle existant des « flags retirés »
   est limité aux flags des composants natifs de Talos et ne produit aucune sortie pour les gates intégrés aux patches
   de l'utilisateur.

### Causes racines

- **`UserNamespacesPodSecurityStandards` non retiré malgré sa suppression de Kubernetes 1.35** : aucun mécanisme ne
  valide la compatibilité des feature gates du patch Talos avec la version cible de Kubernetes. Le contrôle préalable
  existant ne couvre que les flags natifs de Talos.
- **`talosctl patch machineconfig` ne supprime pas de clés** : le comportement de patch de fusion crée un écart
  silencieux entre l'intention (supprimer une clé) et l'effet (la clé reste). Ce comportement n'est pas documenté dans
  la procédure de mise à jour, ce qui en fait un risque latent récurrent pour toute remédiation exigeant la suppression
  d'une clé.

### Facteurs contributifs

- La procédure de mise à jour `INF-20260525-01` se concentre sur les flags des composants gérés par Talos et ne couvre
  pas `extraArgs`, `extraConfig` ni les maps de feature gates fournies par le patch de configuration machine de
  l'utilisateur.
- Les patchs JSON6902, qui permettraient un `op: remove` propre, ne sont pas pris en charge pour les configurations
  machine Talos multi-documents. L'extraction de la configuration complète suivie d'un écrasement avec `apply-config`
  est donc le seul chemin fiable de suppression.
- `patch-config.yaml` ne contient aucun commentaire reliant les feature gates aux versions de Kubernetes dans lesquelles
  ils ont été introduits, sont passés en GA ou ont été supprimés.

## Signaux d'alerte manqués

| Signal                                                                                      | Quand il était visible                       | Pourquoi on n'a pas agi                                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Changelog de Kubernetes 1.35 : `UserNamespacesPodSecurityStandards` supprimé                | Avant la mise à jour                         | Aucune revue systématique des feature gates supprimés par rapport au patch de configuration avant de lancer la mise à jour                   |
| Sortie de `talosctl upgrade-k8s --dry-run` : « checking for removed component flags », vide | Pendant le dry-run (étape 2 de la procédure) | La sortie vide a été interprétée comme « aucun problème » ; elle ne couvre pas les gates des extraArgs/extraConfig fournis par l'utilisateur |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu être changé)

- **Aucun suivi du cycle de vie des feature gates dans `patch-config.yaml`.** Chaque gate a été ajouté au moment du
  besoin et jamais annoté avec sa version d'introduction ou de suppression. Choix délibéré de garder le fichier concis ;
  le coût s'est matérialisé ici.
- **Procédure de mise à jour limitée aux flags natifs de Talos.** Le contrôle préalable des « flags retirés » a été
  conçu pour les composants que `talosctl upgrade-k8s` gère directement. La décision de le cadrer étroitement a laissé
  sans validation les `extraArgs` et `feature-gates` fournis par l'utilisateur.
- **Aucun recoupement entre les changelogs de Kubernetes et le fichier de patch avant la mise à jour.** Une étape de
  revue manuelle, même un grep de 5 minutes sur le changelog, aurait repéré `UserNamespacesPodSecurityStandards` avant
  l'exécution de la mise à jour.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                                                 | Qu'est-ce qui réduirait l'exposition ?                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kubernetes en amont supprime des feature gates à son propre rythme de publication               | Suivre la version de passage en GA ou de suppression de chaque gate dans `patch-config.yaml` ; relire avant chaque changement de version mineure |
| `talosctl upgrade-k8s` n'inspecte pas les `extraArgs`/`feature-gates` fournis par l'utilisateur | Maintenir une liste de contrôle locale préalable à la mise à jour qui couvre explicitement le contenu des patches de l'utilisateur               |

## Leçons systémiques

- **Les contrôles préalables des feature gates supprimés doivent couvrir la configuration fournie par l'utilisateur, pas
  seulement les flags natifs de Talos.** L'étape existante donne un bilan sain pour tout ce que `talosctl upgrade-k8s`
  gère, mais reste muette sur les feature gates injectés par le patch de configuration machine. Tout gate dont le nom
  n'apparaît pas dans les manifestes de composants propres à Talos passe le contrôle sans être détecté, qu'il soit
  valide ou non pour la version cible de Kubernetes. Cette revue doit être faite manuellement en recoupant le contenu du
  patch avec le changelog de Kubernetes de la version cible.

- **`talosctl patch machineconfig` est une opération additive, pas déclarative.** L'utiliser pour « supprimer » un
  réglage en l'omettant du fichier de patch ne produit ni erreur ni effet sur la clé existante. Quand l'objectif est de
  supprimer une clé de la configuration machine en cours d'exécution, la procédure correcte est : extraire la
  configuration complète, la modifier, puis la réappliquer avec `talosctl apply-config`. Cette distinction doit être
  explicite dans tout runbook qui touche à la remédiation de configuration machine.

- **Travailler sans kube-apiserver est possible et mérite d'être pratiqué.** Tout le diagnostic et la correction de cet
  incident ont été réalisés avec `talosctl` seul. La maîtrise de `talosctl containers -k`, `talosctl logs -k` et
  `talosctl apply-config` est un prérequis pour traiter avec assurance les défaillances du plan de contrôle.

## De la leçon au contrôle

| Leçon                                                                                                                         | Type d'artefact                | Artefact lié                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Les contrôles préalables doivent couvrir les feature gates fournis par l'utilisateur, pas seulement les flags natifs de Talos | Vérification avant déploiement | `docs/procedures/infrastructure/INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md` (étape à ajouter) |
| `talosctl patch machineconfig` est une fusion stratégique ; la suppression exige `apply-config`                               | Fichier de connaissances       | `.agents/knowledge/talos.md`                                                                             |
| Les feature gates des patches devraient consigner leur version de Kubernetes d'introduction et de suppression                 | Commentaire dans le code       | `projects/lungmen.akn/.../patch-config.yaml` (et l'équivalent amiya)                                     |

## Registre des changements

- [ ] \[due:: 2026-06-02] \[priority:: high] \[size:: S] \[owner:: Alexandre] Annoter chaque feature gate de
      `patch-config.yaml` avec sa version d'introduction dans Kubernetes et sa version de suppression connue
  - **Vérification :** Le dry-run de la prochaine montée de version mineure de Kubernetes recoupe chaque gate annoté
    avec le changelog sans trouver de gate orphelin
  - **Sinon :** Même forme d'incident à la prochaine mise à jour mineure de Kubernetes (probablement d'ici 2 mois)

- [ ] \[due:: 2026-06-02] \[priority:: high] \[size:: S] \[owner:: Alexandre] Ajouter dans `INF-20260525-01` une
      vérification explicite préalable à la mise à jour : recouper chaque entrée `extraArgs` / `extraConfig` /
      `feature-gates` avec le changelog de Kubernetes de la version cible
  - **Vérification :** Le dry-run de la prochaine mise à jour mineure de Kubernetes produit une sortie de contrôle
    explicite couvrant les flags fournis par l'utilisateur
  - **Sinon :** La même classe de défaillance « flag non reconnu → panique de l'apiserver » se reproduit à la prochaine
    version mineure de Kubernetes

- [ ] \[due:: 2026-06-09] \[priority:: medium] \[size:: S] \[owner:: Alexandre] Documenter la sémantique fusion contre
      remplacement de `talosctl patch machineconfig` dans `INF-20260525-01` et dans le commentaire d'en-tête de
      `patch-config.yaml`
  - **Vérification :** Le prochain agent ou opérateur confronté à une suppression de clé utilise directement
    `apply-config`, sans tentative de patch de fusion
  - **Sinon :** La reprise après toute future mauvaise configuration répétera l'impasse de la fusion stratégique

## Connaissances pour les agents

- `talosctl patch machineconfig` : applique une **fusion stratégique**, ajoute ou met à jour des clés mais n'en supprime
  jamais. Pour retirer une clé, extraire la configuration complète (`talosctl get machineconfig -o yaml`), la modifier,
  puis `talosctl apply-config --file <chemin>`.
- `talosctl upgrade-k8s` : idempotent. Après correction de la configuration, la relance est sans risque.
- Diagnostic du plan de contrôle Talos : fonctionne sans kube-apiserver. `talosctl containers -k`, `talosctl logs -k` et
  `talosctl apply-config` utilisent directement l'API Talos.
- Feature gates Kubernetes des patches Talos fournis par l'utilisateur : **non** validés par
  `talosctl upgrade-k8s --dry-run`. Le contrôle « removed component flags » ne couvre que les flags natifs de Talos.
- Patchs JSON6902 avec `op: remove` : **non pris en charge** pour les configurations machine Talos multi-documents.

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                                                   | Instance                       |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1 semaine         | 2026-06-02 | Actions 1 et 2 (priorité high) terminées ; annotations et étape de procédure en place                                                 | Revue en solo                  |
| 1 mois            | 2026-06-26 | Action 3 (priorité medium) terminée ; la prochaine mise à jour de Kubernetes s'est faite sans extraction manuelle pour `apply-config` | Après la prochaine mise à jour |

## Pour aller plus loin

- [Mettre à jour Kubernetes avec Omni](../procedures/infrastructure/INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md)
  : la procédure qui reprend la pré-vérification des feature gates issue de cet incident.
- [Mettre à jour Talos avec Omni](../procedures/infrastructure/INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md) : la
  mise à jour de Talos, à faire d'abord si la version cible de Kubernetes l'exige.
