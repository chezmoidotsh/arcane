# Initialiser Exusiai

Ce guide monte l'hôte Minecraft de `exusiai.akn` depuis rien jusqu'à un NixOS qui exécute
Pelican (Panel et Wings), avec l'authentification Pocket-Id et des sauvegardes restic vers Backblaze B2. Il couvre le
provisionnement Pulumi, l'installation de NixOS avec `nixos-anywhere` et la configuration de Pelican.

> [!WARNING]\
> Vérifié contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées pour cette migration.

> [!NOTE]\
> L'hôte a été renommé sur place, sans réinstallation : voir la
> [migration vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md). Le `dnsLabel` du VCN, le nom du
> bucket B2 et la description de la clé Tailscale gardent l'ancien nom, car les changer remplacerait la ressource.

## Vue d'ensemble

La stack Pulumi de `pulumi/` provisionne les ressources OCI (compartiment, VCN, sous-réseau, NSG, instance), les
enregistrements DNS, le bucket B2, la clé Tailscale ainsi que le groupe `minecraft`, le client OIDC et le secret du
client dans Pocket-Id (`stack/access/pocket-id.ts`). L'instance démarre sur une image Ubuntu standard, avec uniquement une clé
SSH injectée par cloud-init (configuration Pulumi `ssh_authorized_keys`). NixOS est ensuite installé par-dessus avec
`nixos-anywhere`, la seule étape manuelle. Le guide jumeau [Initialiser Kazimierz](Initialiser-Kazimierz.md) suit le
même schéma pour le VPS `kazimierz.akn`.

Le flake NixOS vit dans `fleet/hosts/akn.exusiai/nix/` : `flake.nix` expose une sortie par architecture
(`exusiai-akn-aarch64` pour l'OCI A1, `exusiai-akn-x86_64` pour un test), `configuration.nix` porte la base (réseau,
SSH, Tailscale, sops-nix), et les modules `pelican.nix`, `caddy.nix` et `backup.nix` apportent Pelican (Panel et Wings
en conteneurs, versions bêta épinglées), Caddy (TLS devant le Panel `minecraft.chezmoi.sh` et Wings
`main.minecraft.chezmoi.sh`) et les sauvegardes restic.

## Avant de commencer

- **Outils** : `mise install` (fournit `sops`) et Nix, exécuté en natif (`nix run`), y compris pour `ssh-to-age`.
- **Identifiants** : OCI (`TF_VAR_tenancy_ocid`, `TF_VAR_user_ocid`, `TF_VAR_fingerprint`, `TF_VAR_private_key`,
  `TF_VAR_region`), Backblaze, Cloudflare, Tailscale et Pocket-Id, déclarés dans `fleet/hosts/akn.exusiai/.fnox.toml` et
  résolus par fnox depuis Bitwarden Secrets Manager (`mise run bws:setup`, puis la commande `pulumi` passe par fnox). Les
  secrets Bitwarden correspondants doivent exister : un secret manquant fait échouer la commande.
- **ACL Tailscale** : `tag:svc-minecraft` déclaré dans `tagOwners` (tag annoncé par l'hôte dans `configuration.nix` et
  posé sur la clé par `stack/access/tailscale.ts`).
- **Stack parente** : `chezmoi_sh.live` déjà appliquée. Elle crée le compartiment parent `chezmoi.sh` et le groupe
  Pocket-Id `admin`, que cette stack retrouve par leur nom (`stack/platform/oci-compartment.ts`,
  `stack/access/pocket-id.ts`) au lieu de lire ses sorties.
- **Pocket-Id** : une clé d'API pour le provider Pulumi (voir l'étape 2) ; le groupe et le client sont gérés par Pulumi.

## Procédure d'amorçage

### 1. Provisionner l'infrastructure

```sh
cd fleet/hosts/akn.exusiai/pulumi
pnpm install
pulumi stack init exusiai_akn.live   # puis définir la configuration ci-dessous
pulumi preview && pulumi up
```

Configuration Pulumi (`pulumi config set <clé> <valeur>`, avec `--secret` pour les valeurs secrètes) :

| Clé                   | Secret | Valeur                                                       |
| --------------------- | ------ | ------------------------------------------------------------ |
| `oci:region`          | non    | `eu-paris-1`                                                 |
| `ssh_authorized_keys` | non    | clé publique utilisée pour le premier accès SSH              |
| `cloudflare_zone_id`  | oui    | identifiant de la zone, depuis le tableau de bord Cloudflare |
| `pocket-id:baseUrl`   | non    | `https://auth.chezmoi.sh`                                    |
| `tailscale:tailnet`   | oui    | nom du tailnet                                               |

