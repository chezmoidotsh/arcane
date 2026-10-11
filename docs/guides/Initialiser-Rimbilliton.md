# Initialiser Rimbilliton

Monter l'hôte Minecraft de `rimbilliton.akn` depuis rien jusqu'à un NixOS qui exécute Pelican (Panel et Wings), avec
l'authentification Pocket-Id et des sauvegardes restic vers Backblaze B2. Le guide couvre le provisionnement Pulumi,
l'installation de NixOS avec `nixos-anywhere` et la configuration de Pelican.

Vérifié contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées pour cette migration.

## Vue d'ensemble

La stack Pulumi de `src/infrastructure/pulumi/` provisionne les ressources OCI (compartiment, VCN, sous-réseau, NSG,
instance), les enregistrements DNS, le bucket B2, la clé Tailscale ainsi que le groupe `minecraft`, le client OIDC et le
secret du client dans Pocket-Id (`stack/pocket-id.ts`). L'instance démarre sur une image Ubuntu standard, avec
uniquement une clé SSH injectée par cloud-init (configuration Pulumi `ssh_authorized_keys`). NixOS est ensuite installé
par-dessus avec `nixos-anywhere`, la seule étape manuelle. Le guide jumeau
[Initialiser Kazimierz](Initialiser-Kazimierz.md) suit le même schéma pour le VPS `kazimierz.akn`.

Composants définis dans `projects/rimbilliton.akn/src/infrastructure/nixos/` :

| Fichier               | Rôle                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `flake.nix`           | Une sortie par architecture : `rimbilliton-akn-aarch64` (OCI A1) et `rimbilliton-akn-x86_64` (test) |
| `configuration.nix`   | Réseau, SSH, Tailscale, sops-nix                                                                    |
| `platforms/`          | Chargeur de démarrage et disque par plateforme (`oci.a1.nix`, `proxmox.kvm.nix`)                    |
| `modules/pelican.nix` | Pelican Panel et Wings en conteneurs Docker (versions bêta épinglées)                               |
| `modules/caddy.nix`   | Caddy (TLS) devant le Panel (`minecraft.chezmoi.sh`) et Wings (`main.minecraft.chezmoi.sh`)         |
| `modules/backup.nix`  | Sauvegardes restic vers Backblaze B2                                                                |

## Avant de commencer

| Prérequis     | Détail                                                                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outils        | `mise install` (fournit `sops`) et Docker. Nix n'est pas installé en local : toute commande Nix passe par `nonix` (`scripts/nonix`, dans le `PATH` après `mise install`), qui l'exécute dans un conteneur, y compris `ssh-to-age`                                                              |
| Identifiants  | OCI sous la forme `TF_VAR_tenancy_ocid`, `TF_VAR_user_ocid`, `TF_VAR_fingerprint`, `TF_VAR_private_key` et `TF_VAR_region` (variables lues par `src/infrastructure/pulumi/.mise/env.yaml`, comme pour `kazimierz.akn`), puis les identifiants des providers Backblaze, Cloudflare et Tailscale |
| ACL Tailscale | `tag:svc-minecraft` déclaré dans `tagOwners` (tag annoncé par l'hôte dans `configuration.nix` et posé sur la clé par `stack/tailscale.ts`)                                                                                                                                                     |
| Stack parente | `kazimierz_akn.live` (compartiment parent, lu par `stack/oci/compartments.ts`) déjà appliquée                                                                                                                                                                                                  |
| Pocket-Id     | Une clé d'API pour le provider Pulumi (voir l'étape 2) ; le groupe et le client sont gérés par Pulumi                                                                                                                                                                                          |

## Procédure d'amorçage

### 1. Provisionner l'infrastructure

