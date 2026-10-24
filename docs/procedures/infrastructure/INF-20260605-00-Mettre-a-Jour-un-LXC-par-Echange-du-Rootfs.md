# INF-20260605-00 Mettre à jour un LXC par échange du rootfs

Cette procédure déploie une nouvelle version d'un LXC NixOS de `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/` sur
Proxmox : construction du template, envoi vers le nœud, puis remplacement du volume rootfs du conteneur. Les volumes de
données persistants (`mp0`, `mp1`, …) ne sont jamais copiés : seules leurs références changent, ou elles ne bougent pas
du tout, donc le risque de perte de données est nul.

Le script `mise run lxc:upgrade` met à jour le conteneur en place (même VMID) avec un snapshot comme filet de sécurité.
L'indisponibilité cible est de 2 minutes au plus (arrêt du CT, échange du rootfs, démarrage, services actifs).

> [!WARNING]\
> Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées sur Proxmox pour cette migration.
> L'ancienne version avait été validée sur le conteneur `observability` en production (indisponibilité d'environ 19 s) ;
> la date de cette validation n'est pas consignée.

## Cadre technique et conventions

- **Une procédure pour six conteneurs** : `observability`, `oci-registry`, `omni`, `omni-infra-provider-proxmox`,
  `pve-exporter` et `talosnet-dns`. Chaque dossier porte ses tâches `mise` (`lxc:build`, `lxc:push`, `lxc:upgrade`) qui
  s'appuient sur la bibliothèque commune `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/.mise/lib/lxc.sh`.
- **Stockage** : LVM-thin. Les volumes ont la forme `<STORAGE>:vm-<VMID>-disk-N`. Dans les exemples, `STORAGE` vaut
  `nvme-lvm` (pool déclaré dans `projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/pools.ts`). Le renommage du
  volume rootfs par le script ne vaut que pour LVM-thin ; sur un autre type de stockage, le volume garde le nom du CT
  temporaire.
- **Mapping des uid** : dans un conteneur non privilégié, l'uid N du conteneur correspond à l'uid `100000 + N` sur
  l'hôte.
- **Nom du template** : `<LXC_NAME>.<VERSION>-amd64.tar.xz`, avec `VERSION` lu dans `flake.nix` (première occurrence de
  `imageVersion` ou de `version`). Pour `oci-registry`, `version` est la version amont de Zot (`vX.Y.Z`) et précède
  `imageVersion` : le template porte donc la version de Zot.
- **Exécution** : les commandes `ssh` s'exécutent depuis le poste de travail ; les commandes `pct` s'exécutent sur le
  nœud Proxmox en `root`.

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `mise` (`mise install` exécuté),
`git`, Docker (conteneur de build Nix), `sops` avec la clé age du dépôt (`SOPS_AGE_KEY_FILE`), `ssh`, `scp`.

Les accès suivants sont également nécessaires :

