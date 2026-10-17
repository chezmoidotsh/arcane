---
title: Échec de la mise à jour Cilium 1.19 — nœud amiya.akn injoignable
date: 2026-05-27
author: Alexandre
participants:
  - Alexandre
  - "[anthropic:claude-sonnet-4-6]"
severity: Medium # le cluster est revenu par un redémarrage à chaque fois ; aucune perte de données ; 8 tentatives en 3 jours
status: Open
detection-method: Manual discovery
duration: "3 days, 8 attempts, ~5h active investigation"
services-affected:
  - amiya.akn (cluster entier — Cilium est le CNI)
  - OpenBao (vault.chezmoi.sh — utilisé par tous les clusters)
  - Pocket-Id (fournisseur OIDC de tous les clusters et services)
  - Zot registry (images de conteneurs de tous les clusters)
users-affected: >-
  moi/famille — homelab à opérateur unique ; impact indirect sur tous les clusters en aval pendant chaque fenêtre de
  crash (~10–15 min par tentative) et, à partir de la fin de journée du 27, lorsque tous les clusters CNPG ont été mis
  en hibernation pour éviter la corruption de PostgreSQL.
root-cause-family:
  - upstream-regression
related-incidents: []
related-issues:
  - "https://github.com/cilium/cilium/issues/46010"
related-adrs: []
---

# Incident 2026-05-27 Échec mise à jour Cilium 1-19

Migré le 2026-10-11 ; les faits décrits sont ceux de l'époque et n'ont pas été revérifiés.

Cette page est le post-mortem de l'échec de la mise à jour de Cilium 1.18.10 vers 1.19.4 sur le cluster mono-nœud
`amiya.akn`, répétée en 8 tentatives sur 3 jours. Elle contient la chronologie, l'analyse des causes racines (Ishikawa),
les leçons systémiques, le registre des changements et les connaissances à retenir pour les agents.

> [!NOTE]\
> Note du 2026-10-11 : le dépôt n'est plus figé sur Cilium 1.18.10. Les manifestes Cilium de
> `catalog/talos/manifests/cilium/` sont `1.19.5-native.yaml`, `1.20.0-native.yaml` et `1.20.2-native.yaml`. Le cluster
> `rhodes.akn` référence le manifeste 1.19.5
> (`projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml`), `lungmen.akn` le 1.20.0
> (`projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml`) et la base Omni le 1.20.2
> (`catalog/omni/clustertemplates/base.yaml`). Le texte ci-dessous décrit la situation du 2026-05-27.

## Résumé exécutif