```sh
cd projects/rimbilliton.akn/src/infrastructure/pulumi
pnpm install
pulumi stack init rimbilliton_akn.live   # puis définir la configuration ci-dessous
mise run pulumi:diff && mise run pulumi:apply
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

`stack/pocket-id.ts` déclare le groupe `minecraft` et le client OIDC `Minecraft` (URL de lancement
`https://minecraft.chezmoi.sh/`, callback `https://minecraft.chezmoi.sh/auth/oauth/callback/pocketid`, confidentiel,
consentement ignoré, **PKCE désactivé** car le plugin Pocket ID de Pelican n'envoie pas de `code_challenge`, groupes
autorisés `admin` et `minecraft`). Pelican authentifie les utilisateurs par ce client (plugin installé par NixOS, étape
6).

Le groupe et le client existent déjà dans Pocket-Id (créés à la main avant cette stack) : la stack les importe avec
l'option `import` de Pulumi, leurs UUID étant écrits en dur dans `stack/pocket-id.ts`. Le secret du client est généré
par une ressource `OidcClientSecret` et exporté comme sortie de stack `minecraftOidcClientSecret`.

Premier `pulumi up` (à exécuter une fois, par un humain) :

```sh
export POCKET_ID_API_KEY=<clé d'API Pocket-Id>   # ou : pulumi config set --secret pocket-id:apiKey ...
mise run pulumi:diff
```

L'aperçu doit afficher le groupe et le client en **import** ou sans changement, avec au plus des mises à jour en place
de champs cosmétiques, plus la **création** de `minecraft-secret`. Si l'aperçu affiche une création (`create`) ou un
remplacement (`replace`) du client ou du groupe, s'arrêter : un UUID ou un champ est faux. Sinon :

1. Exécuter `mise run pulumi:apply`. Le nouveau secret **remplace** l'ancien dans Pocket-Id ; si Pelican tourne déjà, sa
   connexion est cassée à partir de cet instant.
2. Placer la sortie de `pulumi stack output --show-secrets minecraftOidcClientSecret` dans le fichier SOPS sous la clé
   `oauth_pocketid_client_secret` (étape 3). Si l'hôte tourne déjà, le redéployer avec `mise run nixos:oci:update` (voir
   l'étape 6.4) ; lors d'un premier amorçage, l'installation (étape 4) reprend le secret.
3. Une fois Pelican démarré, vérifier que la connexion à `https://minecraft.chezmoi.sh/` avec Pocket-Id fonctionne.

Installation initiale (rien n'existe encore dans Pocket-Id) : créer le groupe et le client à la main dans l'interface
avec les valeurs ci-dessus, remplacer les deux UUID dans `stack/pocket-id.ts`, puis suivre la même procédure.

### 3. Préparer la clé d'hôte et les secrets

sops-nix déchiffre les secrets avec la clé SSH de l'hôte, qui doit donc exister avant le premier démarrage :

```sh
cd ../nixos
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
nonix run nixpkgs#ssh-to-age -- -i extra/etc/ssh/ssh_host_ed25519_key.pub   # clé age de l'hôte, déjà dans la règle de .sops.yaml

cp secrets/rimbilliton.example.yaml secrets/rimbilliton.sops.yaml   # à remplir depuis `pulumi stack output --show-secrets`
sops --encrypt --in-place secrets/rimbilliton.sops.yaml
```

Renseigner `tailscale_authkey`, `restic_password`, `restic_b2_env` et le client Pocket-Id (`oauth_pocketid_client_id` et
`oauth_pocketid_client_secret`, tous deux issus des sorties de la stack) ; les trois valeurs `wings_*` n'existent qu'une
fois le nœud créé dans le Panel (étape 6), donc les ajouter à ce moment-là. La clé Tailscale (`tailscaleAuthKey`) est à
usage unique et expire 7 jours après sa création (`stack/tailscale.ts`) : installer l'hôte dans ce délai.

Le fichier doit s'appeler `rimbilliton.sops.yaml` : c'est le nom que cible la règle de création de
`src/infrastructure/nixos/.sops.yaml` (clé de l'administrateur et clé de l'hôte comme destinataires), et celui que lit
`configuration.nix`. C'est l'unique exception à l'organisation par projet (le reste vit dans
`projects/rimbilliton.akn/.sops.yaml`), car le secret est consommé au moment du build. sops cherche `.sops.yaml` depuis
le répertoire courant vers le haut et ne fusionne jamais les fichiers : exécuter sops depuis ce répertoire et conserver
la clé de l'administrateur dans toute nouvelle règle. `secrets/*.yaml` est ignoré par Git, sauf `*.example.yaml` et
`*.sops.yaml`, ce qui évite de committer une copie en clair par accident.

