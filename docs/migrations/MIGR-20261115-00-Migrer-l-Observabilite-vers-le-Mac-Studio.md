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

| Étape | Contenu                                            | État                                                                                                 |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | Créer la configuration nix-darwin du Mac           | faite                                                                                                |
| 2     | Porter les modules et régler la machine            | code prêt, non déployé                                                                               |
| 3     | Basculer `data.o11y.chezmoi.sh` vers le Mac Studio | code prêt, bascule manuelle à faire (ne pas fusionner avant que le Mac serve `data.o11y.chezmoi.sh`) |
| 4     | Retirer le CT 103                                  | code prêt, bloqué (CT 103 à arrêter puis détruire après la bascule)                                  |

## Avant de commencer

| À fixer ou à vérifier                                                                                                                                | Pourquoi                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Volume APFS dédié de 250 Go (une limite, pas une réservation) pour `/var/lib/o11y-datastore`, créé sur le bon disque et jamais sur le disque système | Les rétentions actuelles (18 mois de métriques, 30 jours de journaux, 2 jours de traces) doivent y tenir (à vérifier)                                                                                        |
| Heartbeat du Dead-Man's-Switch : un nouveau check healthchecks.io, dont l'URL est un secret SOPS (`alertmanager-deadman-url`)                        | La panne de la machine hôte reste détectée par healthchecks.io tant que le heartbeat part de l'Alertmanager du Mac                                                                                           |

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
  du Mac un serveur : pas de veille, redémarrage après coupure de courant, pare-feu `pf`, mises à jour de macOS jamais
  automatiques et limites des stores (puisqu'il n'y a plus de `MemoryMax`). Tout est déclaré dans nix-darwin, pas réglé
  à la main.
- **Un `o11y-agent` propre au Mac** : la machine fait tourner son propre agent, pour ses journaux, ses métriques d'hôte
  et sa consommation électrique en watts. Les watts sont mesurés avec `macmon` (consommation lue par IOReport, sans
  root) et exportés en jauge `hw.power`.
- **Risque** : dérive entre l'implémentation NixOS et l'implémentation nix-darwin tant que les deux coexistent. Elle est
  réduite par des sources partagées (voir « Constaté »), mais la configuration d'Alertmanager et une partie de celle du
  collecteur de l'agent restent dupliquées côté darwin.
- **Risque** : le heartbeat doit utiliser son propre check healthchecks.io. Si le Mac reprend l'URL du LXC pendant que
  les deux tournent, la mort de l'un ou de l'autre passe inaperçue.
- **Risque** : dérive de version, le nixpkgs du Mac donne VictoriaMetrics 1.156.0 quand le LXC en est à 1.155.0.
- **Risque** : IOReport est une API privée d'Apple, une mise à jour de macOS peut casser cette seule jauge.
- **Limites des stores** : elles gardent les valeurs du LXC (`services.o11yDatastore.limits`, sizées pour un CT de 8
  Gio) : les requêtes lourdes de l'ADR-022 ne passent pas avec, il faudra les relever.
