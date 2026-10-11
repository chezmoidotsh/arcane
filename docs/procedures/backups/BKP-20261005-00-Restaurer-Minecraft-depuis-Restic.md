# BKP-20261005-00 Restaurer Minecraft depuis Restic

Cette procédure restaure l'hôte Minecraft de `rimbilliton.akn` (Pelican) à partir de ses sauvegardes hors site : un
dépôt restic sur Backblaze B2, alimenté chaque jour par le job restic `minecraft`
(`src/infrastructure/nixos/modules/backup.nix`). Elle couvre quatre cas : inspecter les snapshots (étape 1), restaurer
le monde d'un serveur (étape 2), restaurer les données du Panel (étape 3) et reconstruire l'hôte après la perte de la VM
(étape 4). Compter quelques minutes pour les étapes 1 à 3 et plusieurs heures pour l'étape 4, qui inclut le réamorçage
complet décrit dans [BOOTSTRAP](../../../projects/rimbilliton.akn/docs/BOOTSTRAP.md).

> [!CAUTION]\
> Cette procédure n'a encore jamais été testée : aucune restauration n'a été rejouée sur l'hôte. Elle a seulement été
> vérifiée contre le dépôt le 2026-10-11 (`modules/backup.nix`, `modules/pelican.nix`, `stack/backblaze.ts`,
> `docs/BOOTSTRAP.md` du projet).

## Cadre technique et conventions

Le fonctionnement des sauvegardes dicte tous les chemins de restauration :

- **Deux couches.** Wings écrit des archives cohérentes des mondes dans
  `/var/lib/pelican/backups/<uuid de la sauvegarde>.tar.gz` quand le planning du Panel (ou une sauvegarde manuelle) le
  demande. restic envoie ensuite ce répertoire et `/var/lib/pelican-panel/data` (base SQLite du Panel, `.env` avec
  `APP_KEY`, plugins) vers B2 chaque jour à 04:30 (jusqu'à 15 minutes de délai aléatoire), avec `Persistent = true`. Une
  exécution de restic produit un snapshot qui contient les deux chemins.
- **Les volumes des serveurs en cours d'exécution ne sont pas sauvegardés.** `/var/lib/pelican/volumes` (les mondes
  actifs) ne figure pas dans les chemins restic : un monde n'existe hors site qu'à travers une archive Wings. Sans
  sauvegardes Wings planifiées dans le Panel, il n'y a rien à restaurer.
- **Dépôt** : `s3:<b2Endpoint>/<bucket>/restic`. `b2Endpoint` vaut `s3.eu-central-003.backblazeb2.com` dans
  `modules/backup.nix` ; `bucket` y est un placeholder (`REPLACE_WITH_PULUMI_OUTPUT_backupsBucketName`) à remplacer par
  la sortie Pulumi `backupsBucketName`. Le bucket est privé et déclaré avec `protect: true, retainOnDelete: true` dans
  Pulumi : il survit à la perte de la VM et à la suppression de la stack.
- **Identifiants** : le mot de passe restic (`restic_password`) et les identifiants B2 (`restic_b2_env`, un fichier
  d'environnement avec `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) sont des secrets SOPS, déchiffrés sur l'hôte dans
  `/run/secrets/`. La clé d'application B2 (`rimbilliton-minecraft-restic`) est limitée à ce bucket et peut lire, écrire
  et supprimer des fichiers.
- **Rétention** : 7 snapshots quotidiens, 4 hebdomadaires, 6 mensuels
  (`--keep-daily 7 --keep-weekly 4 --keep-monthly 6`).
- **Propriétaires** : le conteneur du Panel s'exécute en `www-data` (`82:82`) et possède tout
  `/var/lib/pelican-panel/data`. Wings s'exécute avec `WINGS_UID=988` / `WINGS_GID=988`.

> [!CAUTION]\
> Le mot de passe restic doit être conservé **hors de la VM**. Le modèle de secrets (`secrets/rimbilliton.example.yaml`)
> demande d'en garder une copie dans OpenBao ; ce dépôt ne permet pas de vérifier qu'elle existe. Sans ce mot de passe,
> le dépôt est illisible et toutes les sauvegardes sont perdues. Il se trouve aussi dans `secrets/rimbilliton.sops.yaml`
> (dans Git, chiffré pour la clé age de l'administrateur et celle de l'hôte) : la clé age de l'administrateur est donc
> le second moyen de le récupérer. Avant de compter sur cette procédure, confirmer qu'il est récupérable sans la VM
> (voir les prérequis).

## Prérequis

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `mise` (fournit `sops`), `pulumi`,
`ssh`, ainsi que Docker et `nonix` pour la reconstruction complète (voir
[BOOTSTRAP](../../../projects/rimbilliton.akn/docs/BOOTSTRAP.md)).

Les accès suivants sont également nécessaires :

- Un accès SSH en `root` à l'hôte via Tailscale (SSH n'est joignable que par Tailscale), sauf pour la reconstruction
  complète où l'hôte n'existe pas encore.