`flake.lock` est versionné pour que chaque build utilise les mêmes révisions d'entrées (le rafraîchir avec
`nonix flake update`). Ensuite :

- renseigner `bucket` dans `modules/backup.nix` avec la sortie Pulumi `backupsBucketName`
  (`pulumi -C ../pulumi stack output backupsBucketName`) ;
- vérifier les tags d'image Pelican dans `modules/pelican.nix` (le Panel et Wings sont des bêtas à mettre à jour
  ensemble) ;
- ajouter la clé publique SSH de l'administrateur dans `configuration.nix` (`users.users.root.openssh.authorizedKeys`).

Ne pas committer `extra/`.

> [!WARNING]\
> Au 2026-10-11, `bucket` vaut toujours le placeholder `REPLACE_WITH_PULUMI_OUTPUT_backupsBucketName` dans
> `modules/backup.nix`. Tant qu'il n'est pas remplacé, le dépôt restic pointe vers un bucket inexistant et aucune
> sauvegarde ne part vers B2.

### 4. Installer NixOS

SSH est fermé dans le groupe de sécurité réseau (NSG) d'OCI : exécuter temporairement
`pulumi config set unsecure true && pulumi up`, puis remettre la valeur à `false` (et appliquer de nouveau) une fois
NixOS installé.

L'instance exécute encore l'image Ubuntu d'origine, qui n'a pas `cpio` ; `nixos-anywhere` en a besoin pour construire
l'initrd kexec (`aborted: no cpio command found`). L'installer d'abord, depuis un shell qui atteint l'agent SSH :

```sh
IP=$(pulumi -C ../pulumi stack output publicIp)
ssh ubuntu@"$IP" 'sudo apt-get update -qq && sudo apt-get install -y cpio'
```