- **Vérification** : la pile répond sur le Mac (`:443` en lecture, `:4318` en écriture) avant toute bascule, et les
  requêtes lourdes mesurées dans l'ADR-022 s'exécutent (commandes **à confirmer**). Le déploiement et les contrôles du
  premier démarrage sont dans le [README de l'hôte](../../fleet/hosts/akn.ptilopsis/README.md).
- **Retour arrière** : sans effet sur la production.
- **Constaté** : le code est écrit, rien n'est construit, activé ni déployé : le Mac n'existe pas encore.
  - Configuration du Mac dans `fleet/hosts/akn.ptilopsis/nix/modules/` : `o11y-datastore/` (la pile : options des
    démons, Caddyfile, page d'accueil, pipeline de la passerelle OTLP, règles vmalert, construction de Caddy),
    `server.nix` et `secrets.nix`. Seuls l'agent (`o11y-agent/darwin.nix`) et le plafond de taille des journaux
    `launchd` (`darwin-log-trim/`) restent dans `catalog/nix/modules/`, exportés en `darwinModules.o11yAgent` et
    `darwinModules.logTrim`. Le LXC garde ses propres fichiers, inchangés : ils disparaissent avec lui.
  - Démons : VictoriaMetrics, VictoriaLogs, VictoriaTraces, vmalert, Alertmanager, passerelle OTLP et Caddy, mêmes ports
    et mêmes options que le LXC. Seuls les chemins changent : `/persistent` devient `/var/lib/o11y-datastore` (le volume
    racine de macOS est en lecture seule), journaux dans `/var/log/o11y-datastore/`. Comptes dédiés `_o11y`, `_caddy` et
    `_o11yagent`.
  - Réglages serveur : pas de veille et redémarrage après coupure (options `power.*`, avec `pmset` en secours dans le
    script d'activation) ; pare-feu par une ancre `pf` (`com.apple/o11y-datastore`) qui autorise TCP 443 et 4318 depuis
    `10.0.0.0/22` et le bouclage, et bloque le reste. Le pare-feu applicatif de macOS est désactivé : il ne filtre pas
    par source et bloquerait le binaire Caddy construit par Nix.
  - Limites : pas de `MemoryMax` ; les options des stores (`-memory.allowedBytes`, `-search.maxMemoryPerQuery`,
    `-search.maxConcurrentRequests`, `-search.maxQueryDuration`) portent les plafonds, via l'option
    `services.o11yDatastore.limits`, aux valeurs actuelles du LXC en attendant la décision.
  - Agent du Mac : fichiers de journaux des démons, erreurs et fautes du journal unifié de macOS, métriques d'hôte (CPU,
    charge, mémoire, réseau, pagination, processus, disque, système de fichiers) et mêmes scrapes que l'agent du LXC,
    poussés en OTLP/HTTP vers `https://data.o11y.chezmoi.sh:4318`. `macmon` a été testé sur un autre Mac Apple Silicon.
  - Secrets : sops-nix (module darwin), déchiffrés avec la clé d'hôte SSH du Mac dans `/run/secrets/` ; trois secrets
    (jeton DNS-01 Cloudflare, webhook Slack, URL du heartbeat). Aucun n'existe encore : `nix/secrets/o11y.sops.yaml` est
    créé au déploiement ; sans lui la configuration s'évalue avec un avertissement et les fonctions concernées restent
    désactivées.
  - Vérifié sans la machine : la configuration s'évalue (`nix eval .#darwinConfigurations.ptilopsis.system.drvPath`),
    les configurations générées du collecteur passent `otelcol-contrib validate`, celle d'Alertmanager passe
    `amtool check-config`, et les arguments `launchd` de chaque démon ont été comparés à l'`ExecStart` du LXC.
  - **À confirmer** au premier démarrage (invérifiable sans la machine) : les règles `pf` (jamais passées dans `pfctl`),
    Caddy qui écoute sur 80 et 443 sans être root, les journaux `launchd` et leur rotation, la lecture du journal unifié
    par le compte de l'agent, les requêtes lourdes.

### 3. Basculer `data.o11y.chezmoi.sh` vers le Mac Studio

- **Ce qui change** : la cible DNS de `data.o11y.chezmoi.sh`. Les agents ne changent pas.
- **Deux voies** : une bascule DNS franche (l'option la plus simple), ou un mirroring des écritures par le Caddy du LXC
  vers le Mac pendant quelques jours, pour comparer.
- **Réseau des nœuds Talos** : les nœuds Talos joignent aujourd'hui le LXC sur le réseau `talosnet` (`10.128.0.5`), où
  le Mac n'a pas d'interface. Décision : ils joignent le Mac à `10.0.0.32` à travers le SNAT de `pve-01` (voir «
  Constaté »). Le passage par le SNAT est à vérifier avant la bascule.
- **Vérification** : les agents poussent vers le Mac, les alertes et le heartbeat fonctionnent. Plus précisément :
  - `getent hosts data.o11y.chezmoi.sh` sur chaque LXC donne `10.0.0.32`.
  - Chaque source (les LXC, `pve-01` et les deux clusters) apparaît dans VictoriaMetrics et VictoriaLogs du Mac.
  - L'Alertmanager du Mac reçoit les alertes de vmalert et de Grafana, et le heartbeat en part.
- **Risque** : ne pas fusionner ni déployer avant que le Mac serve `data.o11y.chezmoi.sh`. Un LXC reconstruit ou un
  volume BIND neuf enverrait vers une machine absente.
- **Constaté** : le code est prêt, la bascule reste manuelle.
  - Le Mac Studio a l'adresse fixe `10.0.0.32` (VLAN 5), ajoutée à la page de référence IPAM et au README
    d'`akn.ptilopsis`.
  - Deux vues DNS coexistent : UniFi (enregistrement local `data.o11y` → `10.0.0.22`, fait à la main, hors dépôt) et le
    BIND de `core.talosnet-dns` (`seedZone` de `bind.nix`, `data.o11y` → `10.128.0.5`). BIND est maître de `chezmoi.sh`
    : sans enregistrement, la vue `talosnet` répondrait NXDOMAIN aux nœuds Talos et aux pods (les collecteurs
    OpenTelemetry de `rhodes.akn` et `lungmen.akn` n'utilisent que ce résolveur).
  - Décision : l'enregistrement de `seedZone` vise `10.0.0.32`, joint à travers le SNAT de `pve-01` (le `pf` du Mac
    autorise `10.0.0.0/22`).
  - Les quatre LXC qui épinglent le nom dans `/etc/hosts` (`core.omni`, `core.omni-infra-provider-proxmox` et
    `core.oci-registry` sur `10.0.0.22`, `core.talosnet-dns` sur `10.128.0.5`) épinglent `10.0.0.32`.
  - Les clients qui passent par le nom (agents des clusters, politiques Cilium FQDN, sources de données Grafana,
    serveurs MCP, collecteur de `pve-01`) suivent l'enregistrement sans changement.
- **Manuel, à la bascule** :
  - Vérifier que le Mac répond sur `10.0.0.32:4318` depuis le LAN et depuis `talosnet` (`curl --resolve`).
  - Changer l'enregistrement UniFi `10.0.0.22` → `10.0.0.32`.
  - Mettre à jour la zone vivante de BIND par `nsupdate` avec la clé TSIG `external-dns.` (`update delete` puis
    `update add data.o11y.chezmoi.sh 300 A 10.0.0.32`) : `seedZone` ne sert qu'à un volume neuf.
  - Reconstruire et mettre à jour les quatre LXC : version du `flake.nix`, construction, `lxc:push`, `lxc:upgrade`,
    instantané `pre-upgrade-<ts>`.
- **Retour arrière** : le CT 103 reste en fonctionnement pendant cette période. UniFi vers `10.0.0.22` ; `nsupdate` vers
  `10.128.0.5` ; `pct rollback <vmid> pre-upgrade-<ts>` ; `git revert`.

### 4. Retirer le CT 103

- **Ce qui change** : le CT 103 est arrêté, puis détruit après une fenêtre de rétention (durée **à fixer**).
- **Constaté** : le code du CT 103 est supprimé et `observability.ts` quitte `base` : seul le jeton Cloudflare DNS-01
  `caddy-dns01-observability` passe dans le projet `ptilopsis-akn` (`fleet/hosts/akn.ptilopsis/pulumi/`) ; le LXC n'est
  plus dans Pulumi (`pve-01-core` ne déclare aucun conteneur 103) et le client OAuth Tailscale est supprimé. Détail dans
  [MIGR-20261114-00, détail de l'étape 10](MIGR-20261114-00-Migrer-vers-la-Flotte.md#détail-de-létape-10).
- **Manuel (Pulumi)** : un seul `pulumi state move` (le jeton, de `base` vers `ptilopsis-akn`) avec un `pulumi preview`
  vide pour `ptilopsis-akn` et, pour `base`, seulement la suppression du client OAuth et de deux sorties ; puis
  `pulumi up` sur `base`, `mise run secrets:sync` dans `akn.ptilopsis` et `pct destroy 103` après la rétention (**à
  confirmer** : `state move` entre phrases secrètes différentes). Étapes complètes dans la migration de la flotte.
- **Risque** : aucun `pulumi up` sur `base` avant le `state move` (il supprimerait le jeton du Caddy du Mac).
- **Vérification** : plus aucune ressource `o11y-datastore` dans `base`.
- **Retour arrière** : avant la destruction, redémarrer le CT 103 et rebasculer le DNS (étape 3) ; après, restaurer
  depuis la sauvegarde définie dans « Avant de commencer » (**à confirmer**).

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
