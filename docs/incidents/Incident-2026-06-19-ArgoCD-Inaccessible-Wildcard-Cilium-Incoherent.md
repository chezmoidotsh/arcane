---
title: "ArgoCD inaccessible : nom d'hôte incompatible avec le wildcard de la Gateway Cilium"
date: 2026-06-19
author: "Alexandre"
participants: ["Alexandre", "[anthropic:glm-5-turbo]"]
severity: "Medium"
status: "Open"
detection-method: "User report"
duration: "Unknown"
services-affected: ["argocd"]
users-affected: "Alexandre"
root-cause-family: ["observability-gap", "missing-pre-deploy-check"]
related-incidents: []
---

# Incident 2026-06-19 ArgoCD inaccessible wildcard Cilium incohérent

ArgoCD est resté injoignable à `argocd.akn.chezmoi.sh` parce que Cilium a rejeté sa HTTPRoute sans écrire de statut.
Cette page consigne l'événement, sa cause racine et les actions de suivi.

## Événement

**Attendu :** `argocd.akn.chezmoi.sh` joignable par l'ingress Cilium Gateway API. **Obtenu :** la HTTPRoute de
`argocd.akn.chezmoi.sh` a été rejetée silencieusement par Cilium : aucun statut écrit, aucun trafic routé. L'opérateur
Cilium était de plus en crashloop avec `no kind is registered for the type v1.Gateway`, ce qui empêchait toute
réconciliation des Gateways pendant \~2,5 h avant l'investigation. **Impact :** UI et API d'ArgoCD injoignables à
`argocd.akn.chezmoi.sh`. Durée inconnue (aucune alerte sur le rejet de route ni sur la santé de l'opérateur).
**Résolution :** ajout d'un listener dédié `*.akn.chezmoi.sh` sur la Gateway Cilium, rattachement de la HTTPRoute
d'ArgoCD à ce listener et redémarrage du pod de l'opérateur Cilium (le crashloop a disparu au redémarrage, probablement
un cache corrompu après un problème de connectivité transitoire).

## Cause racine

**Technique :** 5 Whys

1. Pourquoi ArgoCD était-il injoignable ? → La HTTPRoute n'était pas acceptée par la Gateway Cilium.
2. Pourquoi n'était-elle pas acceptée ? → Le listener `*.chezmoi.sh` ne couvre que les sous-domaines à un seul niveau ;
   `argocd.akn.chezmoi.sh` en compte deux.
3. Pourquoi deux niveaux ? → Convention historique (`<service>.akn.chezmoi.sh`) qui fonctionnait avec Envoy Gateway,
   mais pas avec la correspondance de wildcard plus stricte de Cilium.
4. Pourquoi aucune détection ? → Cilium n'écrit aucun statut pour les routes rejetées (échec silencieux), et aucune
   alerte n'existait sur l'attachement des routes ni sur la santé de l'opérateur.
5. Pourquoi l'opérateur était-il en crashloop ? → L'enregistrement du schéma des CRD Gateway API a échoué après un
   incident transitoire, laissant l'opérateur incapable de réconcilier la moindre ressource Gateway.

**Cause racine :** **Cilium Gateway API rejette silencieusement les HTTPRoutes dont le nom d'hôte ne correspond pas au
wildcard du listener, sans statut ni alerte, et la migration d'Envoy Gateway vers Cilium n'a pas validé l'attachement
des routes.**

## Registre des changements

- [x] [due:: 2026-06-26] [priority:: high] [size:: M] [owner:: Alexandre] Ajouter une alerte sur les redémarrages de
      l'opérateur Cilium et sur les conditions `Programmed=false` des listeners de Gateway
  - **Vérification :** l'alerte Grafana se déclenche dans les 5 min suivant un redémarrage de l'opérateur Cilium ou une
    dégradation d'un listener
  - **Sinon :** les prochains changements de Gateway échouent silencieusement, sans détection

- [x] [due:: 2026-06-26] [priority:: medium] [size:: S] [owner:: Alexandre] Auditer toutes les HTTPRoutes des
      clusters : profondeur du nom d'hôte et compatibilité avec le wildcard du listener
  - **Vérification :** aucune route à sous-domaine multi-niveaux ne pointe vers un listener wildcard à un seul niveau
  - **Sinon :** le même rejet se reproduit sur d'autres services

- [x] [due:: 2026-06-26] [priority:: low] [size:: S] [owner:: Alexandre] Ajouter un listener `*.akn.chezmoi.sh` à la
      Gateway Cilium de lungmen.akn
  - **Vérification :** `kubectl get gateway` montre le listener `akn.chezmoi.sh-websecure` sur lungmen.akn
  - **Sinon :** les services de lungmen.akn qui utilisent `*.akn.chezmoi.sh` subissent la même incompatibilité de
    wildcard

## Connaissances pour les agents

- \[Cilium Gateway API] : le wildcard `*.chezmoi.sh` ne couvre que les sous-domaines à un seul niveau (par exemple
  `auth.chezmoi.sh`), pas les sous-domaines multi-niveaux (par exemple `argocd.akn.chezmoi.sh`). Utiliser un listener
  explicite par profondeur quand des noms d'hôte multi-niveaux existent.
- \[Cilium Gateway API] : quand Cilium rejette une HTTPRoute pour cause de nom d'hôte incompatible, il n'écrit **aucun
  statut** : le tableau `status.parents` de la route omet le contrôleur Cilium. Envoy Gateway, lui, écrit des conditions
  de rejet explicites.
- \[Opérateur Cilium] : si l'opérateur est en crashloop avec `no kind is registered for the type v1.Gateway`, supprimer
  le pod pour le redémarrer résout souvent le problème (probablement un cache d'informer corrompu après une perturbation
  transitoire de l'API server).

## Pour aller plus loin

- [Passerelles et DNS Reference](../reference/Passerelles-et-DNS-Reference.md) : les Gateways Cilium `external` et
  `internal` de chaque cluster et leurs listeners
