# INF-20261111-00 Installer le collecteur OpenTelemetry sur Proxmox

Cette procédure installe, met à jour ou retire le collecteur `otelcol-contrib` (paquet Debian officiel) sur un nœud
Proxmox VE. Le collecteur envoie le journal systemd et les métriques de l'hôte en OTLP/HTTP vers l'appliance
d'observabilité (`data.o11y.chezmoi.sh:4318`). Il remplace `prometheus-node-exporter` et la redirection rsyslog vers
l'ancien LXC `pve-exporter`. Les métriques de l'API Proxmox VE (nœuds, invités, stockage) ne passent pas par lui : le
serveur de métriques OpenTelemetry de PVE les pousse.

La configuration et le drop-in systemd sont versionnés dans `projects/chezmoi.sh/src/infrastructure/proxmox/host/`, et
deux tâches `mise` les déploient : `host:otelcol:install` (paquet) et `host:otelcol:deploy` (configuration).

> [!NOTE]\
> Procédure rejouée sur `pve-01` le 2026-11-11 : installation, déploiement et vérifications dans VictoriaMetrics et
> VictoriaLogs.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `ssh`, `scp`, `mise` (`mise install`
exécuté).

Les accès suivants sont également nécessaires :

- accès SSH `root` au nœud Proxmox ;
- sur le nœud, accès sortant à `github.com` (téléchargement du `.deb`) et à `data.o11y.chezmoi.sh:4318` ;
- accès en lecture à VictoriaMetrics et VictoriaLogs pour les vérifications.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export PVE_HOST=<nom d'hôte du nœud Proxmox>   # ex. pve-01.pve.chezmoi.sh
export PVE_NODE=<nom du nœud dans Proxmox>     # ex. pve-01 (valeur de host.name)
```

## Étape 1 — Installer le paquet

La tâche télécharge le `.deb` de la version épinglée dans `.mise.toml` (`OTELCOL_VERSION`), vérifie son `sha256`
(`OTELCOL_DEB_SHA256`) puis l'installe avec `apt-get install`. La même commande met à jour un nœud déjà équipé après un
changement de version.

```sh
cd projects/chezmoi.sh/src/infrastructure/proxmox/host