Si OCI répond `Out of host capacity`, réessayer plus tard (limite connue des instances Always Free A1).

### 2. Groupe et client OIDC Pocket-Id

`stack/access/pocket-id.ts` déclare le groupe `minecraft` et le client OIDC `Minecraft` (callback
`https://minecraft.chezmoi.sh/auth/oauth/callback/pocketid`, confidentiel, **PKCE désactivé** car le plugin Pocket ID de
Pelican n'envoie pas de `code_challenge`, groupes autorisés `admin` et `minecraft`). Pelican authentifie les
utilisateurs par ce client (plugin installé par NixOS, étape 6).

Le groupe et le client existent déjà dans Pocket-Id (créés à la main avant cette stack) et sont maintenant dans le
state de la stack. L'UUID du client est une entrée (`clientId`) de `stack/access/pocket-id.ts` : sans elle, Pulumi
remplacerait le client par un autre, avec un nouvel identifiant. Le secret du client est généré par une ressource
`OidcClientSecret` et écrit dans `secrets/exusiai.sops.json`.

Premier `pulumi up` (à exécuter une fois, par un humain) :

```sh
pulumi preview   # POCKET_ID_API_KEY vient de fnox (secret Bitwarden pulumi-pocket-id-api-key)
```

L'aperçu doit afficher le groupe et le client sans changement, avec au plus des mises à jour en place
de champs cosmétiques, plus la **création** de `minecraft-secret`. Si l'aperçu affiche une création (`create`) ou un
remplacement (`replace`) du client ou du groupe, s'arrêter : un UUID ou un champ est faux. Sinon :

1. Exécuter `pulumi up`. Le nouveau secret **remplace** l'ancien dans Pocket-Id ; si Pelican tourne déjà, sa
   connexion est cassée à partir de cet instant.
2. `pulumi up` a réécrit `secrets/exusiai.sops.json` avec le nouveau secret (étape 3). Si l'hôte tourne déjà, le redéployer avec `mise run nixos:oci:update` ;
   lors d'un premier amorçage, l'installation (étape 4) reprend le secret.
3. Une fois Pelican démarré, vérifier que la connexion à `https://minecraft.chezmoi.sh/` avec Pocket-Id fonctionne.

Installation initiale (rien n'existe encore dans Pocket-Id) : créer le groupe et le client à la main dans l'interface
avec les valeurs ci-dessus, renseigner l'UUID du client dans `minecraftClientUuid` de `stack/access/pocket-id.ts`, importer le groupe et le client dans le state (`pulumi import`), puis suivre la même procédure.

### 3. Préparer la clé d'hôte et les secrets

sops-nix déchiffre les secrets avec la clé SSH de l'hôte, qui doit donc exister avant le premier démarrage :

```sh
cd ../nixos
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
nix run nixpkgs#ssh-to-age -- -i extra/etc/ssh/ssh_host_ed25519_key.pub   # clé age de l'hôte, déjà dans la règle de .sops.yaml

cp secrets/manual.example.yaml secrets/manual.sops.yaml   # restic_password (et wings_* plus tard)
sops --encrypt --in-place secrets/manual.sops.yaml
```

`secrets/exusiai.sops.json` (clé Tailscale, identifiants B2, client Pocket-Id) est écrit par `pulumi up` : rien à
renseigner. Dans `manual.sops.yaml`, ne mettre que `restic_password` ; les trois valeurs `wings_*` n'existent qu'une
fois le nœud créé dans le Panel (étape 6), donc les ajouter à ce moment-là. La clé Tailscale (`tailscaleAuthKey`) est à
usage unique et expire 7 jours après sa création (`stack/access/tailscale.ts`) : installer l'hôte dans ce délai.

Les deux fichiers sont ciblés par la règle de `nix/.sops.yaml` (clé de l'administrateur et clé de l'hôte comme destinataires) et lus par
`configuration.nix` et les modules. Exécuter sops depuis ce répertoire, car il cherche `.sops.yaml` vers le haut sans jamais fusionner
les fichiers, et conserver la clé de l'administrateur dans toute nouvelle règle. `secrets/*.yaml` est ignoré par Git,
sauf `*.example.yaml` et `*.sops.yaml`.

`flake.lock` est versionné pour que chaque build utilise les mêmes révisions d'entrées (le rafraîchir avec
`nix flake update`). Ensuite :

- vérifier les tags d'image Pelican dans `modules/pelican.nix` (le Panel et Wings sont des bêtas à mettre à jour
  ensemble) ;
