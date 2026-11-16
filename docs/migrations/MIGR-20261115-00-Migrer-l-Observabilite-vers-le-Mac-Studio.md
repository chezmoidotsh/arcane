# MIGR-20261115-00 Migrer l'observabilité vers le Mac Studio

Faire passer l'appliance d'observabilité du LXC `observability` (CT 103) de `pve-01` au Mac Studio, `ptilopsis.akn`, en
quatre étapes : configuration nix-darwin, portage des modules, bascule DNS, retrait du CT.

> [!NOTE]\
> **État au 2026-11-15 : en cours** (voir le tableau « Avancement »). Cette page n'a pas été rejouée : l'ADR-022 est
> `proposed` et rien n'est déployé. Les étapes reprennent le plan de haut niveau de l'ADR ; toute commande ou valeur
> absente est **à confirmer** et à fixer avant l'étape concernée.

## Contexte

Le CT 103 n'a pas assez de calcul pour les requêtes lourdes, `pve-01` n'en a pas à lui prêter, et l'appliance est
hébergée par l'hôte qu'elle supervise. La migration déplace la pile sur un Mac Studio dédié, configuré avec nix-darwin,
qui apporte le calcul et un domaine de panne distinct. Les endpoints et le contrat d'ingestion ne changent pas ; seule
la cible DNS de `data.o11y.chezmoi.sh` change.

| Élément            | Lien                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Décision d'origine | [ADR-022 Héberger l'appliance d'observabilité sur un Mac Studio dédié](../decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md) (`proposed`) |
| État cible         | [Architecture du dépôt](../reference/Architecture-du-Depot-Reference.md) et [Nommage des machines](../reference/Nommage-des-Machines-Reference.md) pour `ptilopsis.akn`   |
| Suivi              | Aucune issue ni pull request de suivi à ce jour. Migration liée : [MIGR-20261114-00 Migrer vers la flotte](MIGR-20261114-00-Migrer-vers-la-Flotte.md) (étape 10)          |

## Avancement

| Étape | Contenu                                            | État    |
| ----- | -------------------------------------------------- | ------- |
| 1     | Créer la configuration nix-darwin du Mac           | faite   |
| 2     | Porter les modules et régler la machine            | à faire |
| 3     | Basculer `data.o11y.chezmoi.sh` vers le Mac Studio | à faire |
| 4     | Retirer le CT 103                                  | à faire |

## Avant de commencer

| À fixer ou à vérifier                                                                                                                                   | Pourquoi                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le SSD interne (1 To) est partagé avec les modèles d'IA : fixer la part de disque donnée à l'observabilité et celle donnée aux modèles, avant l'étape 1 | Les rétentions actuelles (18 mois de métriques, 30 jours de journaux, 2 jours de traces) doivent tenir dans la première (à vérifier)                                                                           |
| Budget des charges d'IA : mémoire, mémoire GPU, CPU                                                                                                     | Chaque charge a un budget borné et documenté, fixé avant son déploiement                                                                                                                                       |
| Emplacement du heartbeat du Dead-Man's-Switch                                                                                                           | La panne de la machine hôte reste détectée par healthchecks.io tant que le heartbeat part de l'Alertmanager du Mac ; l'emplacement exact et la surveillance du Mac par un observateur extérieur sont à décider |
| Équivalent du snapshot Proxmox pour `/persistent`                                                                                                       | La sauvegarde par snapshot du CT n'existe plus sur le Mac                                                                                                                                                      |
| Place de l'élément dans la migration du dépôt                                                                                                           | Le LXC reste sous `projects/chezmoi.sh` jusqu'à cette migration, puis passe directement à `fleet/hosts/akn.ptilopsis/` ([MIGR-20261114-00 Migrer vers la flotte](MIGR-20261114-00-Migrer-vers-la-Flotte.md))   |

## Étapes

### 1. Créer la configuration nix-darwin du Mac

