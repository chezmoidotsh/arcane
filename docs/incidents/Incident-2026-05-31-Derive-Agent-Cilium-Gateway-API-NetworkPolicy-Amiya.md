---
title:
  "oci.chezmoi.sh inaccessible après la migration vers Cilium Gateway API — dérive de configuration de l'agent et
  mauvaise identité dans la NetworkPolicy"
date: 2026-05-31
author: "Alexandre"
participants:
  - "Alexandre"
  - "[github-copilot:claude-sonnet-4.6]"
severity: "High"
status: "Open"
detection-method: "Manual discovery"
duration: "~2h55m (15:36 → ~18:31 UTC)"
services-affected:
  - "oci.chezmoi.sh (registre OCI Zot — amiya.akn)"
  - "workloads de lungmen.akn qui tirent leurs images depuis oci.chezmoi.sh (ImagePullBackOff — secondaire)"
users-affected:
  "moi seul — registre OCI inaccessible ; une mise à jour de Newt sur lungmen a déclenché des ImagePullBackOff pour les
  workloads qui tiraient leurs images du registre indisponible"
root-cause-family:
  - "state-drift"
  - "network-policy-incomplete"
related-incidents:
  - path: "docs/incidents/Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md"
    relation: "Même famille state-drift — changement de configuration appliqué mais composant non redémarré"
related-adrs: []
related-issues: []
---

# Incident 2026-05-31 Dérive Agent Cilium Gateway API NetworkPolicy Amiya

Après la migration d'`amiya.akn` d'Envoy Gateway vers Cilium Gateway API, `oci.chezmoi.sh` (registre OCI Zot) est resté
inaccessible pendant près de trois heures. Deux défaillances indépendantes se sont cumulées : l'agent Cilium n'avait pas
été redémarré après l'activation de Gateway API dans sa ConfigMap, et la CiliumNetworkPolicy de Zot ne correspondait pas
à l'identité `reserved:ingress` utilisée par le trafic Gateway API. Cette page contient la chronologie, l'analyse des
causes racines, les leçons et les actions de suivi.

## Résumé exécutif

Après la migration d'`amiya.akn` d'Envoy Gateway vers Cilium Gateway API, `oci.chezmoi.sh` (registre OCI Zot) était
totalement inaccessible : les connexions TCP sur les ports 80 et 443 étaient refusées depuis presque trois heures. Seul
Zot passait alors par la nouvelle passerelle ; tous les autres services d'`amiya.akn` restaient sur l'ancien Envoy
Gateway et n'étaient pas touchés. Deux défaillances indépendantes se sont cumulées : (1) le DaemonSet de l'agent Cilium
n'a jamais été redémarré après l'activation de Gateway API dans sa ConfigMap, si bien que l'agent en cours d'exécution
ignorait silencieusement la nouvelle configuration de la passerelle ; (2) la CiliumNetworkPolicy de Zot était écrite
pour l'identité par namespace d'Envoy Gateway et ne correspondait pas à l'identité `reserved:ingress` de Cilium utilisée
pour le trafic Gateway API. Impact secondaire : une mise à jour de Newt sur `lungmen.akn` pendant la panne a déclenché
des ImagePullBackOff pour les workloads qui tiraient leurs images du registre indisponible. Les deux causes racines ont
été corrigées successivement, ce qui a rétabli le service complet.

## Résumé de l'événement

**Résultat attendu :** après la création de la nouvelle Gateway Cilium (`in-gateway-system/default`) et le rattachement
de l'HTTPRoute `zot` à celle-ci, `https://oci.chezmoi.sh` devait servir les requêtes via le proxy Envoy intégré à
Cilium, avec terminaison TLS.