- ajouter la clé publique SSH de l'administrateur dans `configuration.nix` (`users.users.root.openssh.authorizedKeys`).

Ne pas committer `extra/`.

> [!NOTE]\
> Le dépôt restic (`restic_repository`) est écrit par Pulumi dans `secrets/exusiai.sops.json` avec le nom du bucket :
> il n'y a rien à renseigner à la main dans `modules/backup.nix`.

### 4. Installer NixOS

SSH est fermé dans le groupe de sécurité réseau (NSG) d'OCI : exécuter temporairement
`pulumi config set unsecure true && pulumi up`, puis remettre la valeur à `false` (et appliquer de nouveau) une fois
NixOS installé.

L'instance exécute encore l'image Ubuntu d'origine, qui n'a pas `cpio` ; `nixos-anywhere` en a besoin pour construire
l'initrd kexec (`aborted: no cpio command found`). L'installer d'abord, depuis un shell qui atteint l'agent SSH :

```sh
export IP=$(pulumi -C ../pulumi stack output publicIp)
ssh ubuntu@"$IP" 'sudo apt-get update -qq && sudo apt-get install -y cpio'
```

`nixos-anywhere` utilise l'agent SSH de la session. Cet agent doit contenir la clé privée correspondant à `ssh_authorized_keys` de la configuration Pulumi, que cloud-init installe pour
l'utilisateur `ubuntu` :

```sh
mise run nixos:oci:install ubuntu@"$IP"
```

La tâche lance `nixos-anywhere` (épinglé par commit) avec
`--flake .#exusiai-akn-aarch64 --extra-files extra --kexec-extra-flags --kexec-syscall`. Elle **repartitionne le volume
de démarrage**.

`nixos-anywhere` ne détecte pas l'architecture de la cible : le flake expose donc une sortie par architecture
(`platforms/`). `.#exusiai-akn-aarch64` correspond à l'OCI A1 (UEFI, production) et `.#exusiai-akn-x86_64` à une VM
x86_64 en BIOS legacy. Il n'existe pas de sortie sans suffixe. Pour répéter l'installation sur une VM de test Proxmox
KVM :

```sh
mise run nixos:e2e <utilisateur@hôte>   # la cible est obligatoire
```

`--kexec-extra-flags '--kexec-syscall'` force l'appel système historique `kexec_load` : avec `kexec_file_load` (valeur
par défaut), le noyau arm64 d'Oracle échoue avec `kexec_file_load failed: Address not available`.

Si l'exécution échoue après l'étape kexec, l'instance n'est plus Ubuntu : elle exécute déjà l'installeur NixOS, où seul
`root` existe (`ubuntu@` répond alors `Permission denied` ou demande un mot de passe). Ne pas recommencer : reprendre à
l'étape disque, en `root` :

```sh
nix run github:nix-community/nixos-anywhere -- --flake .#exusiai-akn-aarch64 \
  --extra-files extra --phases disko,install,reboot --target-host root@"$IP"
```

Un flake ne voit que les fichiers connus de Git : si le build signale un chemin non suivi, exécuter
`git add -N flake.lock secrets/manual.sops.yaml secrets/exusiai.sops.json`.

### Dépanner l'installation

| Symptôme                                                                            | Cause et correction                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Permission denied (publickey)`, `Identity file ... not accessible`                 | L'agent SSH n'a pas la clé de `ssh_authorized_keys`. Vérifier avec `ssh-add -l` (voir ci-dessus)                                                                                                                                                                                                  |
| `Connection closed by <ip> port 22`                                                 | sshd ralentit après des échecs répétés. Corriger la cause, attendre une à deux minutes, réessayer                                                                                                                                                                                                 |
| `no cpio command found, but required to build the new initrd`                       | Installer `cpio` sur l'instance (voir ci-dessus)                                                                                                                                                                                                                                                  |
| `pulumi preview` planifie le remplacement de `TailnetKey` (`exusiai-tailscale-key`) | La clé de premier démarrage expire 7 jours après sa création (`expiry` dans `stack/access/tailscale.ts`). Sans danger pour un hôte déjà dans le tailnet : le remplacement réécrit `tailscale_authkey` dans `secrets/exusiai.sops.json`. Pour couper le bruit, ajouter `ignoreChanges: ["expiry"]` |
| `kexec_file_load failed: Address not available`                                     | Utiliser `mise run nixos:oci:install`, qui passe `--kexec-syscall` (voir ci-dessus)                                                                                                                                                                                                               |
| `ubuntu@...` demande un mot de passe après un échec                                 | Le kexec a déjà eu lieu : l'hôte est l'installeur NixOS. Reprendre avec `root@` et `--phases disko,install,reboot`                                                                                                                                                                                |

### 5. Vérifier le déploiement

```sh
tailscale status | grep exusiai-akn                    # l'hôte a rejoint le tailnet
ssh root@exusiai-akn systemctl status docker-pelican-panel docker-pelican-wings caddy
```

Ouvrir `https://minecraft.chezmoi.sh` : l'installeur web de Pelican doit apparaître. Wings reste arrêté (en redémarrage
continu) jusqu'à l'étape 6, qui lui donne une configuration.