- **Ce qui change** : le Mac devient l'hôte `akn.ptilopsis` : configuration nix-darwin sous
  `fleet/hosts/akn.ptilopsis/nix/`, Pulumi sous `pulumi/` (organisation décidée par l'ADR-021).
- **Vérification** : la configuration est évaluée sans erreur, avec
  `nix eval .#darwinConfigurations.ptilopsis.system.drvPath` depuis `fleet/hosts/akn.ptilopsis/nix/`
  (`mise run nix:eval`).
- **Retour arrière** : sans effet sur la production, le LXC n'est pas touché.
- **Constaté** : `fleet/hosts/akn.ptilopsis/` contient `nix/flake.nix`, `nix/flake.lock`, `nix/configuration.nix`,
  `README.md` et `.mise.toml` (tâche `nix:eval`), avec nix-darwin `nix-darwin-26.05` et `nixpkgs` `nixos-26.05`. Aucun
  service, aucun secret. L'évaluation passe sans erreur ; rien n'a été construit ni activé. Pas encore fait : le dossier
  `pulumi/` (il arrive à l'étape 4) et l'entrée `arcane` (`catalog/nix`), non branchée parce que le catalogue n'exporte
  pour l'instant que des modules NixOS (elle vient avec l'étape 2).

### 2. Porter les modules et régler la machine

- **Ce qui change** : les modules de `o11y-datastore/modules/` (NixOS) sont réécrits en démons `launchd` nix-darwin et
  deviennent des modules de rôle partagés (`catalog/nix/modules/`). La configuration nix-darwin porte tout ce qui fait
  du Mac un serveur : pas de veille, redémarrage après coupure de courant (`pmset`), pare-feu (les règles actuelles, 443
  et 4318 depuis le LAN et Tailscale, reprises dans `pf` ou le pare-feu applicatif de macOS) et limites des stores
  (`-memory.allowedBytes` et plafonds par requête, puisqu'il n'y a plus de `MemoryMax`). Tout cela est déclaré dans
  nix-darwin, pas réglé à la main. Les mises à jour de macOS sont déclenchées à la main, jamais automatiquement.
- **Un `o11y-agent` propre au Mac** : la machine fait tourner son propre agent d'observabilité, pour ses journaux, le
  CPU, la mémoire et le disque de la machine, et la consommation électrique en watts si possible (la partie watts est
  **à confirmer** : source de la mesure sous macOS, et faisabilité dans l'agent).
- **Risque** : dérive entre l'implémentation NixOS et l'implémentation nix-darwin tant que les deux coexistent.
- **Vérification** : la pile répond sur le Mac (`:443` en lecture, `:4318` en écriture) avant toute bascule ; les
  requêtes lourdes mesurées dans l'ADR-022 s'exécutent (commandes **à confirmer**).
- **Retour arrière** : sans effet sur la production.

### 3. Basculer `data.o11y.chezmoi.sh` vers le Mac Studio

- **Ce qui change** : la cible DNS de `data.o11y.chezmoi.sh`. Les agents ne changent pas.
- **Deux voies** : une bascule DNS franche (l'option la plus simple), ou un mirroring des écritures par le Caddy du LXC
  vers le Mac pendant quelques jours, pour comparer.
- **Vérification** : les agents poussent vers le Mac (**à confirmer** par les métriques de l'appliance), les alertes et
  le heartbeat fonctionnent.
- **Retour arrière** : le CT 103 reste en fonctionnement pendant cette période ; revenir à l'ancienne cible DNS (**à
  confirmer**).

### 4. Retirer le CT 103

- **Ce qui change** : le CT 103 est arrêté, puis détruit après une fenêtre de rétention (durée **à fixer**).
- **Manuel (Pulumi)** : le LXC et sa pile (`observability.ts`) passent de `chezmoi_sh` à `akn.ptilopsis` par un seul
  `pulumi state move` (**à confirmer**, voir
  [MIGR-20261114-00 Migrer vers la flotte](MIGR-20261114-00-Migrer-vers-la-Flotte.md)), avec un `pulumi preview` vide
  dans les deux piles.
- **Vérification** : plus aucune ressource `o11y-datastore` dans `chezmoi_sh`.
- **Retour arrière** : avant la destruction, redémarrer le CT 103 ; après, restaurer depuis la sauvegarde définie dans «
  Avant de commencer » (**à confirmer**).

## Critère de fin

Les requêtes lourdes de l'ADR-022 s'exécutent sur le Mac (commandes de vérification **à confirmer**), une panne de
`pve-01` n'interrompt plus la collecte ni l'alerte, et `pve-01` ne montre plus de pic de VictoriaLogs. Une fois atteint,
archiver la page.

## Pour aller plus loin

- [ADR-022 Héberger l'appliance d'observabilité sur un Mac Studio dédié](../decisions/ADR-022-Heberger-l-Appliance-d-Observabilite-sur-un-Mac-Studio-Dedie.md)
  : la décision et ses raisons.
- [MIGR-20261114-00 Migrer vers la flotte](MIGR-20261114-00-Migrer-vers-la-Flotte.md) : le séquencement de
  `core.o11y-datastore` avec la migration du dépôt.
- [ADR-018 OTLP comme protocole d'ingestion unique](../decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md)
  : le contrat d'ingestion, inchangé.
