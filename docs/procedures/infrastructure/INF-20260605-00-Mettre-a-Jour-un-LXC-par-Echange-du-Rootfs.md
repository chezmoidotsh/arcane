# INF-20260605-00 Mettre à jour un LXC par échange du rootfs

Cette procédure déploie une nouvelle version d'un LXC NixOS de `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/` sur
Proxmox : construction du template, envoi vers le nœud, puis remplacement du volume rootfs du conteneur. Les volumes de
données persistants (`mp0`, `mp1`, …) ne sont jamais copiés : seules leurs références changent, ou elles ne bougent pas
du tout, donc le risque de perte de données est nul.

Le chemin recommandé est le script `mise run lxc:upgrade`, qui met à jour le conteneur en place (même VMID) avec un
snapshot comme filet de sécurité. La variante manuelle, qui passe par un second conteneur, reste documentée pour le cas
où le script ne convient pas. L'indisponibilité cible est de 2 minutes au plus (arrêt de l'ancien CT, échange du rootfs,
démarrage, services actifs).

> [!WARNING]\
> Vérifiée contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées sur Proxmox pour cette migration.
> L'ancienne version avait été validée sur l'appliance o11y en production (indisponibilité d'environ 19 s) ; la date de
> cette validation n'est pas consignée.

## Cadre technique et conventions

- **Une procédure pour six appliances** : `observability`, `oci-registry`, `omni`, `omni-infra-provider-proxmox`,
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
- secrets de l'appliance présents dans `secrets/*.sops.env` (déchiffrés au moment du build puis effacés de
  l'environnement) ; s'ils manquent, `mise run lxc:secrets:sync` les régénère pour les appliances qui le proposent
  (`observability`, `oci-registry`, `omni` et `pve-exporter`) ;
- pour la variante manuelle, un VMID cible libre (`TARGET_ID`, 199 par défaut) ou la disposition à détruire
  (`pct destroy`) un reliquat d'une exécution précédente ;
- confirmation que l'uid/gid du service de la nouvelle image est inchangé par rapport au CT en cours. S'ils changent, la
  correction de propriété des données (étape de bascule de la variante manuelle) devient obligatoire.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles. Les variables
`SOURCE_ID` à `HOST_UID` ne servent qu'à la variante manuelle ; `SNAPSHOT` et `NEW_VOLUME` ne servent qu'au retour
arrière du script.

```sh
export PVE_HOST=<nom d'hôte du nœud Proxmox>                  # ex. pve-01.pve.chezmoi.sh
export LXC_NAME=<nom passé à lxc_init, préfixe du template>   # ex. observability
export VERSION=<version de l'image lue dans flake.nix>        # ex. 2026.10.09 (v2.1.18 pour oci-registry)
export BUILD_PATH=projects/chezmoi.sh/src/infrastructure/proxmox/lxc/${LXC_NAME}
export TEMPLATE=/var/lib/vz/template/cache/${LXC_NAME}.${VERSION}-amd64.tar.xz
export VMID=<VMID du CT en cours, ou du nouveau CT après la variante manuelle>   # ex. 101
export SNAPSHOT=<snapshot pre-upgrade-* du CT>                # ex. pre-upgrade-20261017-101500
export NEW_VOLUME=<volume rootfs créé par le script>          # ex. nvme-lvm:vm-101-disk-2
export SOURCE_ID=<VMID du CT en cours>                        # ex. 101
export TARGET_ID=<VMID du nouveau CT>                         # ex. 199
export STORAGE=<pool de stockage du rootfs et de mp0>         # ex. nvme-lvm
export MP0_MOUNT=<point de montage de mp0 dans le CT>         # ex. /persistent (/var/lib/zot pour oci-registry)
export DATA_SUBDIR=<sous-dossier de mp0 à contrôler>          # ex. o11y
export HOST_UID=<uid hôte du propriétaire, 100000 + uid du CT>   # ex. 100980 (o11y), 100994 (zot)
```

Les couples sous-dossier/uid que le script enregistre pour chaque appliance (`lxc_mp`) figurent dans le tableau de
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

# Incrémenter la version (champ `version` ou `imageVersion`, selon l'appliance)
$EDITOR flake.nix

mise run lxc:build
# → tarball ${LXC_NAME}.${VERSION}-amd64.tar.xz créé à côté de flake.nix
```

Selon l'appliance, `config/` peut ne pas exister : indexer les dossiers présents.

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

Sans `--vmid`, le script cherche le CT par tag Proxmox (le nom de l'appliance et son tag, par exemple `_o11y`), puis par
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

Le contrôle de la phase 6 du script affiche l'état de chaque service enregistré pour l'appliance. Le tableau reprend ces
services, les propriétaires de données et la vérification de bout en bout que le script suggère.

| Appliance                     | Services contrôlés                                                                                                 | `lxc_mp` (sous-dossier : uid hôte) | Vérification de bout en bout                                           |
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

Résultat attendu : `degraded` possible pour `systemctl is-system-running` à cause de `sys-kernel-debug.mount` (un
conteneur non privilégié ne peut pas monter `/sys/kernel/debug`), tous les services du tableau `active`, et la
vérification de bout en bout répond.

## Étape 5 — Variante manuelle : échange avec un second CT

À utiliser quand `lxc:upgrade` ne convient pas. La méthode crée un CT parallèle avec le nouveau template, puis déplace
les volumes de données de l'ancien CT vers le nouveau. Deux CT coexistent brièvement, mais un seul possède chaque point
de montage à un instant donné, donc les services qui partagent le stockage ne peuvent pas l'abîmer. Contrairement au
script, le CT final porte un nouveau VMID (`TARGET_ID`) : tout consommateur qui référence l'ancien VMID doit être mis à
jour.

### Contrôles préalables

Aucune de ces commandes ne modifie l'état, sauf la dernière qui détruit un reliquat éventuel du VMID cible.

```sh
# Template présent sur le nœud
ssh root@${PVE_HOST} "test -f ${TEMPLATE} && ls -lh ${TEMPLATE}"
# → le fichier avec sa taille

# Configuration source (relever les lignes rootfs et mp0)
ssh root@${PVE_HOST} "cat /etc/pve/lxc/${SOURCE_ID}.conf"
# → les lignes rootfs: et mp0:

# VMID cible libre ? Un CT résiduel d'une exécution précédente est détruit ici : la
# procédure suppose une table rase. pct destroy refuse de toucher aux volumes du CT
# ${SOURCE_ID} (mp0 y est toujours rattaché), donc l'opération est sûre.
ssh root@${PVE_HOST} "
if [ -f /etc/pve/lxc/${TARGET_ID}.conf ]; then
  echo 'WARN: CT ${TARGET_ID} exists — destroying.'
  pct stop ${TARGET_ID} 2>/dev/null || true
  pct destroy ${TARGET_ID}
fi
test ! -f /etc/pve/lxc/${TARGET_ID}.conf && echo TARGET FREE"
# → TARGET FREE
```

Conserver la spécification de `mp0` pour la bascule :

```sh
MP0_SPEC=$(ssh root@${PVE_HOST} "grep '^mp0:' /etc/pve/lxc/${SOURCE_ID}.conf | sed 's/^mp0: //'")
echo "MP0_SPEC=${MP0_SPEC}"
# → par exemple : nvme-lvm:vm-101-disk-1,mp=/persistent,size=64G
```

### Créer le CT cible (rootfs seul, sans mp0)

Le nouveau CT reçoit un rootfs neuf issu du template. Ne pas rattacher `mp0` : il appartient encore à la source.
Reprendre `features`, `memory` et `cores` de la source pour que le test de fumée reflète les conditions de production.

Le script d'automatisation copie `features` de la source et signale `features:nesting=1` comme première piste quand
l'activation NixOS échoue (`lxc.sh`, étape de test). Les README du dépôt montrent que ce réglage dépend de l'appliance :
`nesting=1` pour `omni` (« required for stage-2 NixOS activation ») et `omni-infra-provider-proxmox`, `nesting=0` pour
`observability`, `oci-registry` et `pve-exporter`. Reprendre donc `features` tel quel de la source, sans le fixer à une
valeur unique.

```sh
ssh root@${PVE_HOST} "
ROOTFS_LINE=\$(grep '^rootfs:' /etc/pve/lxc/${SOURCE_ID}.conf | sed 's/^rootfs: //')
ROOTFS_STORAGE=\$(echo \"\$ROOTFS_LINE\" | cut -d: -f1)
ROOTFS_SIZE=\$(echo \"\$ROOTFS_LINE\" | grep -oE 'size=[0-9]+' | cut -d= -f2)
FEATURES=\$(grep '^features:' /etc/pve/lxc/${SOURCE_ID}.conf | sed 's/^features: //')
MEMORY=\$(grep '^memory:' /etc/pve/lxc/${SOURCE_ID}.conf | awk '{print \$2}')
CORES=\$(grep '^cores:' /etc/pve/lxc/${SOURCE_ID}.conf | awk '{print \$2}')
echo \"create: rootfs=\$ROOTFS_STORAGE:\$ROOTFS_SIZE features=\$FEATURES memory=\$MEMORY cores=\$CORES\"

pct create ${TARGET_ID} ${TEMPLATE} \
  --rootfs \$ROOTFS_STORAGE:\$ROOTFS_SIZE \
  --features \"\$FEATURES\" \
  --memory \$MEMORY \
  --cores \$CORES \
  --swap 0
"
# → le CT possède son propre rootfs ${STORAGE}:vm-${TARGET_ID}-disk-0, les mêmes features que la source
#   et un réseau par défaut (MAC générée) adapté au test de fumée
```

Sans `--memory` ni `--cores`, `pct create` retient 512 MiB et 1 cœur : reprendre ceux de la source évite un test de
fumée qui ne reflète pas la pression de production.

### Tester le nouveau template (réseau par défaut, sans données)

Le CT fraîchement créé a sa propre MAC et pas de `mp0`. Le démarrer tel quel confirme que le système et le réseau de
base du nouveau template fonctionnent, avant de copier la configuration source (qui clonerait la MAC de la source et
provoquerait une collision sur le bridge tant que la source tourne).

```sh
ssh root@${PVE_HOST} "pct start ${TARGET_ID}"
sleep 10

# /run/current-system doit exister. S'il manque, l'activation stage-2 a échoué
# (cause la plus fréquente : réglage `features` incompatible avec l'appliance).
ssh root@${PVE_HOST} "pct exec ${TARGET_ID} -- /bin/sh -c '
test -e /run/current-system && echo \"OK activation\" || echo \"FAIL — no /run/current-system\"
'"
# → OK activation

# Le PATH NixOS complet sert pour la suite des contrôles
ssh root@${PVE_HOST} "pct exec ${TARGET_ID} -- /run/current-system/sw/bin/bash -lc '
echo === is-system-running ===
systemctl is-system-running
echo === failed units ===
systemctl --failed --no-legend
'"
# → degraded, avec uniquement les échecs de base décrits ci-dessous
```

Lecture du résultat :

- `OK activation` à la première sonde ;
- `systemctl is-system-running` renvoie `degraded`, ce qui est acceptable : le CT jetable a toujours des échecs de base,
  dont `sys-kernel-debug.mount` (un conteneur non privilégié ne peut pas monter `/sys/kernel/debug`) et
  `network-addresses-eth*.service` (les interfaces de la source n'existent pas dans ce CT) ;
- les services applicatifs sont `inactive` plutôt qu'en échec : ils ont tenté de démarrer, se sont arrêtés faute de
  données dans `${MP0_MOUNT}` (pas de `mp0`) et ont atteint la limite de redémarrage de systemd. C'est normal à ce
  stade.

Arrêter le CT avant la fusion des configurations :

```sh
ssh root@${PVE_HOST} "pct stop ${TARGET_ID}"
```

### Fusionner la configuration source dans la cible

Copier chaque ligne de la configuration source dans la cible en remplaçant uniquement le nom du volume rootfs source par
le volume neuf, et supprimer `mp0` pour que la cible ne monte jamais par erreur un volume qui appartient encore à la
source. Après cette étape, la cible partage la MAC, le nom d'hôte, le VLAN, etc. de la source : elle ne doit **pas**
être démarrée avant la bascule.

> [!WARNING]\
> Une fois cette étape faite, la MAC est partagée entre la source et la cible. Ne jamais lancer `pct start` sur la cible
> en dehors de la bascule ci-dessous : le bridge verrait une collision de MAC et le DHCP attribuerait la même IP aux
> deux CT.

```sh
ssh root@${PVE_HOST} "
NEW_ROOTFS_VOL=\$(grep '^rootfs:' /etc/pve/lxc/${TARGET_ID}.conf | awk '{print \$2}' | cut -d, -f1)
OLD_ROOTFS_VOL=\$(grep '^rootfs:' /etc/pve/lxc/${SOURCE_ID}.conf | sed 's/^rootfs: //' | cut -d, -f1)
echo \"OLD=\$OLD_ROOTFS_VOL NEW=\$NEW_ROOTFS_VOL\"
sed \"s|\$OLD_ROOTFS_VOL|\$NEW_ROOTFS_VOL|g\" /etc/pve/lxc/${SOURCE_ID}.conf > /etc/pve/lxc/${TARGET_ID}.conf
sed -i '/^mp0:/d' /etc/pve/lxc/${TARGET_ID}.conf
[ -f /etc/pve/firewall/${SOURCE_ID}.fw ] && cp /etc/pve/firewall/${SOURCE_ID}.fw /etc/pve/firewall/${TARGET_ID}.fw || echo '(no firewall file to copy)'
echo === target conf ===
cat /etc/pve/lxc/${TARGET_ID}.conf
"
# → la configuration cible reprend celle de la source ligne à ligne, sans la ligne mp0, avec le nouveau nom de rootfs
```

### Basculer (l'indisponibilité commence ici)

Arrêter la source, détacher `mp0`, rattacher le même volume à la cible, puis démarrer la cible. `pct set --delete mp0`
ne retire que la _référence_ de la configuration ; le volume LVM est conservé (il passe dans une entrée `unused0:` de la
configuration source, nettoyée à l'étape de désactivation).

```sh
T0=$(date +%s)

ssh root@${PVE_HOST} "
pct stop ${SOURCE_ID}
pct set ${SOURCE_ID} --delete mp0
pct set ${TARGET_ID} -mp0 '${MP0_SPEC}'
pct start ${TARGET_ID}
"

echo "cutover commands: $(( $(date +%s) - T0 ))s — services still warming up"
# → durée des commandes de bascule, les services démarrent encore
```

Contrôler la propriété des données, nécessaire seulement si l'uid du conteneur a changé entre les images (rarement) :

```sh
# Confirmer que la propriété côté hôte correspond toujours au mapping uid conteneur → hôte
ssh root@${PVE_HOST} "pct mount ${TARGET_ID} >/dev/null && stat -c '%u:%g %n' /var/lib/lxc/${TARGET_ID}/rootfs${MP0_MOUNT}/${DATA_SUBDIR}; pct unmount ${TARGET_ID}"
# → ${HOST_UID}:${HOST_UID} pour chaque sous-dossier du tableau de l'étape 4
```

Si la propriété est fausse, la corriger une fois, CT arrêté et **sous-dossier par sous-dossier** : sur `observability`
et `omni`, `mp0` contient deux sous-dossiers de propriétaires différents (`o11y`/`omni` en 100980 et `caddy` en 100997
d'après `lxc_mp`), donc un `chown -R` global du point de montage casserait la propriété de l'un d'eux.

```sh
ssh root@${PVE_HOST} "pct stop ${TARGET_ID} && pct mount ${TARGET_ID} && chown -R ${HOST_UID}:${HOST_UID} /var/lib/lxc/${TARGET_ID}/rootfs${MP0_MOUNT}/${DATA_SUBDIR} && pct unmount ${TARGET_ID} && pct start ${TARGET_ID}"
```

### Vérifier que le nouveau CT est sain (l'indisponibilité s'arrête quand cette étape passe)

Laisser environ 15 s aux services après `pct start`, puis lancer le contrôle.

```sh
sleep 15
ssh root@${PVE_HOST} "pct exec ${TARGET_ID} -- /run/current-system/sw/bin/bash -lc '
echo === is-system-running ===
systemctl is-system-running
echo === failed units ===
systemctl --failed --no-legend
'"
# → degraded possible, avec seulement les échecs de base constatés pendant le test de fumée, et aucune nouvelle
#   unité en échec
```

Contrôler ensuite les services et la vérification de bout en bout de l'appliance avec le tableau de l'étape 4, en
exportant `VMID=${TARGET_ID}`. En cas d'échec, appliquer le retour arrière.

### Désactiver l'ancien CT

Si la vérification passe, détruire la source. `pct set --delete mp0` a déplacé la référence du volume vers `unused0:`
dans la configuration source ; Proxmox considère toujours `vm-${SOURCE_ID}-disk-1` comme appartenant au VMID source,
donc `pct destroy` refuse de terminer tant que cette entrée existe (`lvremove` échoue avec « Logical volume … contains a
filesystem in use »). C'est aussi vrai de `pct set --delete unused0`.

Supprimer les références pendantes par édition directe de la configuration, puis détruire :

```sh
ssh root@${PVE_HOST} "
sed -i '/^rootfs:/d; /^unused0:/d' /etc/pve/lxc/${SOURCE_ID}.conf
pct destroy ${SOURCE_ID}
pct list | head -10
"
# → ${SOURCE_ID} a disparu de la liste, ${TARGET_ID} est running
```

Le nom LVM du volume persistant garde le préfixe de l'ancien VMID (`vm-${SOURCE_ID}-disk-1`) : c'est cosmétique. Le
renommer imposerait d'arrêter la cible, de lancer `lvrename`, de repointer `pct set` vers le nouveau nom puis de
redémarrer, soit 30 à 60 s d'indisponibilité de plus sans bénéfice ; le nom indique seulement quel VMID a alloué le
volume en premier.

Nettoyer les volumes LVM orphelins laissés par d'éventuelles opérations échouées :

```sh
ssh root@${PVE_HOST} "lvs ${STORAGE} | grep vm-${SOURCE_ID}-"
# → seul vm-${SOURCE_ID}-disk-1 (le mp0 vivant, "Vwi-aotz--" : le 'o' signifie ouvert)
```

S'il y a d'autres volumes `vm-${SOURCE_ID}-disk-N`, vérifier qu'ils n'apparaissent dans aucun
`/etc/pve/{lxc,qemu-server}/*.conf`, puis les supprimer un par un :

```sh
ssh root@${PVE_HOST} "lvremove -f ${STORAGE}/vm-${SOURCE_ID}-disk-0"
```

Rendre au CT son VMID d'origine n'est pas possible sur place : Proxmox ne renomme pas un VMID, et le faire reviendrait à
rejouer toute la variante avec un troisième CT. Le plus simple est de garder le nouveau CT sous `TARGET_ID` et de mettre
à jour les consommateurs qui référençaient l'ancien identifiant.

## Exemple complet : mise à jour de l'appliance `observability` avec le script

Exemple de forme, non rejoué. L'hôte, le nom de l'appliance et la version viennent du dépôt (`version = "2026.10.09"`
dans `observability/flake.nix`). Le VMID `101` vient de l'ancienne version de la page et n'est pas vérifiable dans le
dépôt : à relever sur le nœud avec `pct list`.

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
  : `running`, ou `degraded` avec uniquement les échecs de base (`sys-kernel-debug.mount`).
- **Services** : `systemctl is-active <service>` pour chaque service du tableau de l'étape 4 : `active`.
- **Bout en bout** : la commande de la dernière colonne du tableau de l'étape 4 répond.
- **Plus de snapshot résiduel** (script) : `ssh root@${PVE_HOST} "pct listsnapshot ${VMID}"` : aucun `pre-upgrade-*`,
  sans quoi le prochain `lxc:upgrade` refuse de démarrer.

## Retour arrière

**Script `lxc:upgrade`** : répondre autre chose que `y` à la question de validation (phase 7) arrête le CT, le restaure
depuis le snapshot `pre-upgrade-*`, le redémarre et libère le nouveau volume. Si le script s'interrompt après la
création du snapshot, il tente le même retour arrière automatiquement. S'il échoue, le faire à la main :

```sh
ssh root@${PVE_HOST} "pct stop ${VMID}; pct rollback ${VMID} ${SNAPSHOT}; pct start ${VMID}"
ssh root@${PVE_HOST} "pvesm free ${NEW_VOLUME}"
```

**Variante manuelle** : si la vérification échoue, inverser le déplacement. Le budget d'indisponibilité est comparable
(environ 20 s). Ce retour arrière n'est possible que tant que la source n'a pas été détruite.

```sh
ssh root@${PVE_HOST} "
pct stop ${TARGET_ID}
pct set ${TARGET_ID} --delete mp0
pct set ${SOURCE_ID} -mp0 '${MP0_SPEC}'
pct start ${SOURCE_ID}
"

# Confirmer que l'ancien CT est revenu
sleep 15
ssh root@${PVE_HOST} "pct exec ${SOURCE_ID} -- /run/current-system/sw/bin/systemctl is-system-running"
# → running, ou degraded avec uniquement les échecs de base

# Détruire la cible en échec. Même piège qu'à la désactivation : pct set --delete mp0
# laisse une entrée unused0 qui désigne le volume désormais rattaché ailleurs.
ssh root@${PVE_HOST} "
sed -i '/^unused0:/d' /etc/pve/lxc/${TARGET_ID}.conf
pct destroy ${TARGET_ID}
"
```

Le volume de données persistant n'a jamais quitté son stockage : seules les configurations l'ont référencé différemment.

## Problèmes connus

### Fichiers ajoutés avec `--intent-to-add`

`git add --intent-to-add` est invisible pour un build de flake Nix. Indexer complètement les changements du dépôt avant
`mise run lxc:build`, sans quoi le tarball embarque l'ancien contenu alors que le build « réussit ».

### Ressources du CT de test

`pct create` retient par défaut 512 MiB et 1 cœur. Le script reprend `memory` et `cores` de la source ; la variante
manuelle doit le faire explicitement.

### `pct destroy` retire tous les volumes `vm-<VMID>-*`

Même ceux déplacés dans `unused0:` et activement montés par un autre CT. `lvremove` échoue sans danger mais laisse le CT
source à moitié détruit. Retirer `rootfs:` et `unused0:` de la configuration avant de détruire.

### Nom du volume `mp0`

Le volume LVM garde indéfiniment le nom `vm-<SOURCE_ID>-disk-1` après l'échange : Proxmox ne renomme pas les LV.
L'indicateur « open » dans la sortie de `lvs` permet de repérer le volume vivant.

### Snapshot `pre-upgrade-*` résiduel

Un run précédent de `lxc:upgrade` interrompu avant la phase 7 laisse un snapshot ; le script refuse alors d'en empiler
un second. Restaurer le snapshot (`pct rollback`) ou, si le CT reflète déjà l'état voulu, le supprimer
(`pct delsnapshot ${VMID} ${SNAPSHOT}`).

### Volume rootfs orphelin

Après une exécution interrompue entre les phases 5 et 7, vérifier `pvesm list ${STORAGE}` et libérer à la main les
volumes non référencés.

## Historique

- _2026-10-17_ : Alignement sur le gabarit de procédure v2 : intro en deux paragraphes et état de vérification en
  callout `WARNING`, entrées regroupées dans un seul bloc `export` utilisé par toutes les étapes, variante manuelle
  numérotée en étape 5, phases du script distinguées des étapes, sorties attendues ajoutées, exemple complet ajouté.
  Liste des appliances proposant `lxc:secrets:sync` précisée d'après les `.mise.toml`.
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
- [README de l'appliance observability](../../../projects/chezmoi.sh/src/infrastructure/proxmox/lxc/observability/README.md)
  : création initiale du conteneur et configuration de l'appliance.
- [ADR-013 Observabilité centralisée](../../decisions/ADR-013-Observabilite-Centralisee-VictoriaMetrics-sur-LXC.md) :
  décision à l'origine de l'appliance `observability`.
- [Installer node-exporter sur Proxmox](INF-20260620-00-Installer-Node-Exporter-sur-Proxmox.md) : autre procédure
  d'infrastructure sur le nœud Proxmox.