`nixos-anywhere` s'exécute dans le conteneur `nonix`, qui relaie l'agent SSH (voir l'encadré ci-dessous). Cet agent doit
contenir la clé privée correspondant à `ssh_authorized_keys` de la configuration Pulumi, que cloud-init installe pour
l'utilisateur `ubuntu` :

```sh
mise run nixos:oci:install ubuntu@"$IP"
```

La tâche lance `nixos-anywhere` (épinglé par commit) avec
`--flake .#rimbilliton-akn-aarch64 --extra-files extra --kexec-extra-flags --kexec-syscall`. Elle **repartitionne le
volume de démarrage**.

> [!IMPORTANT]\
> **macOS (OrbStack, Docker Desktop) : les conteneurs s'exécutent dans une VM Linux.** `nonix` ne peut donc pas monter
> directement le socket de l'agent (le fichier apparaît, mais la connexion échoue avec `Connection refused`). Il utilise
> le relais fourni par le runtime, `/run/host-services/ssh-auth.sock`, qui transmet l'agent de la **session de login
> macOS** (le `SSH_AUTH_SOCK` connu de `launchd`), pas celui du shell courant. Avec l'agent macOS par défaut, rien à
> faire. Avec un agent personnalisé (Bitwarden, Secretive, 1Password, ...), pointer `launchd` vers son socket et
> redémarrer le runtime :
>
> ```sh
> launchctl getenv SSH_AUTH_SOCK                                  # ce que le relais transmet
> launchctl setenv SSH_AUTH_SOCK "<chemin du socket de l'agent>"  # par exemple $HOME/.bitwarden-ssh-agent.sock
> orb stop && orb start                                           # OrbStack ; redémarrer Docker Desktop sinon
> ```
>
> `launchctl setenv` ne survit pas à un redémarrage. Avant une installation, vérifier ce que voit le conteneur : la clé
> doit apparaître dans la sortie de
> `docker run --rm -v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent nixos/nix ssh-add -l`.
> Sous Linux, le socket est monté directement depuis `$SSH_AUTH_SOCK`.

`nixos-anywhere` ne détecte pas l'architecture de la cible : le flake expose donc une sortie par architecture
(`platforms/`). `.#rimbilliton-akn-aarch64` correspond à l'OCI A1 (UEFI, production) et `.#rimbilliton-akn-x86_64` à une
VM x86_64 en BIOS legacy. Il n'existe pas de sortie sans suffixe. Pour répéter l'installation sur une VM de test Proxmox
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
nonix run github:nix-community/nixos-anywhere -- --flake .#rimbilliton-akn-aarch64 \
  --extra-files extra --phases disko,install,reboot --target-host root@"$IP"
```

Un flake ne voit que les fichiers connus de Git : si le build signale un chemin non suivi, exécuter
`git add -N flake.lock secrets/rimbilliton.sops.yaml`.

Pour une configuration que `nonix` ne couvre pas (pas d'agent, clé dans un fichier), passer soi-même les arguments
Docker :
`nonix --docker '-v "$HOME/.ssh/id_ed25519:/root/.ssh/id_ed25519:ro"' run github:nix-community/nixos-anywhere -- ... -i /root/.ssh/id_ed25519`.
Dès que `SSH_AUTH_SOCK` est passé avec `-e`, ou que `/ssh-agent` est monté avec `--docker`, `nonix` laisse l'agent
tranquille.

### Dépanner l'installation

| Symptôme                                                            | Cause et correction                                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Permission denied (publickey)`, `Identity file ... not accessible` | Le conteneur n'a pas d'agent, ou l'agent n'a pas la clé de `ssh_authorized_keys`. Vérifier avec `ssh-add -l` (voir ci-dessus) |
| `Connection closed by <ip> port 22`                                 | sshd ralentit après des échecs répétés. Corriger la cause, attendre une à deux minutes, réessayer                             |
| `no cpio command found, but required to build the new initrd`       | Installer `cpio` sur l'instance (voir ci-dessus)                                                                              |
| `kexec_file_load failed: Address not available`                     | Utiliser `mise run nixos:oci:install`, qui passe `--kexec-syscall` (voir ci-dessus)                                           |
| `ubuntu@...` demande un mot de passe après un échec                 | Le kexec a déjà eu lieu : l'hôte est l'installeur NixOS. Reprendre avec `root@` et `--phases disko,install,reboot`            |
| `Connection refused` pour `ssh-add -l` dans le conteneur            | Le socket de l'agent a été monté depuis macOS. Utiliser le relais (voir l'encadré macOS)                                      |
| `ssh-add -l` liste les clés d'un autre agent, ou « no identities »  | `launchd` pointe vers un autre agent : voir `launchctl getenv SSH_AUTH_SOCK` ci-dessus                                        |

### 5. Vérifier le déploiement

```sh
tailscale status | grep rimbilliton-akn                    # l'hôte a rejoint le tailnet
ssh root@rimbilliton-akn systemctl status docker-pelican-panel docker-pelican-wings caddy
```

Ouvrir `https://minecraft.chezmoi.sh` : l'installeur web de Pelican doit apparaître. Wings reste arrêté (en redémarrage
continu) jusqu'à l'étape 6, qui lui donne une configuration.

### 6. Configurer Pelican

