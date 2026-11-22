# Initialiser Horn

Ce guide installe NixOS sur une instance OCI neuve, jusqu'à la passerelle Pangolin de `horn.akn` (ancien
`kazimierz.akn`) : Pangolin, Gerbil et Traefik tournent et l'hôte a rejoint le tailnet. L'installation passe par
`nixos-anywhere`, comme pour `exusiai.akn` (voir [Initialiser Exusiai](Initialiser-Exusiai.md)) ; ensuite,
`mise run nixos:oci:update` applique chaque modification.

> [!WARNING]\
> Vérifié contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées pour cette migration.

> [!NOTE]\
> L'hôte a été renommé sur place de `kazimierz.akn` en `horn.akn` (projet Pulumi `horn-akn`, pile `horn_akn.live`, nom
> d'hôte NixOS et nœud Tailscale `horn-akn`), sans réinstallation : voir la
> [migration vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md). Le `dnsLabel`
> du VCN, les enregistrements DNS `kazimierz.akn` et les noms des sauvegardes gardent l'ancien nom.

L'hôte est passé d'Ubuntu, Ansible et Docker Compose à NixOS le 2026-10-10 :
[l'archive de la migration](../archives/Migration-de-Kazimierz-vers-NixOS.md) en garde la trace et
l'[ADR-016](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md) la décision.

> [!WARNING]\
> `mise run nixos:oci:install` **repartitionne le volume de démarrage**, où vit l'état de Pangolin
> (`/var/lib/pangolin/config`). Sur un hôte déjà en service, lire d'abord
> [Réinstaller et restaurer l'état](#réinstaller-et-restaurer-létat).

## Vue d'ensemble

La stack Pulumi de `fleet/hosts/akn.horn/pulumi/` provisionne l'instance et le réseau OCI (compartiment, VCN, NSG,
instance, enregistrements DNS). L'instance démarre sur une image Ubuntu d'origine, avec pour seul ajout une clé SSH
injectée par cloud-init (config Pulumi `ssh_authorized_keys`). NixOS s'installe ensuite par-dessus avec
`nixos-anywhere`, seule étape manuelle, puis se gère avec `nixos-rebuild`.

Le flake NixOS vit dans `fleet/hosts/akn.horn/nix/`. `flake.nix` expose une sortie par plateforme : `horn-akn-aarch64`
(OCI A1, production) et `horn-akn-x86_64` (VM de test Proxmox KVM, voir `nixos:e2e`). `configuration.nix` porte la base
(réseau, SSH, durcissement, Tailscale, sops-nix) et `modules/pangolin.nix` les conteneurs Pangolin, Gerbil, Traefik et
error-pages.

## Avant de commencer

1. **Outils** : `mise install` et Nix, exécuté en natif (`nix run`). Les outils des tâches (`nixos-anywhere`,
   `nixos-rebuild`) sont des paquets de `nix/flake.nix`, épinglés par `nix/flake.lock`.
2. **Instance OCI** : provisionnée par la stack Pulumi (`pulumi preview && pulumi up` dans
   `fleet/hosts/akn.horn/pulumi/`), une instance Always Free `VM.Standard.A1.Flex` en `eu-paris-1`, sous Ubuntu. Sur
   une installation neuve, lancer d'abord `pulumi config set pangolin false` : les ressources Pangolin (organisation,
   fournisseur d'identité, rôle) passent par l'API de l'instance, qui n'existe pas encore.
3. **Accès SSH public** : fermé au niveau du NSG OCI. Activer temporairement l'option Pulumi `unsecure` pour
   l'installation (`pulumi config set unsecure true && pulumi up`), puis la remettre à `false`.
4. **Tailnet** : `tag:svc-pangolin` doit exister dans les `tagOwners` de l'ACL, et aucune machine nommée `horn-akn` ne
   doit rester dans la console d'administration Tailscale. Sinon, la nouvelle s'enregistre sous `horn-akn-1`, et le
   `pangolin:url` des stacks Pulumi est construit à partir de ce nom.
5. **Clé SSH** : la clé privée qui correspond à `ssh_authorized_keys` de la config Pulumi doit être dans l'agent SSH.

## Étapes

### 1. Préparer la clé d'hôte et le fichier SOPS

```sh
cd fleet/hosts/akn.horn/nix
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
nix run nixpkgs#ssh-to-age -- -i extra/etc/ssh/ssh_host_ed25519_key.pub   # clé age de l'hôte
```

Ajouter cette clé age comme second destinataire de la règle `kazimierz.akn` dans `fleet/hosts/akn.horn/nix/.sops.yaml`
(séparée par une virgule, après la clé d'administration), puis remplir le fichier de secrets :

```sh
cp secrets/kazimierz.example.yaml secrets/kazimierz.sops.yaml   # à remplir, voir les commentaires du fichier
sops --encrypt --in-place secrets/kazimierz.sops.yaml
```

| Clé                                        | Valeur                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailscale_authkey`                        | `pulumi stack output tailscaleAuthKey --show-secrets` (dans `src/infrastructure/pulumi/`)                                                                                                                                                                     |
| `cloudflare_dns_api_token`                 | `pulumi stack output traefikDns01TokenValue --show-secrets`                                                                                                                                                                                                   |
| `pangolin_server_secret`                   | Nouvelle valeur aléatoire sur une installation neuve (`openssl rand -hex 32`). Elle signe les sessions de Pangolin et chiffre des données de sa base : elle ne doit jamais changer ensuite, et doit être reprise telle quelle pour restaurer un état existant |
| `pangolin_smtp_user`, `pangolin_smtp_pass` | Clé d'API et clé secrète Mailjet                                                                                                                                                                                                                              |

`secrets/kazimierz.sops.yaml` est versionné (chiffré) ; `extra/` est ignoré par Git et ne doit jamais être commité. Si
le build signale un chemin non suivi, lancer `git add -N flake.lock` (un flake ne voit que les fichiers connus de Git).

L'**IP de liaison** (`pangolin.bindIp`), sur laquelle Docker publie les ports 80 et 443, est l'adresse privée (VCN) de
l'instance : l'IP publique est traduite par OCI et n'apparaît jamais sur l'hôte. `mise run nixos:binding-ip` l'écrit
dans `extra/etc/pangolin/binding-ip` à partir de la sortie Pulumi, et `nixos:oci:install` comme `nixos:oci:update` le
lancent en premier. Le build refuse un fichier absent ou vide.

### 2. Installer NixOS

L'instance exécute encore l'image Ubuntu d'origine, qui n'a pas `cpio` ; `nixos-anywhere` en a besoin pour construire
l'initrd kexec :

```sh
export IP=<IP publique de horn-pangolin>   # console OCI ; la stack Pulumi ne l'exporte pas
ssh ubuntu@"$IP" 'sudo apt-get update -qq && sudo apt-get install -y cpio'
mise run nixos:oci:install ubuntu@"$IP"
```

La tâche évalue le système complet avant de toucher l'instance, affiche la dernière sauvegarde de Pangolin et son âge,
propose d'en prendre une si elle manque ou date de plus de 24 h, puis demande `y/N` avant l'effacement. Elle lance
`nixos-anywhere` (épinglé par `nix/flake.lock`), avec `--flake .#horn-akn-aarch64 --extra-files extra --build-on remote`
et `--kexec-extra-flags --kexec-syscall` (le noyau arm64 d'Oracle exige l'appel système historique `kexec_load`).
L'agent SSH de la session doit contenir la clé de la cible.

`nixos-anywhere` ne peut pas détecter l'architecture cible : toujours passer le suffixe (`aarch64` ici). Si l'exécution
échoue après l'étape kexec, l'instance exécute déjà l'installeur NixOS, où seul `root` existe : reprendre à l'étape du
disque, en `root` :

```sh
cd fleet/hosts/akn.horn/nix
nix run .#nixos-anywhere -- --flake .#horn-akn-aarch64 \
  --extra-files extra --phases disko,install,reboot --target-host root@"$IP"
```

Le tableau de [dépannage de l'installation d'Exusiai](Initialiser-Exusiai.md#dépanner-linstallation) s'applique tel
quel. Pour répéter toute la procédure d'abord sur une VM de test Proxmox KVM :

```sh
mise run nixos:e2e <user@host>   # la cible est obligatoire ; son adresse devient l'IP de liaison
```

## Vérifier le résultat

```sh
tailscale status | grep horn-akn
ssh root@horn-akn 'systemctl status docker-pangolin docker-gerbil docker-traefik docker-error-pages \
  pangolin-prepare pangolin-tailscale-serve; docker ps; tailscale serve status'
curl -sI https://pangolin.chezmoi.sh | head -n1
```

- Le tableau de bord répond avec un certificat valide. Sur une installation neuve, ouvrir
  `https://pangolin.chezmoi.sh/auth/initial-setup` pour créer le compte administrateur de Pangolin (le jeton
  d'initialisation est affiché une seule fois dans les logs du conteneur : `docker logs pangolin`).
- Les sites (Newt sur `lungmen.akn` et `rhodes.akn`) apparaissent en ligne dans le tableau de bord.
- `pulumi preview` dans `rhodes.akn` et `lungmen.akn` n'affiche aucun diff sur les ressources `pangolin`.
- Sur une installation neuve, une fois le compte administrateur créé et la clé d'API Pangolin renseignée :
  `pulumi config rm pangolin && pulumi up` crée les ressources Pangolin.
- Refermer le SSH : `pulumi config set unsecure false && pulumi up`.

## Réinstaller et restaurer l'état

L'état de Pangolin (utilisateurs, sites, ressources, clés d'API, clé WireGuard de Gerbil, certificats) vit dans
`/var/lib/pangolin/config` **sur le volume de démarrage** : il n'y a pas de volume de données séparé. Une réinstallation
l'efface s'il n'est pas restauré :

1. `mise run nixos:backup` prend une sauvegarde à chaud (API de sauvegarde SQLite, sans interruption) dans
   `$KAZIMIERZ_BACKUP_DIR` (par défaut `~/.local/share/kazimierz.akn/backups`). L'archive contient des secrets en clair
   : la garder chiffrée au repos.
2. L'extraire là où `nixos-anywhere --extra-files` la déposera sur la nouvelle racine :

   ```sh
   cd fleet/hosts/akn.horn/nix
   mkdir -p extra/var/lib/pangolin/config
   tar -C extra/var/lib/pangolin/config -xzf <sauvegarde>.tgz
   ```

3. Reprendre le `pangolin_server_secret` actuel dans le fichier SOPS (les données de Pangolin y sont liées) et installer
   comme à l'étape 2. La nouvelle clé d'hôte doit remplacer l'ancienne comme destinataire SOPS (`sops updatekeys`).

## Dépanner

| Symptôme                                                             | Cause et correction                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Please login as the user ubuntu` en se connectant en `root`         | Les images Ubuntu d'OCI préfixent `/root/.ssh/authorized_keys` d'une restriction `command="echo 'Please login as the user ubuntu'..."`. Copier le `authorized_keys` de l'utilisateur `ubuntu` vers root avant `nixos-anywhere`, ou installer en `ubuntu@<ip>`.                                                                                                                                                            |
| `Too many authentication failures`                                   | Le sshd de l'hôte a `MaxAuthTries 3` ; un agent qui propose plusieurs clés l'épuise. Utiliser `IdentitiesOnly yes` (avec `-i <clé>`) ou un agent dédié qui ne contient que la bonne clé.                                                                                                                                                                                                                                  |
| Tailscale ne s'enregistre pas, ou le nœud s'appelle `horn-akn-1`     | La `tailscaleAuthKey` (`TailnetKey` Pulumi, usage unique, 7 jours) est consommée par un premier boot : une installation refaite ou une vieille clé exige d'en générer une nouvelle avec `pulumi up --replace <urn de horn-tailscale-key>`, puis de mettre à jour `tailscale_authkey` dans le fichier SOPS. Supprimer l'ancien nœud de la console Tailscale **avant** le premier boot, sinon il devient `horn-akn-1`.      |
| `pulumi stack output` échoue ou vise la mauvaise stack               | La stack en service est `horn_akn.live` : passer `--stack horn_akn.live` (les tâches `nixos:*` le font déjà).                                                                                                                                                                                                                                                                                                             |

## Appliquer une modification après l'amorçage

La configuration et les secrets vivent dans Git (le flake et le fichier SOPS) ; rien ne se modifie à la main sur l'hôte.
Après avoir commité la modification, l'appliquer depuis le poste, via le tailnet :

```sh
mise run nixos:oci:update
```

La tâche rafraîchit l'IP de liaison, puis lance
`nixos-rebuild switch --flake .#horn-akn-aarch64 --target-host root@horn-akn`. `nixos-rebuild --rollback` sur l'hôte
revient à la génération précédente. Il n'y a volontairement aucune mise à jour automatique : l'instance n'est pas encore
supervisée et un rollback est difficile à faire proprement (voir
l'[ADR-008](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md)). Rafraîchir les entrées avec
`nix flake update`, puis déployer.

## Historique

- _2026-10-11_ : migration vers le standard de documentation. Le guide était `projects/kazimierz.akn/docs/BOOTSTRAP.md`
  (le dossier est devenu `fleet/hosts/akn.horn`), en anglais ; il est traduit et vérifié contre les tâches `mise`, le
  flake NixOS et la stack Pulumi. L'ancien `MIGRATION_NIXOS.md` est archivé (`Migration-de-Kazimierz-vers-NixOS.md`).

## Pour aller plus loin

- [Initialiser Exusiai](Initialiser-Exusiai.md) : le même schéma d'installation NixOS pour l'hôte Minecraft, avec le
  dépannage de `nixos-anywhere`.
- [Vue d'ensemble de `horn.akn`](../../fleet/hosts/akn.horn/README.md) : rôle du VPS et architecture de la passerelle
  Pangolin.
- [ADR-016](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md) : pourquoi NixOS remplace Ansible et Docker
  Compose.
- [ADR-008](../decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md) : pourquoi la passerelle reste hors de
  Kubernetes.
