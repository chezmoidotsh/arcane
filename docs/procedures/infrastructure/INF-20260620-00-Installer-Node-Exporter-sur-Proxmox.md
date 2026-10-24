# INF-20260620-00 Installer node-exporter sur Proxmox

Cette procédure installe et configure `prometheus-node-exporter` directement sur l'hôte Proxmox VE `pve-01`, puis
déclare cet exporter comme cible de scrape dans le LXC `pve-exporter`. Le LXC expose déjà ses propres métriques via
`catalog.lxcAgent.nodeExporter` (CPU, mémoire, réseau et systèmes de fichiers du conteneur), mais cela ne couvre pas
l'hyperviseur : les E/S disque de l'hôte, les capteurs matériels, la santé des NVMe et l'occupation des systèmes de
fichiers de l'hôte exigent un node-exporter sur l'hôte lui-même.

> [!WARNING]\
> Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées sur l'hôte Proxmox. La cible de scrape
> de l'étape 5 est déjà déclarée dans le dépôt : l'étape sert à reproduire ou à adapter cette déclaration, par exemple
> pour un nouvel hôte. Le chemin `/etc/pve/nodes/<nœud>/host.fw` suit la convention de Proxmox VE ; le dépôt ne le
> documente pas pour les nœuds.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `ssh`, `mise` (`mise install`
exécuté, pour l'étape 5), `curl`.

Les accès suivants sont également nécessaires :

- accès SSH `root` à l'hôte Proxmox (`pve-01.pve.chezmoi.sh`) ;
- LXC `pve-exporter` joignable depuis l'hôte, sur le VLAN 5 (`10.0.0.0/22`) : l'hôte porte son adresse sur `vmbr0`
  (accès VLAN 5) et le LXC est sur `vmbr1` avec le tag 5 (`10.0.0.24`) ;
- accès en écriture au dépôt pour modifier `o11y.nix`, et accès SSH `root` à l'hôte pour pousser l'image du LXC.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles. L'adresse de l'hôte
est tenue à jour dans [IPAM](../../reference/IPAM-Reference.md).

```sh
export PVE_HOST=<nom d'hôte du nœud Proxmox>    # ex. pve-01.pve.chezmoi.sh
export PVE_NODE=<nom du nœud dans Proxmox>      # ex. pve-01 (répertoire de host.fw)
export PVE_IP=<adresse de gestion de l'hôte>    # ex. 10.0.0.11 (sur vmbr0, VLAN 5)
export PORT=<port d'écoute de node-exporter>    # ex. 9100 (valeur par défaut de node-exporter)
```

## Étape 1 — Installer le paquet

Proxmox repose sur Debian : le paquet est dans les dépôts par défaut. Exécuter les commandes sur l'hôte, en `root`.

```sh
apt-get update
apt-get install -y prometheus-node-exporter
# → le paquet est installé ; le service démarre avec la configuration par défaut
```

## Étape 2 — Configurer l'exporter

Restreindre l'adresse d'écoute au pont de gestion de Proxmox et activer le jeu de collecteurs adapté à une machine
physique. Le service n'est ainsi pas exposé publiquement, et le LXC `pve-exporter` le scrape depuis le VLAN 5.

Le délimiteur `'EOF'` est entre apostrophes : le shell ne substitue rien dans le fichier écrit, d'où le marqueur
`@LISTEN@` remplacé par `sed` à la suite.

```sh
cat > /etc/default/prometheus-node-exporter << 'EOF'
# Écoute uniquement sur l'adresse de gestion de Proxmox — pas d'exposition publique.
# Le LXC pve-exporter scrape cette adresse depuis le VLAN 5.
ARGS="--web.listen-address=@LISTEN@ \
  --collector.systemd \
  --collector.processes \
  --collector.filesystem.mount-points-exclude='^/(dev|proc|run/credentials/.+|sys|var/lib/docker/.+|var/lib/containers/.+)($|/)' \
  --collector.diskstats.device-exclude='^(ram|loop|fd|(h|s|v|xv)d[a-z]|nvme[0-9]+n[0-9]+p)[0-9]+$'"
EOF

sed -i "s|@LISTEN@|${PVE_IP}:${PORT}|" /etc/default/prometheus-node-exporter
grep -- '--web.listen-address' /etc/default/prometheus-node-exporter
# → ARGS="--web.listen-address=<PVE_IP>:<PORT> \
```

Les motifs d'exclusion des collecteurs `filesystem` et `diskstats` écartent les montages éphémères (proc, sysfs), les
périphériques loop et les tranches de partition, et ne conservent que les périphériques de stockage et les points de
montage utiles.

## Étape 3 — Activer et démarrer le service

```sh
systemctl enable prometheus-node-exporter
systemctl restart prometheus-node-exporter

systemctl is-active prometheus-node-exporter
# → active

curl -s http://${PVE_IP}:${PORT}/metrics | grep node_uname_info
# → une ligne node_uname_info{...} 1 : l'exporter répond
```

## Étape 4 — Ouvrir le port dans le pare-feu PVE

Si le pare-feu du datacenter ou du nœud est actif, autoriser le TCP `${PORT}` en entrée depuis le VLAN 5, où se trouve
le LXC `pve-exporter`. Aucun hôte n'est listé individuellement : le VLAN 5 sert de source, comme pour les autres règles
du dépôt (voir [IPAM](../../reference/IPAM-Reference.md)).

```sh
# Afficher la règle à ajouter sous [RULES]
echo "IN ACCEPT -source 10.0.0.0/22 -dport ${PORT} -p tcp -log nolog"
# → IN ACCEPT -source 10.0.0.0/22 -dport <PORT> -p tcp -log nolog

# Ouvrir le fichier du nœud et coller la règle sous [RULES]
${EDITOR:-nano} /etc/pve/nodes/${PVE_NODE}/host.fw
```

La même règle se crée depuis l'interface web : Datacenter → `<PVE_NODE>` → Firewall → Add.

## Étape 5 — Déclarer la cible de scrape dans pve-exporter

Dans `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/pve-exporter/modules/o11y.nix`, ajouter le node-exporter de
l'hôte aux cibles de scrape, à côté du job `pve_exporter` existant. Les labels `node` et `host_name` sont forcés pour
que les séries soient attribuées à l'hôte PVE et non au LXC qui scrape (`get_hostname!()` renverrait `pve-exporter`).

```nix
metrics = {
  enable = true;
  scrapeTargets = [
    {
      jobName = "pve_exporter";
      targets = [ "127.0.0.1:9221/pve?target=${pveHost}&cluster=1&node=1" ];
    }
    {
      jobName = "node_exporter_pve";
      targets = [ "<PVE_IP>:<PORT>" ];
      extraLabels = { node = "<PVE_NODE>"; host_name = "<PVE_NODE>"; };
    }
  ];
};
```

> [!NOTE]\
> Le dépôt déclare déjà ce job avec `10.0.0.11:9100` et `pve-01`, soit les valeurs de l'exemple de la section
> [Entrées requises](#entrées-requises).

Reconstruire puis mettre à jour le LXC `pve-exporter` : la mise à jour échange le rootfs (voir
[Mettre à jour un LXC par échange du rootfs](INF-20260605-00-Mettre-a-Jour-un-LXC-par-Echange-du-Rootfs.md)). Mettre à
jour la version (CalVer `YYYY.MM.DD`) dans `flake.nix` avant de construire.

```sh
cd projects/chezmoi.sh/src/infrastructure/proxmox/lxc/pve-exporter

mise run lxc:build
mise run lxc:push -- ${PVE_HOST}
mise run lxc:upgrade -- ${PVE_HOST}
# → le LXC redémarre avec le nouveau rootfs ; le VMID est détecté via les tags PVE si --vmid est omis
```

## Exemple complet : hôte `pve-01`

Mêmes étapes avec les valeurs réelles, sur `pve-01.pve.chezmoi.sh`, en `root`.

```sh
export PVE_HOST=pve-01.pve.chezmoi.sh
export PVE_NODE=pve-01
export PVE_IP=10.0.0.11
export PORT=9100

apt-get update
apt-get install -y prometheus-node-exporter

# écrire /etc/default/prometheus-node-exporter avec --web.listen-address=10.0.0.11:9100 (étape 2)
systemctl enable prometheus-node-exporter
systemctl restart prometheus-node-exporter

curl -s http://10.0.0.11:9100/metrics | grep node_uname_info
# → une ligne node_uname_info{...} 1
```

Règle de pare-feu correspondante, dans `/etc/pve/nodes/pve-01/host.fw` :

```text
IN ACCEPT -source 10.0.0.0/22 -dport 9100 -p tcp -log nolog
```

## Vérifications rapides

Une fois le LXC `pve-exporter` mis à jour, vérifier dans VictoriaMetrics que le job `node_exporter_pve` remonte des
séries.

- **Service actif** : `systemctl is-active prometheus-node-exporter` sur l'hôte — `active`.
- **Exporter joignable** : `curl -s http://${PVE_IP}:${PORT}/metrics | grep node_uname_info` — une ligne
  `node_uname_info`.
- **Occupation des systèmes de fichiers** : `node_filesystem_avail_bytes{job="node_exporter_pve", fstype!="tmpfs"}` —
  des séries présentes pour l'hôte.
- **E/S disque** : `rate(node_disk_read_bytes_total{job="node_exporter_pve"}[5m])` — des séries présentes.
- **CPU** : `rate(node_cpu_seconds_total{job="node_exporter_pve", mode="idle"}[1m])` — des séries présentes.
- **Santé NVMe** : `node_nvme_info{job="node_exporter_pve"}` — des séries si le collecteur NVMe de l'exporter est
  disponible sur l'hôte.

## Retour arrière

Aucune étape n'est destructive. Pour revenir à l'état initial, sur l'hôte Proxmox :

```sh
systemctl disable --now prometheus-node-exporter
apt-get remove -y prometheus-node-exporter
```

Supprimer ensuite la règle `IN ACCEPT` ajoutée à l'étape 4 de `/etc/pve/nodes/${PVE_NODE}/host.fw`, retirer le job
`node_exporter_pve` de `o11y.nix`, puis reconstruire et mettre à jour le LXC `pve-exporter` comme à l'étape 5.

## Historique

- _2026-10-17_ : Alignement sur le gabarit de procédure v2 : état de vérification en callout `WARNING`, entrées en un
  bloc `export` utilisé par toutes les étapes, étapes 2 et 4 écrites avec les variables, blocs de commandes espacés,
  vérifications de l'étape 5 et de l'exemple complet complétées.
- _2026-10-11_ : Étape 5 alignée sur `modules/o11y.nix`, qui déclare désormais `extraLabels` (`node` et `host_name` à
  `pve-01`) pour attribuer les séries à l'hôte. L'appel de `lxc:upgrade` ne passe plus que l'hôte Proxmox : le VMID est
  détecté via les tags PVE (`.mise/tasks/lxc/upgrade`).
- _2026-10-11_ : Réseau corrigé. Le LXC `pve-exporter` est sur `vmbr1` avec le tag 5 (`10.0.0.24/22`), et non sur
  `vmbr0` : `vmbr0` porte uniquement l'adresse de gestion de l'hôte (`projects/chezmoi.sh/docs/PROXMOX-VE.md`,
  `pve-exporter/README.md`). La source de la règle de pare-feu passe de `10.0.0.0/24` à `10.0.0.0/22`, soit tout le VLAN
  5 (`docs/reference/IPAM-Reference.md`). La syntaxe de la règle utilise `-source` et `-dport`, comme dans le README de
  `pve-exporter`.
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, remise au
  gabarit de procédure (identifiant dans le titre, entrées requises, exemple complet, retour arrière, historique).
- _2026-06-20_ : Création initiale.

## Pour aller plus loin

- [README du LXC pve-exporter](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/pve-exporter/README.md) :
  architecture, déploiement et exploitation du LXC qui scrape l'hôte.
- [Mettre à jour un LXC par échange du rootfs](INF-20260605-00-Mettre-a-Jour-un-LXC-par-Echange-du-Rootfs.md) :
  mécanisme du `lxc:upgrade` utilisé à l'étape 5.
- [ADR-013](../../decisions/ADR-013-Observabilite-Centralisee-VictoriaMetrics-sur-LXC.md) : la pile d'observabilité
  centralisée qui reçoit ces métriques.
- [IPAM](../../reference/IPAM-Reference.md) : plan d'adressage du VLAN 5 et adresse de l'hôte.