- accès SSH par clé à `root@<PVE_HOST>` ;
- secrets du conteneur présents dans `secrets/*.sops.env` (déchiffrés au moment du build puis effacés de
  l'environnement) ; s'ils manquent, `mise run lxc:secrets:sync` les régénère pour les conteneurs qui le proposent
  (`observability`, `oci-registry`, `omni` et `pve-exporter`).

## Entrées requises

Exporter ces variables une fois ; les commandes suivantes se copient ensuite telles quelles. `VERSION` et `TEMPLATE`
sont définies à l'étape 1, une fois la version incrémentée ; `SNAPSHOT`, `STORAGE` et `NEW_VOLUME` ne servent qu'au
retour arrière et sont relevées au moment où il faut les utiliser.

```sh
export PVE_HOST=<nom d'hôte du nœud Proxmox>   # ex. pve-01.pve.chezmoi.sh
export LXC_NAME=<dossier du conteneur>         # ex. observability ; ls projects/chezmoi.sh/src/infrastructure/proxmox/lxc/
export BUILD_PATH=projects/chezmoi.sh/src/infrastructure/proxmox/lxc/${LXC_NAME}
export VMID=<VMID du CT>                       # ex. 101 ; visible dans « ssh root@${PVE_HOST} pct list » ou dans le récapitulatif du script
```

Les couples sous-dossier/uid que le script enregistre pour chaque conteneur (`lxc_mp`) figurent dans le tableau de
l'étape 4.

## Étape 1 — Construire le template

Si le template existe déjà dans `/var/lib/vz/template/cache/` du nœud, passer à l'étape 3.

Le nom du template vient de la version déclarée dans `flake.nix` : reconstruire sous une version inchangée produit un
artefact qui porte le même nom que celui déjà présent sur le nœud. Incrémenter la version avant chaque build (CalVer
`YYYY.MM.DD`, suffixe `-N` pour un second build le même jour).

> [!IMPORTANT]\
> Nix évalue le flake depuis l'index Git : un fichier ajouté avec `git add --intent-to-add` ou resté non suivi n'est pas
> vu comme son contenu réel, et le build peut réussir en produisant un tarball qui embarque l'ancienne configuration.
> Ajouter les fichiers à l'index (`git add <fichiers>`, sans option) avant `mise run lxc:build`.

```sh
cd ${BUILD_PATH}

# Indexer tout ce qui doit être livré ; rien d'important ne doit rester en "AM" ou non suivi
git status --short config/ modules/ flake.nix
git add config/ modules/ flake.nix
git status --short config/ modules/ flake.nix
# → "M " ou "A " (indexé)

# Incrémenter la version (champ `version` ou `imageVersion`, selon le conteneur)
$EDITOR flake.nix

# Relire la version et en déduire le nom du template
export VERSION=$(sed -nE 's/^ *(imageVersion|version) *= *"([^"]+)".*/\2/p' flake.nix | head -1)
export TEMPLATE=/var/lib/vz/template/cache/${LXC_NAME}.${VERSION}-amd64.tar.xz
echo "${VERSION}"
# → ex. 2026.10.09 (v2.1.18 pour oci-registry, dont `version` précède `imageVersion`)

mise run lxc:build
# → tarball ${LXC_NAME}.${VERSION}-amd64.tar.xz créé à côté de flake.nix
```

Selon le conteneur, `config/` peut ne pas exister : indexer les dossiers présents.

## Étape 2 — Envoyer le template sur le nœud

```sh
mise run lxc:push -- ${PVE_HOST}
# → "already on <hôte> (SHA matches), skipping." si le fichier est déjà là, sinon envoi par scp
```

La tâche calcule le SHA-256 local, le compare à celui du nœud et n'envoie rien s'ils sont identiques. Elle dépend de
`lxc:build`, qui est donc relancé avant l'envoi. Le fichier atterrit dans `/var/lib/vz/template/cache/`.

## Étape 3 — Mettre à jour le conteneur avec `lxc:upgrade`

Le script remplace le rootfs du CT existant en place : le VMID, l'IP statique, l'identité de sauvegarde PBS et les
points de montage ne changent pas. Un snapshot Proxmox sert de retour arrière.

```sh
cd ${BUILD_PATH}
mise run lxc:upgrade -- ${PVE_HOST}
# → récapitulatif du CT détecté, déroulé des phases 1 à 6, puis la question
#   « CT <VMID> is working correctly? [y/N] »
```

Trois options modifient ce comportement :

```sh
mise run lxc:upgrade -- ${PVE_HOST} --vmid ${VMID}        # CT désigné, sans auto-détection
mise run lxc:upgrade -- ${PVE_HOST} --version ${VERSION}  # version désignée, sans lecture de flake.nix
mise run lxc:upgrade -- ${PVE_HOST} --yes                 # sans confirmation
```

Sans `--vmid`, le script cherche le CT par tag Proxmox (le nom du conteneur et son tag, par exemple `_o11y`), puis par
nom d'hôte. Sans `--version`, il lit la version dans `flake.nix`.

| Phase | Action                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | Contrôles préalables : template présent, CT existant, aucun snapshot `pre-upgrade-*` résiduel, points de montage OK    |
| 2     | Test sur un CT jetable créé depuis le nouveau template : activation NixOS et unités systemd, puis destruction du CT    |
| 3     | Snapshot du CT (`pct snapshot <vmid> pre-upgrade-<horodatage>`)                                                        |
| 4     | Arrêt du CT (début de l'indisponibilité)                                                                               |
| 5     | Remplacement du volume rootfs (même VMID), puis démarrage                                                              |
| 6     | Attente de 30 s puis contrôle de santé : `systemctl is-system-running`, unités en échec, état des services enregistrés |
| 7     | Validation (suppression du snapshot et de l'ancien volume) ou retour arrière sur le snapshot                           |

Le test de la phase 2 ignore deux échecs attendus dans le CT jetable : `network-addresses-eth*.service` (le CT jetable
n'a pas les interfaces du CT source ; les cloner dupliquerait les IP statiques sur le réseau réel) et
`sys-kernel-debug.mount`. Toute autre unité en échec arrête le script. À la phase 7, répondre `y` à la question « CT …
is working correctly? » valide la mise à jour ; toute autre réponse déclenche le retour arrière.

## Étape 4 — Vérifier que le CT est sain

Le contrôle de la phase 6 du script affiche l'état de chaque service enregistré pour le conteneur. Le tableau reprend
ces services, les propriétaires de données et la vérification de bout en bout que le script suggère.

| Conteneur                     | Services contrôlés                                                                                                 | `lxc_mp` (sous-dossier : uid hôte) | Vérification de bout en bout                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| `observability`               | `caddy vector victoriametrics victorialogs victoriatraces vmalert alertmanager prometheus-node-exporter lxc-agent` | `o11y` : 100980, `caddy` : 100997  | `curl -sSf https://data.o11y.chezmoi.sh/metrics/api/v1/query?query=up` |
| `oci-registry`                | `caddy zot prometheus-node-exporter lxc-agent`                                                                     | `zot` : 100994, `caddy` : 100997   | `curl -sSf https://oci.chezmoi.sh/v2/`                                 |
| `omni`                        | `caddy dex omni omni-pki-init omni-gpg-init prometheus-node-exporter lxc-agent`                                    | `omni` : 100980, `caddy` : 100997  | `curl -sSfk https://omni.chezmoi.sh/`                                  |
| `omni-infra-provider-proxmox` | `omni-infra-provider-proxmox prometheus-node-exporter lxc-agent`                                                   | aucun (sans état)                  | aucune                                                                 |
| `pve-exporter`                | `pve-exporter prometheus-node-exporter lxc-agent`                                                                  | aucun (sans état)                  | aucune                                                                 |
| `talosnet-dns`                | `bind lxc-agent`                                                                                                   | `bind` : 100993                    | `dig @10.128.0.3 oci.chezmoi.sh`                                       |

Pour `observability`, des contrôles complémentaires depuis le nœud :

```sh
ssh root@${PVE_HOST} "pct exec ${VMID} -- /run/current-system/sw/bin/bash -lc '
echo === VictoriaMetrics up ===
curl -sSf \"127.0.0.1:8428/api/v1/query?query=up\" | head -c 400; echo
echo === VictoriaLogs lignes sur 5 min ===
curl -sSG \"127.0.0.1:9428/select/logsql/stats_query\" --data-urlencode \"query=_time:5m | stats count\" | head -c 200; echo
'"
# → des cibles avec value=1 ; un compteur de lignes de logs
```

Résultat attendu : `running` pour `systemctl is-system-running`, tous les services du tableau `active`, et la
vérification de bout en bout répond.

## Exemple complet : mise à jour du conteneur `observability`

Exemple de forme, non rejoué. L'hôte, le nom du conteneur et la version viennent du dépôt (`version = "2026.10.09"` dans
`observability/flake.nix`). Le VMID `101` vient de l'ancienne version de la page et n'est pas vérifiable dans le dépôt :
à relever sur le nœud avec `pct list`.

```sh
export PVE_HOST=pve-01.pve.chezmoi.sh
export LXC_NAME=observability
export VERSION=2026.10.09
export BUILD_PATH=projects/chezmoi.sh/src/infrastructure/proxmox/lxc/${LXC_NAME}
export VMID=101

cd ${BUILD_PATH}
git add config/ modules/ flake.nix
mise run lxc:build
mise run lxc:push -- ${PVE_HOST}
mise run lxc:upgrade -- ${PVE_HOST} --vmid ${VMID}
# → répondre y à « CT 101 is working correctly? » une fois la phase 6 saine

curl -sSf https://data.o11y.chezmoi.sh/metrics/api/v1/query?query=up
# → réponse JSON de VictoriaMetrics
```

## Vérifications rapides

- **Template en place** : `ssh root@${PVE_HOST} "ls -lh ${TEMPLATE}"` : le fichier existe avec la taille attendue.
- **Système** :
  `pct exec ${VMID} -- /run/current-system/sw/bin/bash -lc 'systemctl is-system-running; systemctl --failed --no-legend'`
  : `running`, sans unité en échec.
- **Services** : `systemctl is-active <service>` pour chaque service du tableau de l'étape 4 : `active`.
- **Bout en bout** : la commande de la dernière colonne du tableau de l'étape 4 répond.
- **Plus de snapshot résiduel** (script) : `ssh root@${PVE_HOST} "pct listsnapshot ${VMID}"` : aucun `pre-upgrade-*`,
  sans quoi le prochain `lxc:upgrade` refuse de démarrer.

## Retour arrière

Répondre autre chose que `y` à la question de validation (phase 7) arrête le CT, le restaure depuis le snapshot
`pre-upgrade-*`, le redémarre et libère le nouveau volume. Si le script s'interrompt après la création du snapshot, il
tente le même retour arrière automatiquement. S'il échoue, le faire à la main :

```sh
export SNAPSHOT=$(ssh root@${PVE_HOST} "pct listsnapshot ${VMID}" | grep -o 'pre-upgrade-[^ ]*' | head -1)
export STORAGE=$(ssh root@${PVE_HOST} "pct config ${VMID}" | sed -nE 's/^rootfs: ([^:]+):.*/\1/p')
echo "${SNAPSHOT} ${STORAGE}"
# → ex. pre-upgrade-20261017-101500 nvme-lvm

ssh root@${PVE_HOST} "pct stop ${VMID}; pct rollback ${VMID} ${SNAPSHOT}; pct start ${VMID}"

# Le volume créé par l'échange n'est plus référencé par la configuration : le repérer, puis le libérer
ssh root@${PVE_HOST} "pct config ${VMID} | grep ^rootfs; pvesm list ${STORAGE} --vmid ${VMID}"
# → le volume de `pvesm list` absent de la ligne `rootfs:` est le nouveau
export NEW_VOLUME=<volume non référencé>       # ex. nvme-lvm:vm-101-disk-2
ssh root@${PVE_HOST} "pvesm free ${NEW_VOLUME}"
```

## Problèmes connus

### Fichiers ajoutés avec `--intent-to-add`

`git add --intent-to-add` est invisible pour un build de flake Nix. Indexer complètement les changements du dépôt avant
`mise run lxc:build`, sans quoi le tarball embarque l'ancien contenu alors que le build « réussit ».

### Snapshot `pre-upgrade-*` résiduel

Un run précédent de `lxc:upgrade` interrompu avant la phase 7 laisse un snapshot ; le script refuse alors d'en empiler
un second. Restaurer le snapshot (`pct rollback`) ou, si le CT reflète déjà l'état voulu, le supprimer
(`pct delsnapshot ${VMID} ${SNAPSHOT}`).

### Volume rootfs orphelin

Après une exécution interrompue entre les phases 5 et 7, vérifier `pvesm list ${STORAGE}` et libérer à la main les
volumes non référencés.

## Historique

- _2026-10-17_ : Alignement sur le gabarit de procédure v2 : intro en deux paragraphes et état de vérification en
  callout `WARNING`, entrées regroupées dans un seul bloc `export` (les valeurs déductibles sont relevées par une
  commande), phases du script distinguées des étapes, sorties attendues ajoutées, exemple complet ajouté. Variante
  manuelle (second conteneur) supprimée : le script `lxc:upgrade` couvre la mise à jour et le retour arrière. Liste des
  conteneurs proposant `lxc:secrets:sync` précisée d'après les `.mise.toml`.
- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, structure
  alignée sur le gabarit de procédure, liens vers les procédures renommées.
- _2026-10-11_ : Procédure rendue autonome : ajout du chemin recommandé `mise run lxc:build`, `lxc:push` et
  `lxc:upgrade` (mise à jour en place, même VMID, snapshot `pre-upgrade-*` comme retour arrière, `.mise/lib/lxc.sh`).
  L'ancien texte décrivait uniquement l'échange manuel avec un second CT, désormais présenté comme variante.
- _2026-10-11_ : `oci-proxy` corrigé en `oci-registry` : `lxc_init "oci-registry"` nomme le template
  `oci-registry.<version>-amd64.tar.xz`, et la version lue est celle de Zot (`version = "v2.1.18"`, première occurrence
  dans `oci-registry/flake.nix`), pas `2.1.17`. Les exemples `VERSION` sont alignés sur les `flake.nix` actuels.
- _2026-10-11_ : Point de montage corrigé : `observability` monte `mp0` sur `/persistent` (sous-dossiers `o11y` et
  `caddy`), pas sur `/var/lib/o11y`. La correction de propriété ne fait plus un `chown -R` global : `mp0` porte deux
  propriétaires (`lxc_mp` : 100980 et 100997).
- _2026-10-11_ : Liste de services d'`observability` corrigée d'après `lxc_services` : `prometheus-node-exporter` et
  `lxc-agent` ajoutés, `syslog` retiré (l'écoute syslog est passée au LXC `pve-exporter`, voir l'en-tête de
  `observability/modules/vector.nix`). Les contrôles d'`oci-registry` et la liste des six appliances sont reconstruits
  depuis les tâches `.mise/tasks/lxc/upgrade`. Les contrôles qui étaient dans des commentaires HTML sont devenus un
  tableau.
- _2026-10-11_ : Affirmation « `features: nesting=1` obligatoire pour tous les LXC NixOS » corrigée : `observability`,
  `oci-registry` et `pve-exporter` se créent avec `nesting=0` d'après leurs README, `omni` et
  `omni-infra-provider-proxmox` avec `nesting=1`. Les `features` sont reprises de la source. Les échecs « de base »
  `zfs-import-scan.service` et `systemd-journal-upload.service` ne sont retrouvés nulle part dans le dépôt et sont
  retirés ; `lxc.sh` ignore `network-addresses-eth*.service` et `sys-kernel-debug.mount`.
- _2026-10-11_ : Précisé que `lxc:push` dépend de `lxc:build` (il le relance), et que `config/` n'existe pas pour toutes
  les appliances.

## Pour aller plus loin

- [Skill : lxc-maintenance](../../../.agents/skills/lxc-maintenance/SKILL.md) : points d'entrée `mise` et bibliothèque
  `lxc.sh` utilisés par cette procédure.
- [README du conteneur observability](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/observability/README.md)
  : création initiale du conteneur et configuration du conteneur.
- [ADR-013 Observabilité centralisée](../../decisions/ADR-013-Observabilite-Centralisee-VictoriaMetrics-sur-LXC.md) :
  décision à l'origine du conteneur `observability`.
- [Installer node-exporter sur Proxmox](INF-20260620-00-Installer-Node-Exporter-sur-Proxmox.md) : autre procédure
  d'infrastructure sur le nœud Proxmox.