- Le mot de passe restic, depuis OpenBao ou avec `sops -d --extract '["restic_password"]' secrets/rimbilliton.sops.yaml`
  (exécuté depuis `projects/rimbilliton.akn/src/infrastructure/nixos`, avec la clé age de l'administrateur,
  `SOPS_AGE_KEY_FILE`).
- Les identifiants B2, depuis `pulumi stack output backupsKeyId` et
  `pulumi stack output backupsKeySecret --show-secrets` (stack `rimbilliton_akn.live`), ou depuis le secret SOPS
  `restic_b2_env`.
- Un accès au Panel en administrateur (`https://minecraft.chezmoi.sh`) pour les étapes 2 et 4.

## Entrées requises

Exporter ces variables une fois sur l'hôte (étapes 1 à 3) ou sur un poste de travail (étape 4, avant que l'hôte
n'existe) :

```bash
export HOST=<nom Tailscale de l'hôte>                          # À adapter, voir BOOTSTRAP.md
export BUCKET=<valeur de la sortie Pulumi backupsBucketName>   # À adapter
export B2_ENDPOINT=<valeur de b2Endpoint dans modules/backup.nix>   # À adapter
export SNAPSHOT_ID=<ID du snapshot restic, ou "latest">        # Choisi à l'étape 1
export SERVER_UUID=<UUID du serveur de jeu>                    # Panel > serveur > Settings > Debug Information
export BACKUP_UUID=<UUID de la sauvegarde Wings>               # Panel > serveur > Backups, ou nom du fichier
export RESTORE_DIR=/var/tmp/restic-restore                     # Répertoire temporaire, hors des chemins actifs
```

## Étape 1 — Lister et inspecter les snapshots

Cette étape est en lecture seule. L'exécuter sur l'hôte, en `root`.

1. Définir explicitement l'environnement restic. Cette méthode fonctionne quel que soit l'état du wrapper :

   ```bash
   export RESTIC_REPOSITORY="s3:${B2_ENDPOINT}/${BUCKET}/restic"
   export RESTIC_PASSWORD_FILE=/run/secrets/restic_password
   set -a; . /run/secrets/restic_b2_env; set +a   # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
   command -v restic || echo "restic not on PATH"
   # → un chemin vers restic. Si "restic not on PATH", préfixer chaque commande restic ci-dessous par : nix shell nixpkgs#restic -c
   ```

   Non vérifié : le module NixOS `services.restic.backups.<nom>` installe normalement un wrapper `restic-minecraft` qui
   préconfigure le dépôt, le fichier de mot de passe et le fichier d'environnement (`restic-minecraft snapshots`).
   `modules/backup.nix` ne définit pas l'option qui le contrôle : la présence du wrapper dépend donc du comportement par
   défaut du module dans le nixpkgs épinglé (`nixos-26.05`). Tester avec `command -v restic-minecraft` ; en son absence,
   utiliser les variables explicites ci-dessus.

2. Lister les snapshots :

   ```bash
   restic snapshots
   # → une ligne par snapshot : ID, date, hôte, chemins. Chacun liste /var/lib/pelican/backups et /var/lib/pelican-panel/data
   ```