1. **Panel** : terminer l'installeur web sur `https://minecraft.chezmoi.sh/installer` et créer le compte administrateur.
   La base est une base SQLite dans `/var/lib/pelican-panel/data` (à sauvegarder : elle contient l'`APP_KEY`).
2. **Connexion Pocket-Id** (déclarée dans `modules/pelican.nix`) : le plugin communautaire
   [Pocket ID Provider](https://hub.pelican.dev/plugins/pocketid-provider) (par Ebnater) est téléchargé par Nix à une
   version épinglée, copié dans le répertoire de plugins du Panel et enregistré par l'unité `pelican-plugins`, qui
   installe aussi sa dépendance PHP et redémarre le Panel une fois. Les paramètres du fournisseur (`OAUTH_POCKETID_*`)
   sont des variables d'environnement du conteneur, l'identifiant et le secret du client venant de SOPS : Paramètres >
   OAuth ne fait que les refléter. Le plugin ne pouvant être enregistré qu'après l'installeur web, démarrer l'unité
   après le point 1, puis vérifier Paramètres > OAuth et l'onglet OAuth du profil, où lier son propre compte :

   ```sh
   ssh root@rimbilliton-akn 'systemctl restart pelican-plugins; journalctl -u pelican-plugins --no-pager -n 20'
   ```

   Le journal doit afficher `Plugin installed and enabled.` la première fois, puis `Plugin is already installed!`
   ensuite. Pour mettre le plugin à jour, changer l'URL de la release et son hash dans `modules/pelican.nix`.

3. **Rôles** (déclarés dans `modules/pelican.nix`) : l'unité `pelican-roles` crée le rôle `Full Admin` (toutes les
   permissions connues du Panel). L'attribuer aux utilisateurs dans la zone d'administration (Utilisateurs, champ Rôles)
   ; `Root Admin` reste intégré et n'est pas géré par NixOS. Les utilisateurs qui créent seulement leurs propres
   serveurs n'ont besoin d'aucun rôle (voir plus bas). Comme le plugin, l'unité exige que l'installeur web ait déjà
   tourné :

   ```sh
   ssh root@rimbilliton-akn 'systemctl restart pelican-roles; journalctl -u pelican-roles --no-pager -n 10'
   ```

   **Serveurs créés par les utilisateurs** : le plugin officiel `user-creatable-servers` est installé de la même façon
   (commit épinglé du dépôt de plugins, unité `pelican-plugins`). Il ajoute une action « créer un serveur » à la liste
   des serveurs de chaque utilisateur. Les nœuds concernés doivent porter le tag `user_creatable_servers` (champ Tags du
   nœud), et un administrateur fixe pour chaque utilisateur les limites de CPU, de mémoire, de disque et de serveurs
   dans la zone d'administration (Utilisateurs, puis les limites de ressources de l'utilisateur). Par serveur, le module
   plafonne les allocations à 1 et les sauvegardes à 2 (`UCS_DEFAULT_*` dans `modules/pelican.nix`).

4. **Nœud** : dans la zone d'administration, créer un nœud pour cet hôte.
   - FQDN `main.minecraft.chezmoi.sh`, port 443, « Behind Proxy » activé (Caddy termine le TLS)
   - mémoire et disque limités (environ 4096 MiB et 30000 MiB), CPU 100 %, répertoire de base du démon
     `/var/lib/pelican/volumes`
   - tag `user_creatable_servers` (Paramètres avancés, Tags) pour que les utilisateurs puissent y créer des serveurs
   - depuis l'onglet Configuration du nœud, copier uniquement `uuid`, `token_id` et `token` dans le fichier SOPS : le
     reste du `config.yml` de Wings est déclaré dans `modules/pelican.nix` et rendu par sops-nix

   ```sh
   cd projects/rimbilliton.akn/src/infrastructure/nixos
   sops secrets/rimbilliton.sops.yaml   # ajouter wings_uuid, wings_token_id, wings_token (voir secrets/rimbilliton.example.yaml)
   mise run nixos:oci:update
   ```

   Le nœud doit passer au vert. Pour renouveler le token, le réinitialiser dans le Panel et mettre à jour les trois
   valeurs.