### 6. Configurer Pelican

1. **Panel** : terminer l'installeur web sur `https://minecraft.chezmoi.sh/installer` et créer le compte administrateur.
   La base est une base SQLite dans `/var/lib/pelican-panel/data` (à sauvegarder : elle contient l'`APP_KEY`).
2. **Connexion Pocket-Id** (déclarée dans `modules/pelican.nix`) : le plugin communautaire
   [Pocket ID Provider](https://hub.pelican.dev/plugins/pocketid-provider) est téléchargé par Nix à une version
   épinglée, copié dans le répertoire de plugins du Panel et enregistré par l'unité `pelican-plugins`. Les paramètres du
   fournisseur (`OAUTH_POCKETID_*`) sont des variables d'environnement du conteneur, l'identifiant et le secret du
   client venant de SOPS. Le plugin ne pouvant être enregistré qu'après l'installeur web, démarrer l'unité après le
   point 1, puis vérifier Paramètres > OAuth et l'onglet OAuth du profil, où lier son propre compte :

   ```sh
   ssh root@exusiai-akn 'systemctl restart pelican-plugins; journalctl -u pelican-plugins --no-pager -n 20'
   ```

   Le journal doit afficher `Plugin installed and enabled.` la première fois, puis `Plugin is already installed!`
   ensuite. Pour mettre le plugin à jour, changer l'URL de la release et son hash dans `modules/pelican.nix`.

3. **Rôles** (déclarés dans `modules/pelican.nix`) : l'unité `pelican-roles` crée le rôle `Full Admin` (toutes les
   permissions connues du Panel). L'attribuer aux utilisateurs dans la zone d'administration (Utilisateurs, champ Rôles)
   ; `Root Admin` reste intégré et n'est pas géré par NixOS. Comme le plugin, l'unité exige que l'installeur web ait
   déjà tourné :

   ```sh
   ssh root@exusiai-akn 'systemctl restart pelican-roles; journalctl -u pelican-roles --no-pager -n 10'
   ```

   **Serveurs créés par les utilisateurs** : le plugin officiel `user-creatable-servers` est installé de la même façon
   (unité `pelican-plugins`) et ajoute une action « créer un serveur » à la liste des serveurs de chaque utilisateur.
   Les nœuds concernés doivent porter le tag `user_creatable_servers` (champ Tags du nœud), et un administrateur fixe
   pour chaque utilisateur les limites de CPU, de mémoire, de disque et de serveurs. Par serveur, le module plafonne les
   allocations à 1 et les sauvegardes à 2 (`UCS_DEFAULT_*` dans `modules/pelican.nix`).

4. **Nœud** : dans la zone d'administration, créer un nœud pour cet hôte.
   - FQDN `main.minecraft.chezmoi.sh`, port 443, « Behind Proxy » activé (Caddy termine le TLS)
   - mémoire et disque limités (environ 4096 MiB et 30000 MiB), CPU 100 %, répertoire de base du démon
     `/var/lib/pelican/volumes`
   - tag `user_creatable_servers` (Paramètres avancés, Tags) pour que les utilisateurs puissent y créer des serveurs
   - depuis l'onglet Configuration du nœud, copier uniquement `uuid`, `token_id` et `token` dans le fichier SOPS : le
     reste du `config.yml` de Wings est déclaré dans `modules/pelican.nix` et rendu par sops-nix

   ```sh
   cd fleet/hosts/akn.exusiai/nix
   sops secrets/manual.sops.yaml   # ajouter wings_uuid, wings_token_id, wings_token (voir secrets/manual.example.yaml)
   mise run nixos:oci:update
   ```

   Le nœud doit passer au vert. Pour renouveler le token, le réinitialiser dans le Panel et mettre à jour les trois
   valeurs.

5. **Allocations** : déclarées dans `modules/pelican.nix` (`allocations` : les 16 ports de jeu `25565-25580` sur
   `0.0.0.0`, avec l'alias `minecraft.chezmoi.sh` pour que le Panel affiche le nom DNS aux joueurs). Une fois le nœud
   créé, les appliquer avec `systemctl restart pelican-allocations; journalctl -u pelican-allocations --no-pager -n 10`.
   L'opération est idempotente. La même plage est ouverte dans le NSG d'OCI et dans le pare-feu de l'hôte : garder les
   trois synchronisées. Chaque serveur consomme une allocation.

Le `config.yml` de Wings est rendu au démarrage à partir des secrets SOPS (monté depuis `/run/secrets/rendered`, jamais
écrit en clair sur le disque). Le token du nœud vit dans le fichier SOPS, pas dans les sauvegardes des données du Panel.

## Après l'amorçage

1. **Premier serveur** : créer un serveur Minecraft (Paper, Fabric, ...) depuis le Panel sur une allocation, régler sa
   limite de mémoire (la VM a 1 OCPU et 6 Go : environ 4 Go de heap Java au total, ce qui convient à quelques joueurs,
   pas à de gros modpacks) et planifier une sauvegarde toutes les 6 heures (en garder 3) pour que restic envoie des
   archives cohérentes.
2. **Donner un serveur à quelqu'un** : ajouter l'utilisateur au groupe `minecraft` dans l'interface Pocket-Id, le
   laisser se connecter une fois (Pelican crée son compte), puis lui donner un rôle qui permet de créer et gérer des
   serveurs. Au plus 16 serveurs peuvent tourner en même temps, un par allocation.
3. **Sauvegardes** : exécuter `systemctl start restic-backups-minecraft`, puis contrôler le snapshot avec
   `restic snapshots` sur le dépôt B2. Pour restaurer depuis ces sauvegardes, voir
   [BKP-20261005-00](../procedures/backups/BKP-20261005-00-Restaurer-Minecraft-depuis-Restic.md).

Les changements ultérieurs se déploient par Tailscale avec `mise run nixos:oci:update`, qui exécute
`nixos-rebuild switch --flake .#exusiai-akn-aarch64 --target-host root@exusiai-akn` via `nix run`. Il n'y a pas de mise à
jour automatique, volontairement : l'instance n'est pas encore supervisée et un retour arrière propre est difficile
(voir [ADR-008](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md), qui traite de `kazimierz.akn` et
s'applique ici aussi, et [ADR-016](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md)).

## Historique

- _2026-10-11_ : migration du guide `projects/rimbilliton.akn/docs/BOOTSTRAP.md` vers `docs/guides/`, traduit en
  français et confronté au dépôt. Corrections : tag Tailscale `tag:svc-minecraft` (et non `tag:minecraft`),
  configuration Pulumi sans `cloudflare_account_id` (jamais lu) et avec `pocket-id:baseUrl`, clés SOPS nommées
  (`restic_password`, `restic_b2_env`), durée de vie de la clé Tailscale (usage unique, 7 jours) et placeholder
  `REPLACE_WITH_PULUMI_OUTPUT_backupsBucketName` de `modules/backup.nix` signalés. La clé `oauth2_proxy_env` du fichier
  SOPS, que plus aucun module ne lit, n'est pas mentionnée, et le guide suit `stack/pocket-id.ts` (client géré par
  import) plutôt que le commentaire de `secrets/manual.example.yaml`.

- _2026-11-15_ : chemins du flake et de la stack déplacés sous `fleet/hosts/akn.exusiai/` (`nix/`, `pulumi/`), sorties
  du flake `exusiai-akn-*`, nom d'hôte et projet Pulumi `exusiai-akn` (étape 7, tour B de la migration vers la flotte).

## Pour aller plus loin

- [README de exusiai.akn](../../fleet/hosts/akn.exusiai/README.md) : architecture et vue d'ensemble du projet.
- [Restaurer Minecraft depuis restic](../procedures/backups/BKP-20261005-00-Restaurer-Minecraft-depuis-Restic.md) :
  reconstruire l'hôte ou restaurer un monde depuis B2.
- [Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
  : le backend S3 de la stack et l'import de ressources existantes.
- [Initialiser Kazimierz](Initialiser-Kazimierz.md) : le même schéma d'installation NixOS pour le VPS `kazimierz.akn`.