**Résultat obtenu :** les ports 80 et 443 sur `10.0.2.3` (l'IP LoadBalancer de la Gateway) refusaient toutes les
connexions TCP. Le DNS résolvait correctement et l'objet Gateway affichait `PROGRAMMED=True`, mais aucun listener
n'était actif, car l'agent Cilium ignorait la configuration de la passerelle. Après le redémarrage de l'agent, qui a
fait apparaître la seconde défaillance, toutes les requêtes renvoyaient HTTP 503 à cause d'une NetworkPolicy qui
bloquait le trafic du proxy Envoy de Cilium.

**Impact :** seul Zot (`oci.chezmoi.sh`) passait par la nouvelle Gateway Cilium au moment de l'incident ; tous les
autres services d'`amiya.akn` restaient sur l'ancien Envoy Gateway et n'étaient pas touchés. Impact secondaire : une
mise à jour de Newt sur `lungmen.akn` pendant la fenêtre de panne a déclenché des ImagePullBackOff pour les workloads
qui tiraient leurs images du registre indisponible. Aucune perte de données ; aucune exposition de sécurité. Remarque :
`lungmen.akn` présente indépendamment les mêmes problèmes de dérive de configuration Cilium et d'identité dans les
NetworkPolicies (toutes les applications synchronisées automatiquement vers Cilium Gateway, donc incident distinct).

**Durée :** `2026-05-31T15:36Z` (Gateway créée, premier avertissement de dérive de configuration) →
`±? 2026-05-31T18:31Z` (200 OK confirmé), soit environ 2h55m.

**Premier signal :** test manuel (`curl http://10.0.2.3`) par Alexandre à `±? 2026-05-31T18:00`. Aucune alerte
n'existait ; la panne durait silencieusement depuis environ 2h30 avant sa découverte.

## Chronologie

<!-- skew: horodatages exacts issus des journaux structurés (JSON) de l'opérateur Cilium et des journaux d'accès xDS de
cilium-envoy ; souvenirs d'Alexandre pour les entrées ±? ; horodatages de curl issus de l'historique du terminal.
Décalage d'horloge entre les nœuds du cluster et le poste de travail non mesuré. -->

| Heure (UTC)           | Acteur                              | Événement ou décision                                                                                                                                        |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2026-05-31T15:36:12` | \[system:cilium-operator]           | Gateway `in-gateway-system/default` créée. L'opérateur journalise une dérive de configuration : `enable-gateway-api=false` dans l'agent en cours d'exécution |
| `2026-05-31T15:36:12` | \[system:cilium-operator]           | `CiliumEnvoyConfig cilium-gateway-default` créée, mais l'agent l'ignore silencieusement (fonctionnalité désactivée)                                          |
| `2026-05-31T15:54:35` | \[system:cilium-operator]           | Gateway réconciliée avec succès (secret TLS trouvé). `PROGRAMMED=True`. Aucun listener actif, la dérive persiste                                             |
| `±? 2026-05-31T18:00` | Alexandre                           | Découverte manuelle : `curl http://10.0.2.3` → connexion refusée. L'investigation commence                                                                   |
| `±? 2026-05-31T18:10` | \[github-copilot:claude-sonnet-4.6] | Balayage de diagnostic : DNS OK, IP de la Gateway OK, certificat OK, HTTPRoute Accepted OK. Aucun pod dans `in-gateway-system`                               |
| `±? 2026-05-31T18:15` | \[github-copilot:claude-sonnet-4.6] | Lecture des journaux de l'opérateur : avertissements de dérive de configuration identifiés. Décision de redémarrer le DaemonSet Cilium                       |
| `2026-05-31T18:22:31` | Alexandre                           | `kubectl -n kube-system rollout restart daemonset cilium` : le pod de l'agent redémarre                                                                      |
| `2026-05-31T18:22:44` | \[system:cilium-envoy]              | Mise à jour xDS reçue : listener `in-gateway-system/cilium-gateway-default/listener` ajouté                                                                  |
| `2026-05-31T18:26:21` | Alexandre                           | `curl` renvoie désormais HTTP 503 (connexion refusée → 503 : la seconde défaillance apparaît)                                                                |
| `2026-05-31T18:28:11` | \[github-copilot:claude-sonnet-4.6] | Nouvelle netpol `allow-zot-from-cilium-gateway` (`fromEntities: [ingress]`) appliquée via kubectl                                                            |
| `2026-05-31T18:28:12` | \[system:argocd]                    | La synchronisation automatique d'ArgoCD détecte la suppression de l'ancienne politique et la recrée depuis git (git l'emporte)                               |
| `±? 2026-05-31T18:31` | Alexandre                           | Politique à entité ingress commitée dans git ; ArgoCD synchronise ; `curl -sv https://oci.chezmoi.sh/v2/` → 200 OK                                           |

## Ce qui a bien fonctionné

- **Le DNS était correct dès le départ.** `dig oci.chezmoi.sh` renvoyait `10.0.2.3` immédiatement après la création de
  la Gateway, car external-dns lit correctement l'annotation de l'HTTPRoute.
- **Le certificat TLS était prêt.** cert-manager a émis le wildcard et Cilium l'a copié dans `cilium-secrets` sans
  intervention.
- **L'opérateur Cilium a journalisé la dérive de configuration immédiatement.** L'écart exact
  (`enable-gateway-api=false`, `enable-envoy-config=false`) figurait dans les journaux structurés dès `T15:36:12`. Le
  signal était présent ; il n'a pas été observé pendant 2h30.
- **Le diagnostic itératif a convergé vite une fois lancé.** Du premier test manuel au 503 (redémarrage de l'agent),
  environ 26 minutes ; du 503 au 200 OK (correction de la NetworkPolicy), environ 5 minutes.
- **L'auto-réparation d'ArgoCD a révélé l'écart entre git et l'état réel.** La resynchronisation automatique qui a
  réappliqué l'ancienne politique a imposé de commiter le correctif dans git plutôt que de s'appuyer sur un
  contournement uniquement via kubectl.

## Analyse des causes racines

**Technique :** 5 Whys, appliqués indépendamment à chacune des deux chaînes de défaillance.

**Pourquoi cette technique :** deux défaillances distinctes et successives, avec des chaînes de causes linéaires et
claires ; aucune ramification ni dépendance parallèle entre elles qui justifierait Ishikawa ou Swiss Cheese.

### Analyse

Chaîne de défaillance 1 : aucun listener actif (connexion refusée).

1. **Pourquoi les ports 80/443 refusaient-ils les connexions ?** → `cilium-envoy` n'avait aucun listener pour
   `in-gateway-system/cilium-gateway-default`.
2. **Pourquoi `cilium-envoy` n'avait-il aucun listener ?** → L'agent Cilium n'a jamais poussé de mise à jour xDS vers
   `cilium-envoy` pour la `CiliumEnvoyConfig` créée par l'opérateur.
3. **Pourquoi l'agent n'a-t-il pas poussé la mise à jour ?** → L'agent en cours d'exécution avait
   `enable-gateway-api=false` et `enable-envoy-config=false` dans sa configuration active ; il ignorait silencieusement
   la réconciliation des `CiliumEnvoyConfig`.
4. **Pourquoi l'agent en cours d'exécution avait-il ces drapeaux désactivés ?** → La ConfigMap `cilium-config` avait été
   mise à jour (drapeaux passés à `true`), mais le pod du DaemonSet de l'agent (`cilium-wqd2x`, âge 3d20h) n'avait pas
   été redémarré. Cilium ne recharge pas à chaud les changements de ConfigMap : un redémarrage du pod est nécessaire.
5. **Pourquoi le DaemonSet n'a-t-il pas été redémarré après le changement de ConfigMap ?** → **CAUSE RACINE :** aucune
   étape documentée de la procédure de migration n'impose de redémarrer le DaemonSet Cilium lors de l'activation de
   nouveaux drapeaux de fonctionnalité. Le redémarrage de l'opérateur (qui a été fait) est insuffisant : le pod de
   l'agent doit aussi redémarrer indépendamment.

Chaîne de défaillance 2 : 503 après le redémarrage de l'agent (NetworkPolicy non conforme).

1. **Pourquoi `curl` renvoyait-il 503 après le redémarrage de l'agent ?** → `cilium-envoy` recevait un dépassement de
   délai de connexion depuis le backend Zot (`10.0.48.x:5000`).
2. **Pourquoi la connexion vers Zot expirait-elle ?** → La CiliumNetworkPolicy `allow-zot-from-envoy-gateway` bloquait
   la requête ; le pod de Zot ne répondait pas au TCP SYN de `cilium-envoy`.
3. **Pourquoi la NetworkPolicy bloquait-elle la requête ?** → La politique utilisait `fromEndpoints` avec
   `io.kubernetes.pod.namespace: in-gateway-system`. Le DaemonSet `cilium-envoy` est dans `kube-system` et s'exécute
   avec `hostNetwork: true` ; son trafic porte l'identité Cilium `reserved:ingress`, pas un label de namespace.
4. **Pourquoi la politique utilisait-elle une correspondance par namespace ?** → La politique avait été écrite pour
   Envoy Gateway, qui exécute des pods proxy Envoy dédiés _dans_ `in-gateway-system`. Cette approche est valide pour
   Envoy Gateway mais incorrecte pour Cilium Gateway API, qui utilise un DaemonSet partagé en réseau hôte.
5. **Pourquoi la politique n'a-t-elle pas été mise à jour pendant la migration ?** → **CAUSE RACINE :** la migration
   d'Envoy Gateway vers Cilium Gateway API ne s'est pas accompagnée d'une revue des NetworkPolicies pour remplacer la
   correspondance d'endpoints par namespace par l'entité Cilium correcte (`reserved:ingress`). La différence de
   comportement (pod dédié dans un namespace contre DaemonSet en réseau hôte avec identité réservée) n'est pas évidente
   et n'était documentée nulle part dans le dépôt.

### Causes racines

- **L'activation d'un drapeau de fonctionnalité Cilium exige un redémarrage du DaemonSet, pas seulement une mise à jour
  de la ConfigMap.** Activer `enable-gateway-api`, `enable-envoy-config` ou `gateway-api-secrets-namespace` dans
  `cilium-config` n'a aucun effet sur les pods d'agent en cours d'exécution. Le DaemonSet doit être redéployé. C'est une
  contrainte opérationnelle non évidente, absente du code et des runbooks.

- **Le trafic Cilium Gateway API arrive sur les pods backend avec l'identité `reserved:ingress`, et non depuis le
  namespace de la passerelle.** Les NetworkPolicies écrites pour Envoy Gateway (pods limités à un namespace) sont
  silencieusement fausses avec Cilium Gateway API (DaemonSet en réseau hôte). La politique paraît syntaxiquement valide
  et Cilium l'accepte ; l'erreur n'apparaît qu'à l'exécution, sous charge.

### Facteurs contributifs

- **Aucun contrôle d'état ni test de fumée après la création de la passerelle.** La panne silencieuse de 2h30 n'a été
  possible que parce qu'aucune vérification automatique ne testait l'accessibilité d'`oci.chezmoi.sh` après la
  migration.
- **`PROGRAMMED=True` est trompeur.** La surface de statut de Gateway API montre la Gateway comme programmée (IP
  attribuée, certificat prêt) même quand le push de configuration xDS a échoué silencieusement. Aucune entrée de
  `Status.Conditions` ne distingue « IP attribuée » de « listener actif ».

## Signaux d'alerte manqués

| Signal                                                                                     | Quand il était visible | Pourquoi on n'a pas agi                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------- |
| Journaux de l'opérateur Cilium : `warn Mismatch found key=enable-gateway-api actual=false` | `2026-05-31T15:36:12`  | Aucune supervision du flux de journaux de l'opérateur Cilium ; non observé         |
| `kubectl get pods -n in-gateway-system` ne montre aucun pod Envoy (attendu avec Cilium)    | `2026-05-31T15:36`     | L'absence de pods n'a pas alarmé : Cilium utilise le réseau hôte                   |
| Aucun test de connectivité immédiatement après la migration (« test de fumée »)            | `2026-05-31T15:36`     | La checklist de migration ne comprend pas de test d'accessibilité après la bascule |

## Analyse du contrôle

### Sous contrôle (ce qui aurait pu être changé)

- **Ajouter une étape de redéploiement du DaemonSet à la procédure de mise à jour ou de changement de configuration de
  Cilium.** La procédure de migration Cilium (runbook ou checklist) doit imposer explicitement
  `kubectl -n kube-system rollout restart daemonset cilium` chaque fois que des drapeaux de fonctionnalité sont modifiés
  dans `cilium-config`.
- **Documenter l'exigence de l'entité `reserved:ingress` pour Cilium Gateway API.** Toute application qui migre d'Envoy
  Gateway vers Cilium Gateway API doit remplacer le `fromEndpoints` limité à un namespace par `fromEntities: [ingress]`.
  Un fichier de connaissances ou une règle OPA peut encoder cette exigence.
- **Ajouter un test de fumée à la checklist de migration Gateway API.** `curl -sv https://<hostname>/` immédiatement
  après la création de la route aurait détecté les deux défaillances en moins d'une minute.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                                                                              | Qu'est-ce qui réduirait l'exposition ?                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Conception de Cilium : les changements de ConfigMap exigent un redémarrage du pod (pas de rechargement à chaud des drapeaux) | Accepter la contrainte ; encoder explicitement l'étape de redémarrage dans chaque runbook et comme contrôle préalable au déploiement |
| Conception de Cilium : `PROGRAMMED=True` n'implique pas « listener actif »                                                   | Ajouter une alerte ou un test de fumée qui valide l'accessibilité TCP réelle, pas seulement le statut de l'objet API                 |

## Leçons systémiques

- **Les changements de drapeaux de fonctionnalité dans la ConfigMap Cilium n'ont aucun effet tant que les agents ne
  redémarrent pas.** Le redémarrage de l'opérateur suit un cycle de vie distinct de celui du DaemonSet de l'agent. Cela
  se reproduira à chaque future activation de fonctionnalité Cilium (Gateway API, masquerade BPF, BGP, etc.) tant que
  l'étape de redémarrage n'est pas explicite dans la procédure.

- **Cilium Gateway API repose sur un modèle d'identité du trafic fondamentalement différent de celui d'Envoy Gateway.**
  Toute NetworkPolicy existante écrite pour le modèle de pods par namespace d'Envoy Gateway bloque silencieusement le
  trafic après migration vers Cilium Gateway API. C'est un piège de migration qui concerne toutes les applications du
  cluster, pas seulement Zot.

## De la leçon au contrôle

| Leçon                                                            | Type d'artefact          | Artefact lié                                                                                           |
| ---------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Les drapeaux de la ConfigMap Cilium exigent un redémarrage du DS | Fichier de connaissances | `.agents/knowledge/cilium.md`, puce « Feature flag activation » (À définir)                            |
| Les drapeaux de la ConfigMap Cilium exigent un redémarrage du DS | Étape de procédure       | `docs/procedures/`, procédure de changement de configuration Cilium (À définir, avec échéance)         |
| GW API de Cilium → identité `reserved:ingress`                   | Fichier de connaissances | `.agents/knowledge/cilium.md`, puce « Gateway API traffic identity » (À définir)                       |
| GW API de Cilium → identité `reserved:ingress`                   | Règle OPA                | `catalog/opa/`, imposer `fromEntities: [ingress]` pour les netpol exposées à la passerelle (À définir) |
| Aucun test de fumée après la migration                           | Étape de procédure       | Checklist de migration des passerelles (À définir, avec échéance)                                      |

## Registre des changements

- [x] [due:: 2026-05-31] [priority:: high] [size:: S] [owner:: Alexandre] Remplacer `fromEndpoints(in-gateway-system)`
      par `fromEntities: [ingress]` dans la NetworkPolicy de Zot et renommer le fichier en
      `allow-zot-from-cilium-gateway`
  - **Vérification :** `curl -sv https://oci.chezmoi.sh/v2/` renvoie HTTP 200
  - **Sinon :** le registre Zot reste inaccessible via la Gateway Cilium

- [ ] [due:: 2026-06-07] [priority:: high] [size:: S] [owner:: Alexandre] Écrire `.agents/knowledge/cilium.md` avec deux
      puces : (1) l'activation d'un drapeau de fonctionnalité exige un redémarrage du DaemonSet ; (2) l'identité du
      trafic Gateway API est `reserved:ingress`
  - **Vérification :** les futures sessions d'agents IA qui touchent à Cilium chargent automatiquement le fichier de
    connaissances et ne répètent aucune des deux erreurs
  - **Sinon :** le prochain changement de configuration Cilium échoue silencieusement ; la prochaine migration vers
    Gateway API reproduit la mauvaise NetworkPolicy

- [ ] [due:: 2026-06-14] [priority:: medium] [size:: S] [owner:: Alexandre] Ajouter à la checklist de migration des
      passerelles une étape de test de fumée : `curl -sv https://<hostname>/` immédiatement après la création de
      l'HTTPRoute ; HTTP 200 ou 401 attendu (pas de connexion refusée)
  - **Vérification :** la prochaine migration de route Gateway API comprend un test d'accessibilité documenté avant que
    la migration soit déclarée terminée
  - **Sinon :** des pannes silencieuses de même durée restent possibles lors des prochaines migrations

- [ ] [due:: 2026-06-14] [priority:: medium] [size:: M] [owner:: Alexandre] Passer en revue toutes les autres
      applications d'`amiya.akn` dont le `fromEndpoints` cible le namespace `in-gateway-system` et les remplacer par
      `fromEntities: [ingress]` pour toute application derrière Cilium Gateway API
  - **Vérification :** `grep -r "in-gateway-system" projects/amiya.akn/src/apps/` ne renvoie aucune correspondance
    `fromEndpoints` de CiliumNetworkPolicy
  - **Sinon :** les autres applications migrées vers Cilium Gateway API rencontreront le même problème de 503

- [ ] [due:: 2026-06-30] [priority:: low] [size:: M] [owner:: Alexandre] Ajouter une règle OPA dans `catalog/opa/` pour
      avertir quand une CiliumNetworkPolicy ciblant une application derrière une Gateway Cilium utilise `fromEndpoints`
      avec un namespace de passerelle plutôt que `fromEntities: [ingress]`
  - **Vérification :** la CI rejette une PR qui ajoute une politique `fromEndpoints(in-gateway-system)` à une
    application dotée d'une HTTPRoute sur Gateway Cilium
  - **Sinon :** le motif se reproduit silencieusement à chaque migration d'application ; OPA n'offre aucun filet de
    sécurité avant déploiement

## Connaissances pour les agents

- \[Cilium] : l'activation de drapeaux de fonctionnalité dans la ConfigMap `cilium-config` (par exemple
  `enable-gateway-api`, `enable-envoy-config`, `gateway-api-secrets-namespace`) exige un
  `kubectl -n kube-system rollout restart daemonset cilium`. L'agent en cours d'exécution ne recharge pas la ConfigMap à
  chaud. Le redémarrage de l'**opérateur** Cilium est indépendant et insuffisant : le DaemonSet de l'agent doit aussi
  redémarrer.

- \[Cilium Gateway API] : le trafic proxifié par Cilium Gateway API (via le DaemonSet `cilium-envoy` dans `kube-system`,
  `hostNetwork: true`) arrive sur les pods backend avec l'identité Cilium `reserved:ingress`, **et non** avec un label
  de pod du namespace de la passerelle. Les CiliumNetworkPolicies doivent utiliser `fromEntities: [ingress]`, et non
  `fromEndpoints` avec `io.kubernetes.pod.namespace: in-gateway-system`.

- \[Cilium Gateway API] : `Gateway.status` à `PROGRAMMED=True` signifie que le Service LoadBalancer a une IP et que le
  certificat est prêt. Cela ne garantit **pas** que le listener xDS est actif dans `cilium-envoy`. Une réponse de
  connexion refusée (et non un dépassement de délai) indique l'absence de listener, probablement parce que l'agent n'a
  pas encore traité la `CiliumEnvoyConfig` (chercher des avertissements de dérive de configuration dans les journaux de
  l'opérateur).

- \[Cilium operator logs] : quand l'opérateur détecte une dérive de configuration entre la ConfigMap et l'agent en cours
  d'exécution, il journalise `warn Mismatch found key=<flag>` au niveau `WARN`. Ces avertissements sont le seul signal
  observable qu'un redémarrage de l'agent est nécessaire après un changement de ConfigMap.

## Suivi de résolution

### Fait

- [x] NetworkPolicy `allow-zot-from-envoy-gateway` remplacée par `allow-zot-from-cilium-gateway`
      (`fromEntities: [ingress]`)
- [x] `kustomization.yaml` mis à jour et `dist/` régénéré

### En attente — après le commit de ce post-mortem

- [ ] `.agents/knowledge/cilium.md` créé — \[pas encore d'issue]
- [ ] Revue des NetworkPolicies des autres applications — \[pas encore d'issue]
- [ ] Étape de test de fumée ajoutée à la checklist de migration des passerelles — \[pas encore d'issue]
- [ ] Règle OPA pour imposer l'entité de la passerelle — \[pas encore d'issue]

## Calendrier de vérification

| Point de contrôle | Date       | Ce qui sera vérifié                                                                                                           | Instance      |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1 semaine         | 2026-06-07 | Fichier de connaissances créé ; aucune autre application en 503 derrière Cilium Gateway                                       | Revue en solo |
| 1 mois            | 2026-06-30 | Règle OPA esquissée ; test de fumée dans la checklist de migration ; aucune récidive du 503                                   | Revue en solo |
| 3 mois            | 2026-08-31 | Une défaillance silencieuse par dérive de configuration s'est-elle reproduite lors d'un changement de fonctionnalité Cilium ? | Revue en solo |

## Pour aller plus loin

- [NET001, règle OPA sur l'entité ingress de Cilium Gateway](../../catalog/opa/rules/NET001-require-cilium-gateway-ingress-entity.md)
  : la règle qui encode la correspondance `fromEntities: [ingress]` exigée par cet incident.
- [Passerelles et DNS Reference](../reference/Passerelles-et-DNS-Reference.md) : les Gateways Cilium actuelles de chaque
  cluster.
- [ADR-012, remplacer Kyverno par OPA](../decisions/ADR-012-Remplacer-Kyverno-par-OPA.md) : le choix d'OPA en CI pour
  valider les manifestes.
- [Incident 2026-05-25, échec d'authentification Vault du ClusterSecretStore de Lungmen](Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md)
  : même famille state-drift, changement de configuration appliqué sans redémarrage du composant.