5. **Allocations** : déclarées dans `modules/pelican.nix` (`allocations` : les 16 ports de jeu `25565-25580` sur
   `0.0.0.0`, avec l'alias `minecraft.chezmoi.sh` pour que le Panel affiche le nom DNS aux joueurs). Une fois le nœud
   créé, les appliquer avec `systemctl restart pelican-allocations; journalctl -u pelican-allocations --no-pager -n 10`.
   L'opération est idempotente : elle ne crée que les ports manquants et affiche un message si le nœud (retrouvé par son
   FQDN) n'existe pas. La même plage est ouverte dans le NSG d'OCI et dans le pare-feu de l'hôte : garder les trois
   synchronisées. Chaque serveur consomme une allocation.

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

Les changements ultérieurs sont déployés par Tailscale :

```sh
mise run nixos:oci:update
```

La tâche exécute `nixos-rebuild switch --flake .#rimbilliton-akn-aarch64 --target-host root@rimbilliton-akn`
(`nixos-rebuild` provient de la révision de nixpkgs verrouillée dans `flake.lock`) via `nonix`.

Il n'y a pas de mise à jour automatique, volontairement : l'instance n'est pas encore supervisée et un retour arrière
propre est difficile (voir [ADR-008](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md), qui traite
de `kazimierz.akn` et s'applique ici aussi, et
[ADR-016](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md)).

## Historique

- _2026-10-11_ : migration du guide `projects/rimbilliton.akn/docs/BOOTSTRAP.md` vers `docs/guides/` et traduction en
  français. Le contenu a été confronté au dépôt.
- _2026-10-11_ : correction du tag Tailscale. L'ancien texte exigeait `tag:minecraft` dans `tagOwners` ; le dépôt
  utilise `tag:svc-minecraft` (`configuration.nix`, `extraUpFlags`, et `stack/tailscale.ts`, qui précise que ce tag doit
  exister dans `tagOwners`).
- _2026-10-11_ : table de configuration Pulumi corrigée. `cloudflare_account_id` figurait dans la table, mais aucun code
  de `src/infrastructure/pulumi/` ne le lit (seul `cloudflare_zone_id` est lu, dans `stack/dns.ts`) ; il est retiré.
  `pocket-id:baseUrl` (présent dans `Pulumi.rimbilliton_akn.live.yaml`) est ajouté.
- _2026-10-11_ : l'étape 3 ne citait que `restic_*` à remplir sans nommer les clés. Elles sont explicitées
  (`restic_password`, `restic_b2_env`, d'après `secrets/rimbilliton.example.yaml`). La durée de vie de la clé Tailscale
  (usage unique, 7 jours, `stack/tailscale.ts`) est ajoutée.
- _2026-10-11_ : le placeholder `REPLACE_WITH_PULUMI_OUTPUT_backupsBucketName` de `modules/backup.nix` est signalé à
  l'étape 3, avec la commande qui donne la valeur (sortie `backupsBucketName`, exportée par `index.ts`).
- _2026-10-11_ : `secrets/rimbilliton.sops.yaml` contient encore une clé `oauth2_proxy_env` qu'aucun module Nix du
  projet ne lit (constaté par `grep`) ; le guide ne la mentionne pas.
- _2026-10-11_ : le commentaire de `secrets/rimbilliton.example.yaml` indique que le client Pocket-Id est « créé à la
  main », alors que `stack/pocket-id.ts` le gère désormais par import ; le guide suit `stack/pocket-id.ts`.

## Pour aller plus loin

- [README de rimbilliton.akn](../../projects/rimbilliton.akn/README.md) : architecture et vue d'ensemble du projet.
- [Restaurer Minecraft depuis restic](../procedures/backups/BKP-20261005-00-Restaurer-Minecraft-depuis-Restic.md) :
  reconstruire l'hôte ou restaurer un monde depuis B2.
- [Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
  : le backend S3 de la stack et l'import de ressources existantes.
- [Initialiser Kazimierz](Initialiser-Kazimierz.md) : le même schéma d'installation NixOS pour le VPS `kazimierz.akn`.