mise run host:otelcol:install -- ${PVE_HOST}
# → <fichier>.deb: OK, puis la version affichée par `otelcol-contrib --version`
# → [SUCCESS] otelcol-contrib <version> installed on <hôte>; now run host:otelcol:deploy.
```

> [!IMPORTANT]\
> Après l'installation, le paquet démarre avec sa configuration par défaut (exporteur `debug`) : rien n'est envoyé à
> l'appliance avant l'étape 2.

## Étape 2 — Déployer la configuration

La tâche copie `fs/etc.otelcol-contrib/config.yaml` et le drop-in `override.conf`, valide la configuration sur le nœud
(`otelcol-contrib validate`) avant de la mettre en place, puis recharge systemd, active et redémarre le service.

```sh
mise run host:otelcol:deploy -- ${PVE_HOST}
# → la validation passe sans erreur, puis `active`
# → [SUCCESS] otelcol-contrib config deployed on <hôte>.
```

Si la validation échoue, la tâche s'arrête avant le remplacement : `/etc/otelcol-contrib/config.yaml` reste la version
précédente.

## Vérifications rapides

- **Service actif** : `ssh root@${PVE_HOST} systemctl is-active otelcol-contrib` — `active`.
- **Pas d'erreur d'export** : `ssh root@${PVE_HOST} journalctl -u otelcol-contrib -n 50 --no-pager` — aucune erreur
  d'envoi vers `data.o11y.chezmoi.sh`.
- **Métriques** : dans VictoriaMetrics, `count by (job, instance) ({instance="<PVE_NODE>"})` — une série
  `job="hostmetrics"` pour le nœud (de l'ordre de 370 séries sur `pve-01`).
- **Journal** : dans VictoriaLogs, `host.name:<PVE_NODE>` — des entrées récentes, avec `systemd.unit` renseigné.

## Mettre à jour la version

1. Choisir la version sur la page des versions de
   [opentelemetry-collector-releases](https://github.com/open-telemetry/opentelemetry-collector-releases/releases) et
   relever le `sha256` de `otelcol-contrib_<version>_linux_amd64.deb` dans le fichier de sommes de contrôle de la
   version (`opentelemetry-collector-releases_otelcol-contrib_checksums.txt`).
2. Reporter les deux valeurs dans `projects/chezmoi.sh/src/infrastructure/proxmox/host/.mise.toml` : `OTELCOL_VERSION`
   et `OTELCOL_DEB_SHA256`.
3. Rejouer l'étape 1, puis l'étape 2 si la configuration change, et les vérifications rapides.

## Retour arrière

Retirer le collecteur du nœud supprime aussi sa configuration et son état (`/var/lib/otelcol-contrib`) :

```sh
ssh root@${PVE_HOST} 'systemctl disable --now otelcol-contrib && apt-get purge -y otelcol-contrib'
# → le paquet est purgé ; le journal et les métriques de l'hôte ne remontent plus
```

Le drop-in `/etc/systemd/system/otelcol-contrib.service.d/override.conf` est un fichier du dépôt déployé à la main : le
supprimer aussi, puis `systemctl daemon-reload`.

> [!WARNING]\
> Ce retour arrière ne réinstalle pas `prometheus-node-exporter` ni la redirection rsyslog, retirés le 2026-11-11, et le
> LXC `pve-exporter` n'existe plus : il n'y a plus de collecte de l'hôte tant que le collecteur est absent.

## Notes

- **Lecture du journal** : le récepteur `journald` lance `journalctl`, et le journal de l'hôte n'est lisible que par le
  groupe `systemd-journal`. Le drop-in ajoute `SupplementaryGroups=systemd-journal` à l'unité.
- **Pas de rejeu du journal** : `start_at: end` ne lit que les nouvelles entrées au premier démarrage, car le journal
  persistant de l'hôte est volumineux. Ensuite, le curseur est conservé dans `/var/lib/otelcol-contrib`
  (`StateDirectory` du drop-in) : un redémarrage reprend où il s'était arrêté.
- **Filtres disques et interfaces** : `hostmetrics` ne retient que les disques physiques (`nvme`, `sd`, `vd`), les NIC
  physiques, les bonds, les ponts `vmbr`, les VLAN et `talosnet`. Chaque volume d'invité (`dm-*`, `zd*`, `nbd*`) et
  chaque interface `tap`, `veth` ou `fwbr` apparaissent et disparaissent avec les invités : sans filtre, la cardinalité
  des séries explose (environ 6500 séries avec node-exporter, environ 370 avec ce collecteur).
- **Identité** : `host.name` est le nom d'hôte du nœud et `service.name` vaut `hostmetrics` pour les métriques, le nom
  du processus (`SYSLOG_IDENTIFIER`) pour les journaux.

## Historique

- _2026-11-11_ : Création. Remplace la procédure d'installation de node-exporter sur Proxmox, supprimée avec le LXC
  `pve-exporter`.

## Pour aller plus loin

- [README des fichiers de l'hôte Proxmox](../../../projects/chezmoi.sh/src/infrastructure/proxmox/host/README.md) :
  contenu de la configuration et du drop-in versionnés.
- [ADR-018](../../decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md) : le
  choix d'OTLP/HTTP comme seul protocole d'ingestion.
- [Infrastructure manuelle](../../reference/Infrastructure-Manuelle-Reference.md) : ce qui est configuré à la main sur
  l'hôte Proxmox.
- [Mettre à jour un LXC par échange du rootfs](INF-20260605-00-Mettre-a-Jour-un-LXC-par-Echange-du-Rootfs.md) : la
  procédure des appliances LXC qui portent l'agent `o11y-agent`.