Une mise à jour planifiée de Cilium de la version 1.18.10 à la version 1.19.4 sur le cluster mono-nœud `amiya.akn` a
échoué à 8 reprises sur 3 jours. À chaque tentative, le nœud perdait toute connectivité en 12 secondes après le
démarrage du nouvel agent, et seul un redémarrage forcé le remettait en service. La cause racine n'a pas été identifiée
entièrement : elle se limite au programme BPF (Berkeley Packet Filter, technologie du noyau Linux qui exécute des
programmes isolés pour filtrer et rediriger les paquets sans les remonter dans l'espace utilisateur ; Cilium s'en sert
pour toute la politique réseau, le routage et l'équilibrage de charge) de datapath de l'hôte qui s'attache à la carte
réseau (NIC) physique (`enp1s0`, Realtek r8169) par le TC (Traffic Control, sous-système du noyau qui ordonnance et
filtre les paquets) historique, ancienne interface cls_bpf par opposition au mécanisme TCX introduit dans Linux 6.6+,,
sur le noyau Linux 6.18.33. La matrice de tests CI de Cilium n'est pas documentée publiquement, donc la couverture du
noyau 6.18.x dans la version 1.19.4 n'est pas vérifiée. Tous les clusters restent figés en 1.18.10. Aucune donnée n'a
été perdue. La mise à jour sera retentée quand Cilium 1.19.5 ou un éventuel correctif sera disponible sur l'issue.

## Résumé de l'événement

**Résultat attendu :** la mise à jour progressive de Cilium se termine ; le nouvel agent 1.19 prend le relais sans
interruption de service.

**Résultat obtenu :** chaque tentative a provoqué une perte totale de paquets dans les 12 secondes suivant l'attachement
des programmes BPF du nouvel agent à `enp1s0`. Le nœud était complètement injoignable (API Talos, API Kubernetes et
sessions de stockage iSCSI coupées). Chaque fois, la récupération a exigé un redémarrage physique ou par IPMI.

**Impact :** plusieurs fenêtres de récupération de ~10–15 min sur 3 jours. Tous les clusters en aval ont perdu l'accès à
OpenBao, Pocket-Id et au registre Zot pendant chaque fenêtre. Aucune perte de données persistantes (les sessions iSCSI
se sont rétablies après le redémarrage ; les clusters CNPG ont été mis en hibernation avant les dernières tentatives).

**Durée :** du 2026-05-25 au 2026-05-27 (~5 h d'investigation active, surtout les 26 et 27).

**Premier signal :** nœud injoignable immédiatement après la première tentative de mise à jour (2026-05-19).

## Chronologie

<!-- skew: ±? — Tous les horodatages sont reconstitués à partir de transcriptions de sessions et de fragments partiels
des journaux CRI/machined, sans corrélation précise entre l'horloge de l'hôte de la transcription et celle du cluster.
Les valeurs sont arrondies à ~5 min près et marquées ±? pour refléter cette incertitude. Les 28 ms de la tentative 7
sont mesurées entre deux lignes de journal Cilium consécutives et sont fiables en valeur relative.
Pour vérifier lors des prochains incidents : `talosctl time --nodes 10.0.2.1` avant et après. -->

| Heure (UTC)         | Acteur                                     | Événement ou décision                                                                           |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| ±? 2026-05-26T19:25 | \[system:argocd] / Alexandre               | **Tentative 1** — kustomization mise à jour en 1.19.4, début du déploiement                     |
| ±? 2026-05-26T19:25 | \[system:kubernetes]                       | Le nouveau conteneur `cilium-agent` démarre (état Running)                                      |
| ±? 2026-05-26T19:25 | \[system:kubernetes]                       | Dernière entrée du journal machined — nœud complètement injoignable                             |
| ±? 2026-05-26T20:30 | Alexandre                                  | Reprise de la session ; erreur de connectivité constatée ; retour arrière vers 1.18.10 lancé    |
| ±? 2026-05-26T20:40 | Alexandre / \[anthropic:claude-sonnet-4-6] | Correctif `k8sServiceHost`/`k8sServicePort` identifié et appliqué                               |
| ±? 2026-05-26T21:00 | Alexandre                                  | **Tentative 2** — `bpf.enableTCX: false` ajouté ; début du déploiement                          |
| ±? 2026-05-26T21:00 | \[system:kubernetes]                       | `cil_from_netdev`/`cil_to_netdev` s'attachent à `enp1s0` — déclencheur du crash confirmé        |
| ±? 2026-05-27T17:38 | \[anthropic:claude-sonnet-4-6]             | Clusters CNPG (pocket-id, openbao) mis en hibernation avant les nouvelles tentatives            |
| ±? 2026-05-27T17:45 | \[anthropic:claude-sonnet-4-6]             | **Tentative 3** — `cleanBpfState: true` ; début du déploiement → crash, retour arrière          |
| ±? 2026-05-27T17:55 | \[anthropic:claude-sonnet-4-6]             | Pilote de la carte réseau identifié : r8169 (Realtek RTL8168, PCI 10EC:8168)                    |
| ±? 2026-05-27T17:58 | \[anthropic:claude-sonnet-4-6]             | **Tentative 4** — `devices: ~enp1s0` ; début du déploiement → crash (**aucun journal capturé**) |
| ±? 2026-05-27T18:00 | \[anthropic:claude-sonnet-4-6]             | **Tentative 5** — `routingMode: native` ; début du déploiement → crash, retour arrière          |
| ±? 2026-05-27T18:28 | Alexandre                                  | Nœud récupéré ; src ramené à 1.18.10 ; début de la deuxième session                             |
| ±? 2026-05-27T18:36 | \[anthropic:claude-sonnet-4-6]             | **Tentative 6** — `bpf.hostLegacyRouting: true + cleanBpfState: true` → crash                   |
| ±? 2026-05-27T19:03 | \[anthropic:claude-sonnet-4-6]             | **Tentative 7** — `loadBalancer.acceleration: disabled` → crash                                 |
| ±? 2026-05-27T19:03 | \[system:kubernetes]                       | Crash confirmé : 28 ms entre l'attachement TC à `enp1s0` et la perte totale de connectivité     |
| ±? 2026-05-27T19:14 | \[anthropic:claude-sonnet-4-6]             | **Tentative 8** — `enableHostLegacyRouting + bpf.lbLocalhost: false` (issue #46010) → crash     |
| ±? 2026-05-27T20:40 | Alexandre                                  | Investigation suspendue ; arbre de travail ramené à main ; figé en 1.18.10                      |

## Ce qui a bien fonctionné

- **Le retour arrière a toujours été fiable.** Revenir à `quay.io/cilium/cilium:v1.18.10` puis redémarrer a chaque fois
  rétabli le cluster complet. Aucune tentative n'a exigé de nettoyage manuel de l'état BPF.
- **Les bases CNPG ont été mises en hibernation de façon préventive** avant les tentatives du 27 mai, ce qui a écarté
  tout risque de corruption de PostgreSQL en cours de mise à jour à cause de sessions iSCSI coupées.
- **Les sauvegardes ont été faites avant la dernière session** (instantanés OpenBao et Pocket-Id).
- **Le déclencheur du crash a été isolé avec précision.** À la tentative 7, les journaux ont confirmé la fenêtre de 28
  ms entre l'attachement de `cil_from_netdev`/`cil_to_netdev` à `enp1s0` et la perte totale de connectivité : un signal
  précis et reproductible.
- **Élimination systématique.** Huit hypothèses indépendantes ont été testées et écartées ; l'investigation n'est pas
  revenue sur les mêmes impasses.

## Analyse des causes racines

**Technique :** Ishikawa (arête de poisson) **Pourquoi cette technique :** les 5 Whys butaient sur « pourquoi
`bpf_host.c` abandonne-t-il tous les paquets » — il n'y a pas de chaîne linéaire unique. Plusieurs facteurs en
interaction (matériel, noyau, version logicielle, configuration, lacunes de processus) ont contribué sans qu'aucune
cause ne domine. Ishikawa les regroupe par catégorie pour que les conditions structurelles restent visibles même quand
le chemin de code exact reste inconnu.

### Analyse

Catégories de facteurs qui ont convergé pour produire l'échec :

_Matériel_ :

- Carte réseau Realtek RTL8168 (pilote `r8169`) — absente de la liste des pilotes XDP natifs documentés par Cilium
  (mlx4/mlx5, ixgbe, bnxt, virtio-net, …) ; elle retombe sur un traitement SKB plus lent, avec un autre chemin de code.
- Cluster `amiya.akn` mono-nœud — pas de mise à jour progressive possible, pas de chemin de repli dans le cluster.

_Noyau_ :

- Linux 6.18.33-talos — TCX (Linux 6.6+) et TC historique sont tous deux disponibles ; le datapath 1.19 a choisi
  l'attachement TC historique sur cette carte réseau.
- La matrice matérielle/noyau de la CI amont de Cilium n'est pas documentée publiquement ; la couverture de r8169 avec
  6.18.x n'est pas vérifiée.

_Logiciel (Cilium)_ :

- Cilium 1.19.4 embarque des changements de `bpf_host.c` qui interagissent autrement avec la combinaison r8169 + 6.18
  que ne le faisait 1.18.10. Le chemin de code exact qui provoque la perte totale de paquets est inconnu sans accès au
  code source BPF de Cilium et sans session de traçage sur un noyau 6.18.
- Fenêtre reproductible de 28 ms entre l'attachement TC à `enp1s0` et la perte totale de connectivité : elle confirme la
  surface du déclencheur, pas la cause racine à l'intérieur du programme BPF.

_Configuration_ :

- 8 hypothèses testées et écartées : `k8sServiceHost/Port`, `bpf.enableTCX: false`, `cleanBpfState: true`,
  `devices: ~enp1s0`, `routingMode: native`, `bpf.hostLegacyRouting: true`, `loadBalancer.acceleration: disabled`,
  `enableHostLegacyRouting + bpf.lbLocalhost: false`. Aucune n'a rétabli la connectivité → la défaillance est dans le
  code, pas dans la configuration.

_Processus / environnement_ :

- Pas d'environnement de préproduction avec matériel/noyau équivalents → chaque test a eu lieu sur le cluster critique
  de la plateforme.
- Pas de protocole structuré de capture de journaux avant chaque tentative → certaines tentatives n'ont laissé aucune
  preuve exploitable.
- Pas de mesure du décalage d'horloge entre l'hôte de la transcription et les nœuds du cluster → certains horodatages ne
  sont pas fiables.

### Causes racines

- **`bpf_host.c` de Cilium 1.19.4 est incompatible avec la combinaison (Linux 6.18.33 + r8169 + TC historique) de ce
  nœud.** C'est une condition structurelle du homelab : toute future mise à jour mineure de Cilium porte la même
  incertitude tant que Cilium ne publie pas une matrice CI couvrant explicitement r8169 + 6.18.x ou ne corrige pas la
  régression. Le chemin de code exact reste non identifié — la cause racine précise dans `bpf_host.c` exige une
  expertise de niveau amont (traçage BPF du noyau) hors de portée de ce homelab.

### Facteurs contributifs

- **r8169 n'a pas de support XDP natif** — le datapath eBPF de Cilium préfère les pilotes avec support XDP natif (ixgbe,
  mlx4, mlx5, bnxt, virtio-net, …) et retombe sur un traitement SKB plus lent pour les autres. Le pilote r8169 ne figure
  pas dans cette liste (la
  [référence communautaire du support XDP par les pilotes](https://prototype-kernel.readthedocs.io/en/latest/networking/XDP/implementation/drivers.html)
  énumère Mellanox mlx4/mlx5, Netronome nfp, virtio-net, Cavium/Qlogic qede, Cavium thunder/nicvf, Broadcom bnxt et
  Intel ixgbe) ; les pilotes sans XDP natif retombent sur le mode générique `SKB`/`xdpgeneric`. La matrice matérielle de
  la CI de Cilium n'est pas documentée publiquement, donc la couverture explicite de r8169 n'est pas vérifiée.
- **Pas de mesure structurée du temps pendant les tentatives** — les horodatages n'ont pas été capturés
  systématiquement, ce qui rend l'analyse entre sessions peu fiable.
- **Pas d'environnement de préproduction ou de test** — les 8 tentatives ont eu lieu directement sur le cluster
  _critique_ de la plateforme (`amiya.akn`), sans test préalable sur un matériel équivalent. Ce cluster héberge des
  charges critiques (OpenBao, Pocket-Id, Zot) utilisées par tous les autres clusters du homelab. Un environnement de
  préproduction aurait confiné l'échec à un contexte hors production, mais il suppose d'investir dans un matériel en
  double, ce qui n'est pas envisagé pour le moment.

## Signaux d'alerte manqués

| Signal                                                                                                          | Quand il était visible                      | Pourquoi on n'a pas agi                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Les notes de version de Cilium 1.19 mentionnent `bpf_host.c` et des changements de schéma des maps de politique | Avant la mise à jour                        | Les notes de version n'ont pas été relues pour des régressions propres au matériel ou au noyau |
| `cilium/cilium#46010` signale une instabilité BPF similaire sur du matériel physique                            | Disponible sur GitHub                       | L'issue n'a été trouvée qu'en cours d'investigation, après plusieurs tentatives ratées         |
| `amiya.akn` est un cluster mono-nœud — mise à jour progressive impossible                                       | Avant toute tentative (architecture connue) | Limite architecturale connue ; aucune autre plateforme disponible pour tester                  |
| Pas d'environnement de préproduction avec matériel/noyau équivalents                                            | Avant toute tentative (contrainte connue)   | Accepté comme contrainte du homelab ; ni budget ni matériel pour un nœud en double             |

## Analyse du contrôle

### Sous contrôle (ce que nous aurions pu changer)

- **Protocole de capture des journaux** — lancer explicitement `talosctl logs` ou `kubectl logs -f` avant chaque
  tentative aurait fourni des horodatages précis et aurait peut-être révélé des signaux plus tôt.

### Hors de contrôle (facteurs externes)

| Facteur externe                                                  | Qu'est-ce qui réduirait l'exposition ?                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Comportement du pilote r8169 avec les programmes BPF TC sur 6.18 | Aucun contournement pratique ; le choix du matériel physique est figé                      |
| Pas de Cilium 1.19.5 disponible au moment de l'investigation     | Suivre le flux des versions ; activer une surveillance sur les releases de `cilium/cilium` |

## Leçons systémiques

- **Le cluster de plateforme (`amiya.akn`) est un point de défaillance unique pour tous les clusters.** Chaque fenêtre
  de crash de 10–15 min a coupé OpenBao, Pocket-Id et Zot de tous les clusters en aval. Huit tentatives = jusqu'à 2 h
  d'indisponibilité cumulée de la plateforme. Les mises à jour de ce cluster devraient avoir une tolérance au risque
  plus faible que celles de tout cluster d'applications.

## De la leçon au contrôle

| Leçon                                                                                                                    | Type d'artefact                | Artefact lié                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `amiya.akn` est un SPOF pour OpenBao/Pocket-Id/Zot — les mises à jour exigent une tolérance au risque plus faible        | Procédure + ADR                | Procédure de mise à jour du cluster de plateforme dans `docs/procedures/` (à écrire) ; ADR-TBD sur l'acceptation du SPOF |
| Les mises à jour mineures de Cilium sur r8169 + noyau 6.18 exigent une capture de diagnostic avant la tentative          | Étape de procédure             | Procédure de mise à jour du cluster de plateforme (la même que ci-dessus)                                                |
| La matrice de couverture matérielle amont est opaque — il faut relire les notes de version pour détecter les régressions | Vérification avant déploiement | Ajoutée à la procédure de mise à jour du cluster de plateforme                                                           |

## Registre des changements

- [ ] [due:: 2026-06-10] [priority:: high] [size:: S] [owner:: Alexandre] Capturer `talosctl logs -f` dans un fichier
      **avant** chaque future tentative de mise à jour de Cilium ; ajouter l'étape à la procédure de mise à jour
  - **Vérification :** la prochaine tentative de mise à jour de Cilium produit un fichier de journaux capturé (en cas de
    succès comme de crash) ; la tentative ne peut pas démarrer sans lui
  - **Sinon :** le prochain crash ne laisse aucun diagnostic exploitable, comme pour les tentatives 4 et 5 de cet
    incident

- [ ] [due:: 2026-06-17] [priority:: medium] [size:: S] [owner:: Alexandre] Commenter
      [`cilium/cilium#46010`](https://github.com/cilium/cilium/issues/46010) avec un reproducteur complet : Talos
      v1.13.3, noyau 6.18.33-talos, r8169 (PCI 10EC:8168), schéma de crash de 28 ms, liste des 8 hypothèses de
      configuration écartées
  - **Vérification :** le commentaire est visible sur l'issue ; le lien croisé depuis ce post-mortem fonctionne
  - **Sinon :** l'amont ne peut pas aider s'il ne connaît pas l'environnement ; les hypothèses continuent d'être testées
    en isolation

- [ ] [due:: 2026-08-01] [priority:: medium] [size:: S] [owner:: Alexandre] Surveiller les versions Cilium 1.19.5+ pour
      des correctifs r8169 / noyau 6.18.x ; notification de release GitHub sur `cilium/cilium`
  - **Vérification :** la prochaine version 1.19.x est examinée pour des mentions de correctif r8169/6.18 avant toute
    tentative de mise à jour
  - **Sinon :** même crash à la première tentative en 1.19.5, sans connaître d'éventuels correctifs partiels

## Connaissances pour les agents

- Cilium : `bpf.enableTCX: false` force l'attachement TC historique ; `true` utilise TCX (Linux 6.6+). Sur Linux 6.18
  avec r8169 (PCI 10EC:8168), l'attachement TC historique de `cil_from_netdev`/`cil_to_netdev` à `enp1s0` provoque une
  perte totale de connectivité dans une fenêtre de ~28 ms avec Cilium 1.19.4. **Rester en 1.18.10 sur ce matériel
  jusqu'à vérification.**
- Cilium : chemin de retour arrière sur `amiya.akn` — rétablir le tag d'image `quay.io/cilium/cilium:v1.18.10` puis
  redémarrer le nœud. Aucun nettoyage de l'état BPF n'est nécessaire.
- r8169 : le pilote n'a pas de XDP natif — Cilium retombe sur le mode SKB. Cela exerce un chemin de code différent de la
  matrice de tests documentée (Mellanox mlx4/mlx5, Intel ixgbe, Broadcom bnxt, virtio-net).
- amiya.akn : les mises à jour du cluster de plateforme affectent l'accès de chaque cluster en aval à OpenBao, Pocket-Id
  et Zot. Mettre en hibernation les clusters CNPG avant toute mise à jour de plateforme risquée, pour éviter une
  corruption due à la coupure des sessions iSCSI.

## Calendrier de vérification

| Point de contrôle | Date       | Ce que nous vérifierons                                                                                                      | Instance      |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1 semaine         | 2026-06-03 | Étape de capture de journaux dans la procédure ; prête avant toute nouvelle tentative                                        | Revue en solo |
| 1 mois            | 2026-06-27 | Issue #46010 commentée ; prochaine version de Cilium examinée pour les correctifs pertinents                                 | Revue en solo |
| 3 mois            | 2026-08-27 | Si 1.19.5+ est disponible avec un correctif : nouvelle tentative réussie, diagnostics complets capturés ; sinon rien à faire | Revue en solo |

## Pour aller plus loin

- [Mettre à jour Talos avec Omni](../procedures/infrastructure/INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md) : la
  procédure de mise à jour des nœuds, où ajouter la capture de journaux avant une mise à jour risquée
- [Incident 2026-05-26 : ImagePullBackOff circulaire Kyverno/Zot sur amiya](Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md)
  : autre incident de la même période sur le cluster de plateforme