3. Inspecter un snapshot (choisir `SNAPSHOT_ID` dans la sortie précédente, ou utiliser `latest`) :

   ```bash
   restic ls "${SNAPSHOT_ID}" /var/lib/pelican/backups | head -50
   # → les archives <uuid de la sauvegarde>.tar.gz présentes dans ce snapshot
   restic ls "${SNAPSHOT_ID}" /var/lib/pelican-panel/data
   # → database/database.sqlite, .env, plugins/ ... (la liste exacte dépend du Panel)
   restic stats "${SNAPSHOT_ID}"
   # → taille totale du snapshot
   ```

**Vérification** : le snapshot le plus récent date de moins de 25 heures environ (04:30 chaque jour, plus le délai
aléatoire). Dans le cas contraire, consulter
`systemctl status restic-backups-minecraft.service restic-backups-minecraft.timer` et
`journalctl -u restic-backups-minecraft`.

## Étape 2 — Restaurer le monde d'un serveur depuis une archive Wings

Chaque archive Wings contient un seul serveur et porte l'UUID de la sauvegarde. Choisir le chemin adapté : l'archive est
encore sur l'hôte (2a), ou elle n'existe que dans B2 (2b d'abord, puis 2a).

### 2a — Par le Panel (méthode recommandée)

1. Dans le Panel, ouvrir le serveur, puis Backups. Choisir la sauvegarde, puis Restore.
2. Choisir de supprimer ou non les fichiers existants au préalable (« truncate directory »). Sans cette option,
   l'archive est extraite par-dessus les fichiers actuels et conserve les fichiers qu'elle ne contient pas.

   Non vérifié : savoir si le serveur doit être arrêté à la main avant la restauration, ou si Wings l'arrête lui-même,
   dépend de la version de Pelican (`v1.0.0-beta38` / Wings `v1.0.0-beta29`) et n'est pas décrit dans ce dépôt. Arrêter
   d'abord le serveur depuis le Panel : c'est sans risque et cela évite une restauration par-dessus un monde actif.

3. Attendre la fin de la restauration, puis démarrer le serveur.

**Vérification** : la console du serveur montre le chargement du monde sans erreur, et un joueur peut se connecter. La
sauvegarde reste listée dans le Panel.

### 2b — L'archive n'est plus sur l'hôte : la récupérer depuis restic

```bash
# Restaurer uniquement l'archive voulue dans un répertoire temporaire (rien d'actif n'est touché)
mkdir -p "${RESTORE_DIR}"
restic restore "${SNAPSHOT_ID}" --target "${RESTORE_DIR}" \
  --include "/var/lib/pelican/backups/${BACKUP_UUID}.tar.gz"
ls -l "${RESTORE_DIR}/var/lib/pelican/backups/${BACKUP_UUID}.tar.gz"
# → le fichier existe, avec une taille plausible

# Le placer là où Wings l'attend ; le Panel peut alors le restaurer (2a)
cp -a "${RESTORE_DIR}/var/lib/pelican/backups/${BACKUP_UUID}.tar.gz" /var/lib/pelican/backups/
```

Le Panel ne liste que les sauvegardes présentes dans sa base de données. Si cette base a été perdue ou restaurée depuis
un snapshot plus ancien, l'archive peut ne pas apparaître : utiliser alors 2c.

### 2c — Solution de repli : extraire l'archive à la main

À utiliser quand la restauration par le Panel échoue ou que la sauvegarde est inconnue du Panel. Le serveur doit être
arrêté, pour que ni Wings ni le jeu n'écrivent pendant l'extraction.

1. Arrêter le serveur depuis le Panel (Stop, puis attendre l'état `Offline`).
2. Conserver une copie des données actuelles et vérifier l'archive :

   ```bash
   VOLUME=/var/lib/pelican/volumes/${SERVER_UUID}
   ls -ld "${VOLUME}"
   # → le répertoire du serveur existe ; noter son propriétaire

   tar -tzf "/var/lib/pelican/backups/${BACKUP_UUID}.tar.gz" | head
   # → une liste sans erreur ; les chemins sont relatifs à la racine du serveur

   mv "${VOLUME}" "${VOLUME}.pre-restore"
   mkdir "${VOLUME}"
   ```

3. Extraire, puis rendre les fichiers au propriétaire qu'avait le répertoire du serveur :

   ```bash
   tar -xzf "/var/lib/pelican/backups/${BACKUP_UUID}.tar.gz" -C "${VOLUME}"
   chown --reference="${VOLUME}.pre-restore" "${VOLUME}"
   chown -R --reference="${VOLUME}.pre-restore" "${VOLUME}"
   ls -ln "${VOLUME}" | head
   # → les fichiers appartiennent au même uid:gid que ${VOLUME}.pre-restore (l'utilisateur Wings, 988:988 attendu)
   ```

   Non vérifié : le propriétaire attendu `988:988` provient de `WINGS_UID` / `WINGS_GID` dans `modules/pelican.nix` ; le
   propriétaire réel des fichiers d'un répertoire de serveur n'a pas été contrôlé. C'est pourquoi les commandes copient
   le propriétaire du répertoire existant au lieu de le fixer en dur. Si le répertoire du serveur n'existait pas du
   tout, créer d'abord le serveur dans le Panel et utiliser son répertoire comme référence.

4. Démarrer le serveur depuis le Panel.

**Vérification** : le serveur atteint l'état `Running` et le monde est celui attendu (nom du niveau, dernière
construction connue).

**Retour arrière** : arrêter le serveur, puis `rm -rf "${VOLUME}" && mv "${VOLUME}.pre-restore" "${VOLUME}"`. Supprimer
`${VOLUME}.pre-restore` uniquement une fois le monde restauré confirmé.

## Étape 3 — Restaurer les données du Panel

Cette étape couvre la base SQLite, `.env` (avec `APP_KEY`) et les plugins, tous sous `/var/lib/pelican-panel/data`. Elle
s'applique quand le Panel est cassé ou a perdu sa configuration. Wings reste configuré depuis SOPS et n'est pas affecté.

> [!IMPORTANT]\
> `APP_KEY` chiffre des valeurs sensibles stockées dans la base du Panel (typiquement des jetons d'API et des secrets
> OAuth ou de plugins). Restaurer la base et le `.env` **depuis le même snapshot**. Une base restaurée avec une
> `APP_KEY` différente (ou générée à neuf) rend ces valeurs illisibles : elles doivent être saisies à nouveau. Sans la
> clé d'origine, il n'existe aucun moyen de les récupérer.

Non vérifié : la liste exacte des champs chiffrés et l'emplacement de `.env` dans `/var/lib/pelican-panel/data` ne sont
pas décrits dans ce dépôt (`modules/pelican.nix` monte ce répertoire en `/pelican-data` et définit `XDG_DATA_HOME`).
Localiser le fichier après la restauration avec `find /var/lib/pelican-panel/data -maxdepth 2 -name .env`.

1. Arrêter le Panel (et Wings, qui en dépend) pour que rien n'écrive dans la base :

   ```bash
   systemctl stop docker-pelican-wings docker-pelican-panel
   systemctl is-active docker-pelican-panel docker-pelican-wings
   # → inactive (deux fois)
   ```

2. Restaurer les données du Panel depuis le snapshot dans un répertoire temporaire :

   ```bash
   rm -rf "${RESTORE_DIR}" && mkdir -p "${RESTORE_DIR}"
   restic restore "${SNAPSHOT_ID}" --target "${RESTORE_DIR}" --include /var/lib/pelican-panel/data
   ls -la "${RESTORE_DIR}/var/lib/pelican-panel/data" "${RESTORE_DIR}/var/lib/pelican-panel/data/database"
   # → database/database.sqlite et .env sont présents
   ```

3. Remplacer le répertoire actif par le répertoire restauré, en conservant l'ancien :

   ```bash
   mv /var/lib/pelican-panel/data /var/lib/pelican-panel/data.pre-restore
   cp -a "${RESTORE_DIR}/var/lib/pelican-panel/data" /var/lib/pelican-panel/data
   chown -R 82:82 /var/lib/pelican-panel/data
   chmod 0770 /var/lib/pelican-panel/data /var/lib/pelican-panel/data/plugins /var/lib/pelican-panel/data/database

   ls -ldn /var/lib/pelican-panel/data /var/lib/pelican-panel/data/database/database.sqlite
   # → propriétaire 82 82 sur les deux (le fichier de base est en 0660 dans la règle tmpfiles)
   ```

   Les modes des répertoires reprennent les `systemd.tmpfiles.rules` de `modules/pelican.nix` (`0770` pour `data`,
   `plugins` et `database` ; `0660` pour le fichier de base). `/var/lib/pelican-panel/logs` n'est pas sauvegardé et
   reste intact.

4. Contrôler la base SQLite avant de démarrer quoi que ce soit :

   ```bash
   nix shell nixpkgs#sqlite -c sqlite3 /var/lib/pelican-panel/data/database/database.sqlite 'PRAGMA integrity_check;'
   # → ok
   ```

   > [!WARNING]\
   > restic copie la base pendant que le Panel peut tourner (le job n'est pas arrêté autour de la sauvegarde). Un
   > snapshot pris au milieu d'une écriture peut échouer à ce contrôle. Dans ce cas, refaire les étapes 2 à 4 avec le
   > snapshot précédent (`restic snapshots`).

5. Démarrer le Panel, puis Wings :

   ```bash
   systemctl start docker-pelican-panel
   systemctl start docker-pelican-wings
   systemctl is-active docker-pelican-panel docker-pelican-wings
   # → active (deux fois)
   ```

**Vérification** : `https://minecraft.chezmoi.sh` affiche la page de connexion (pas l'installeur), la connexion
fonctionne (Pocket-ID ou compte administrateur), le nœud est vert et les serveurs sont listés.

**Retour arrière** :

```bash
systemctl stop docker-pelican-wings docker-pelican-panel
rm -rf /var/lib/pelican-panel/data
mv /var/lib/pelican-panel/data.pre-restore /var/lib/pelican-panel/data
systemctl start docker-pelican-panel docker-pelican-wings
```

Supprimer `data.pre-restore` et `${RESTORE_DIR}` une fois la restauration confirmée.

## Étape 4 — Reconstruire l'hôte après la perte de la VM

L'ordre compte : la restauration doit avoir lieu **avant** que les conteneurs Pelican aient tourné sur le nouvel hôte,
et avant la première exécution de restic (04:30). Sur un hôte neuf, les conteneurs démarrent au boot, créent une base
SQLite vide et une nouvelle `APP_KEY` (installeur), puis une sauvegarde de cet état vide serait envoyée.

1. **Reprovisionner l'infrastructure.** Depuis `projects/rimbilliton.akn/src/infrastructure/pulumi`, en suivant l'étape
   1 de BOOTSTRAP.md :

   ```bash
   mise run pulumi:diff && mise run pulumi:apply
   pulumi stack output backupsBucketName
   # → le même bucket qu'avant (il est protégé et conservé) ; c'est la valeur de BUCKET
   ```

   Si l'état Pulumi lui-même est perdu, le bucket B2 contient toujours les sauvegardes. L'état de cette stack est stocké
   sur Garage (`backend` de `Pulumi.yaml`) : le restaurer ou importer le bucket existant comme décrit dans
   `docs/procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md`, puis créer une
   nouvelle clé d'application B2 limitée à ce bucket (`restic_b2_env`). Ne pas laisser Pulumi créer un second bucket.

2. **Réinstaller NixOS** avec les étapes 3 et 4 de BOOTSTRAP.md (clé d'hôte, fichier SOPS, `nixos-anywhere` via
   `nonix`). Conserver le même `restic_password` qu'avant : une nouvelle valeur ne peut pas ouvrir le dépôt existant.

   sops-nix déchiffre avec la clé SSH de l'hôte. Si une nouvelle clé d'hôte est générée (étape 3 de BOOTSTRAP), sa clé
   age doit être destinataire de `secrets/rimbilliton.sops.yaml` : remplacer l'ancienne clé d'hôte dans
   `projects/rimbilliton.akn/src/infrastructure/nixos/.sops.yaml`, puis exécuter `sops updatekeys` sur le fichier avant
   l'installation. Réutiliser l'ancienne `extra/etc/ssh/ssh_host_ed25519_key`, si elle est encore disponible, évite
   cette opération.

3. **Arrêter tout ce qui concerne Pelican, ainsi que le job de sauvegarde**, dès que l'hôte est joignable par Tailscale
   :

   ```bash
   ssh root@"${HOST}" 'systemctl stop docker-pelican-wings docker-pelican-panel restic-backups-minecraft.timer'
   ssh root@"${HOST}" 'systemctl is-active docker-pelican-panel docker-pelican-wings restic-backups-minecraft.timer'
   # → inactive (trois fois)
   ```

   Wings n'a pas encore de configuration de nœud valide et redémarre en boucle jusqu'à l'étape 4.6, ce qui est attendu.

4. **Restaurer depuis restic.** Sur l'hôte (`ssh root@"${HOST}"`), définir l'environnement puis exécuter :

   ```bash
   export RESTIC_REPOSITORY="s3:${B2_ENDPOINT}/${BUCKET}/restic"
   export RESTIC_PASSWORD_FILE=/run/secrets/restic_password
   set -a; . /run/secrets/restic_b2_env; set +a
   restic snapshots
   # → les snapshots de l'ancien hôte (le nom d'hôte est le même, ils sont donc listés ensemble)
   ```

   Restaurer ensuite les deux chemins depuis le snapshot choisi, en remplaçant ce que l'installation neuve a créé :

   ```bash
   rm -rf "${RESTORE_DIR}" && mkdir -p "${RESTORE_DIR}"
   restic restore "${SNAPSHOT_ID}" --target "${RESTORE_DIR}"

   rm -rf /var/lib/pelican-panel/data
   cp -a "${RESTORE_DIR}/var/lib/pelican-panel/data" /var/lib/pelican-panel/data
   chown -R 82:82 /var/lib/pelican-panel/data
   cp -a "${RESTORE_DIR}/var/lib/pelican/backups/." /var/lib/pelican/backups/

   nix shell nixpkgs#sqlite -c sqlite3 /var/lib/pelican-panel/data/database/database.sqlite 'PRAGMA integrity_check;'
   # → ok

   ls /var/lib/pelican/backups | head
   # → les archives <uuid de la sauvegarde>.tar.gz
   ```

   Appliquer aussi les précisions de permissions de l'étape 3 (modes, contrôle des propriétaires).

5. **Identifiants Wings.** Les trois valeurs `wings_uuid`, `wings_token_id` et `wings_token` appartiennent au nœud
   enregistré dans la base restaurée. Elles ne sont pas dans les sauvegardes restic : elles se trouvent dans
   `secrets/rimbilliton.sops.yaml` (dans Git).
   - Si ce fichier les contient encore, elles sont déjà en place : rien à faire.
   - Si elles sont perdues, démarrer le Panel seul (`systemctl start docker-pelican-panel`), se connecter, ouvrir
     l'onglet Configuration du nœud, réinitialiser le jeton si nécessaire, et copier uniquement `uuid`, `token_id` et
     `token` :

     ```bash
     cd projects/rimbilliton.akn/src/infrastructure/nixos
     sops secrets/rimbilliton.sops.yaml   # renseigner wings_uuid, wings_token_id, wings_token
     mise run nixos:oci:update
     # → le switch réussit (même tâche que l'étape 6.4 de BOOTSTRAP.md)
     ```

6. **Démarrer les services et réactiver le timer de sauvegarde** :

   ```bash
   ssh root@"${HOST}" 'systemctl start docker-pelican-panel docker-pelican-wings restic-backups-minecraft.timer'
   ssh root@"${HOST}" 'systemctl is-active docker-pelican-panel docker-pelican-wings restic-backups-minecraft.timer'
   # → active (trois fois)
   ```

7. **Contrôler dans le Panel** : le nœud est vert, les serveurs sont listés et leur onglet Backups liste les archives.
   Restaurer ensuite chaque monde avec l'étape 2 (les volumes actifs n'étaient pas sauvegardés, voir le tableau
   ci-dessous).

**Vérification** : tous les contrôles ci-dessus, et `restic snapshots` après la prochaine exécution de 04:30 montre un
nouveau snapshot contenant les données restaurées.

### Ce qui ne figure pas dans les sauvegardes restic

| Élément                                                                             | Origine                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wings `config.yml` et jeton du nœud (`wings_uuid`, `wings_token_id`, `wings_token`) | Fichier SOPS dans Git (`secrets/rimbilliton.sops.yaml`), rendu par sops-nix ; ou réinitialisation depuis le Panel (étape 4.5)                                                                      |
| `restic_password`, `restic_b2_env`, `tailscale_authkey`                             | Fichier SOPS dans Git ; le mot de passe restic aussi dans OpenBao (copie à tenir à jour, voir l'avertissement du cadre technique) ; clé B2 depuis les sorties Pulumi                               |
| Volumes actifs des serveurs `/var/lib/pelican/volumes`                              | Non sauvegardés. Seules les archives Wings le sont : restaurer chaque monde avec l'étape 2. Tout ce qui est plus récent que la dernière archive est perdu                                          |
| Logs du Panel `/var/lib/pelican-panel/logs`                                         | Non sauvegardés, inutiles                                                                                                                                                                          |
| Groupe Pocket-ID `minecraft` et client OIDC `Minecraft`                             | Gérés par la stack Pulumi (`stack/pocket-id.ts`) et existants dans Pocket-ID, hors de cet hôte : ils survivent à la perte de la VM (étape 2 de BOOTSTRAP.md)                                       |
| Plugin Pocket-ID et paramètres de connexion                                         | Déclarés dans NixOS : le plugin est récupéré par Nix et installé par `pelican-plugins`, l'identifiant et le secret du client sont les secrets SOPS `oauth_pocketid_*` (dans Git). Rien à restaurer |

Le plugin et ses paramètres OAuth sont rendus depuis NixOS et SOPS, pas depuis la base du Panel. Après la restauration,
démarrer `pelican-plugins` (`systemctl restart pelican-plugins`) si Settings > OAuth n'affiche pas Pocket ID. Si le
client Pocket-ID a dû être recréé, mettre à jour les secrets `oauth_pocketid_*` et son URL de callback comme à l'étape 2
de BOOTSTRAP.md.

## Étape 5 — Tester la restauration

Une sauvegarde jamais restaurée reste une hypothèse. Chaque trimestre, et après toute modification de `backup.nix`, des
tags d'image Pelican ou de la clé B2, exécuter sur l'hôte :

```bash
# 1. Le job tourne et le dépôt est cohérent
systemctl status restic-backups-minecraft.timer --no-pager
restic snapshots --latest 3
restic check
# → le timer est actif, le dernier snapshot est récent, "no errors were found"

# 2. Restaurer les données du Panel et l'archive la plus récente dans un répertoire temporaire, jamais par-dessus les chemins actifs
rm -rf "${RESTORE_DIR}" && mkdir -p "${RESTORE_DIR}"
restic restore latest --target "${RESTORE_DIR}"
nix shell nixpkgs#sqlite -c sqlite3 "${RESTORE_DIR}/var/lib/pelican-panel/data/database/database.sqlite" 'PRAGMA integrity_check;'
# → ok
LAST=$(ls -t "${RESTORE_DIR}"/var/lib/pelican/backups/*.tar.gz | head -1)
tar -tzf "${LAST}" > /dev/null && echo "archive OK"
# → archive OK
rm -rf "${RESTORE_DIR}"
```

À contrôler en plus des commandes :

- `.env` existe dans les données restaurées du Panel et contient une ligne `APP_KEY` (vérifier que la ligne existe, sans
  afficher sa valeur).
- L'archive la plus récente de l'onglet Backups du Panel correspond à un fichier de la restauration.
- Une fois par an, effectuer une vraie restauration de monde (étape 2c) sur un serveur jetable, et confirmer que le mot
  de passe restic est récupérable depuis OpenBao sans la VM.

## Vérifications rapides

- **Dépôt joignable** : `restic snapshots` — liste les snapshots avec les deux chemins.
- **Dépôt sain** : `restic check` — `no errors were found`.
- **Base du Panel** : `sqlite3 /var/lib/pelican-panel/data/database/database.sqlite 'PRAGMA integrity_check;'` — `ok`.
- **Propriétaires** : `ls -ldn /var/lib/pelican-panel/data` — `82 82`.
- **Services** : `systemctl is-active docker-pelican-panel docker-pelican-wings` — `active` deux fois.
- **Nœud et serveurs** : Panel > Admin > Nodes — nœud vert ; serveurs et sauvegardes listés.

## Problèmes connus

| Symptôme                                                             | Cause et correctif                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrong password or no key found`                                     | Le fichier de mot de passe ne correspond pas au dépôt. Utiliser la copie d'OpenBao. Si elle est perdue, les sauvegardes sont irrécupérables                |
| `Fatal: unable to open config file ... 401` / `403` / `AccessDenied` | Clé B2 erronée ou révoquée. Relire `backupsKeyId` / `backupsKeySecret` depuis Pulumi (la clé doit être limitée à ce bucket)                                |
| `Fatal: repository does not exist`, ou `NoSuchBucket`                | `BUCKET` ou `B2_ENDPOINT` erroné. Comparer avec `pulumi stack output backupsBucketName` et `modules/backup.nix`                                            |
| `unable to create lock` / `repository is already locked`             | Une sauvegarde ou un prune est en cours (`systemctl status restic-backups-minecraft`). Attendre. N'utiliser `restic unlock` que si aucun job ne tourne     |
| Le Panel affiche l'installeur après une restauration                 | Les données restaurées ont été écrasées par une installation neuve ou sont au mauvais endroit. Refaire l'étape 3, vérifier `data/database/database.sqlite` |
| Erreur `500` ou échec de connexion après la restauration du Panel    | `.env` / `APP_KEY` et base viennent de snapshots différents, ou les propriétaires ne sont pas `82:82`. Refaire l'étape 3 depuis un seul snapshot           |
| `PRAGMA integrity_check` ne renvoie pas `ok`                         | Le snapshot a capturé la base en cours d'écriture. Restaurer le snapshot précédent                                                                         |
| Le nœud reste rouge, Wings redémarre en boucle                       | Les trois valeurs Wings sont absentes ou périmées dans SOPS. Réinitialiser le jeton dans le Panel, mettre à jour SOPS, `nixos-rebuild switch` (étape 4.5)  |
| Sauvegarde listée dans le Panel mais la restauration échoue          | L'archive est absente de `/var/lib/pelican/backups`. La récupérer avec l'étape 2b                                                                          |
| Données du serveur non modifiables après une extraction manuelle     | Mauvais propriétaire. Relancer les commandes `chown --reference` de l'étape 2c                                                                             |
| `command not found: restic` ou `restic-minecraft`                    | Utiliser `nix shell nixpkgs#restic -c restic ...` avec les variables explicites de l'étape 1                                                               |

## Historique

- _2026-10-17_ : Reprise après revue : l'état de vérification devient un callout `CAUTION` qui dit que la procédure n'a
  jamais été testée, et les callouts `CAUTION` et `IMPORTANT` sont mis en forme pour que GitHub les affiche.
- _2026-10-11_ : Migration vers le standard de documentation (rédaction en français, sections du gabarit de procédure).
  Correction : la référence à la tâche `mise run nixos:oci:update` pointait vers l'étape 6.3 de BOOTSTRAP.md, alors que
  la configuration du nœud et cette commande se trouvent à l'étape 6.4 (« Node »). Précision : la copie du mot de passe
  restic dans OpenBao est une consigne de `secrets/rimbilliton.example.yaml` et non un fait vérifiable dans le dépôt ;
  le groupe et le client Pocket-ID sont désormais décrits comme gérés par la stack Pulumi (`stack/pocket-id.ts`,
  BOOTSTRAP.md étape 2) et non comme « créés à la main » ; le placeholder `bucket` de `modules/backup.nix` est signalé ;
  la perte de l'état Pulumi renvoie à Garage (`backend` de `Pulumi.yaml`).
- _2026-10-05_ : Version initiale.

## Pour aller plus loin

- [BOOTSTRAP de rimbilliton.akn](../../../projects/rimbilliton.akn/docs/BOOTSTRAP.md) : provisionnement, clé d'hôte,
  installation de NixOS et configuration du nœud Wings.
- [Pulumi : état sur Garage et import](../infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
  : récupération de l'état d'une stack et import de ressources existantes.
- [Documentation restic : restaurer une sauvegarde](https://restic.readthedocs.io/en/stable/050_restore.html) : options
  de `restic restore` utilisées aux étapes 2 à 4.
