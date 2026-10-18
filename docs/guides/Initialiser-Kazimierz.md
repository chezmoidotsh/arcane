# Initialiser Kazimierz

Ce guide installe NixOS sur une instance OCI neuve, jusqu'à la passerelle Pangolin de `kazimierz.akn` : Pangolin, Gerbil
et Traefik tournent et l'hôte a rejoint le tailnet. L'installation passe par `nixos-anywhere`, comme pour
`rimbilliton.akn` (voir [Initialiser Rimbilliton](Initialiser-Rimbilliton.md)) ; ensuite, `mise run nixos:oci:update`
applique chaque modification.

> [!WARNING]\
> Vérifié contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées pour cette migration.

L'hôte est passé d'Ubuntu, Ansible et Docker Compose à NixOS le 2026-10-10 :
[l'archive de la migration](../archives/Migration-de-Kazimierz-vers-NixOS.md) en garde la trace et
l'[ADR-016](../decisions/016-kazimierz-nixos-over-ansible.md) la décision.

> [!WARNING]\
> `mise run nixos:oci:install` **repartitionne le volume de démarrage**, où vit l'état de Pangolin
> (`/var/lib/pangolin/config`). Sur un hôte déjà en service, lire d'abord
> [Réinstaller et restaurer l'état](#réinstaller-et-restaurer-létat).

## Vue d'ensemble

La stack Pulumi de `projects/kazimierz.akn/src/infrastructure/pulumi/` provisionne l'instance et le réseau OCI
(compartiment, VCN, NSG, instance, enregistrements DNS). L'instance démarre sur une image Ubuntu d'origine, avec pour
seul ajout une clé SSH injectée par cloud-init (config Pulumi `ssh_authorized_keys`). NixOS s'installe ensuite
par-dessus avec `nixos-anywhere`, seule étape manuelle, puis se gère avec `nixos-rebuild`.

Le flake NixOS vit dans `projects/kazimierz.akn/src/infrastructure/nixos/`. `flake.nix` expose une sortie par plateforme
: `kazimierz-akn-aarch64` (OCI A1, production) et `kazimierz-akn-x86_64` (VM de test Proxmox KVM, voir `nixos:e2e`).
`configuration.nix` porte la base (réseau, SSH, durcissement, Tailscale, sops-nix) et `modules/pangolin.nix` les
conteneurs Pangolin, Gerbil, Traefik et error-pages.

## Avant de commencer

1. **Outils** : `mise install`, Docker (OrbStack ou Docker Desktop sur macOS) et toute commande Nix passée par `nonix`
   (`scripts/nonix`, dans le `PATH` après `mise install`), qui l'exécute dans un conteneur.
2. **Instance OCI** : provisionnée par la stack Pulumi (`mise run pulumi:diff && mise run pulumi:apply` dans
   `projects/kazimierz.akn/src/infrastructure/pulumi/`), une instance Always Free `VM.Standard.A1.Flex` en `eu-paris-1`,
   sous Ubuntu.
3. **Accès SSH public** : fermé au niveau du NSG OCI. Activer temporairement l'option Pulumi `unsecure` pour
   l'installation (`pulumi config set unsecure true && pulumi up`), puis la remettre à `false`.
4. **Tailnet** : `tag:svc-pangolin` doit exister dans les `tagOwners` de l'ACL, et aucune machine nommée `kazimierz-akn`
   ne doit rester dans la console d'administration Tailscale. Sinon, la nouvelle s'enregistre sous `kazimierz-akn-1`, et
   le `pangolin:url` des stacks Pulumi est construit à partir de ce nom.
5. **Clé SSH** : la clé privée qui correspond à `ssh_authorized_keys` de la config Pulumi doit être dans l'agent SSH.

## Étapes

### 1. Préparer la clé d'hôte et le fichier SOPS

```sh
cd projects/kazimierz.akn/src/infrastructure/nixos
mkdir -p extra/etc/ssh && ssh-keygen -t ed25519 -N '' -f extra/etc/ssh/ssh_host_ed25519_key
nonix run nixpkgs#ssh-to-age -- -i extra/etc/ssh/ssh_host_ed25519_key.pub   # clé age de l'hôte
```

Ajouter cette clé age comme second destinataire de la règle `kazimierz.akn` dans
`projects/kazimierz.akn/src/infrastructure/nixos/.sops.yaml` (séparée par une virgule, après la clé d'administration),
puis remplir le fichier de secrets :

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
export IP=<IP publique de kazimierz-pangolin>   # console OCI ; la stack Pulumi ne l'exporte pas
ssh ubuntu@"$IP" 'sudo apt-get update -qq && sudo apt-get install -y cpio'
mise run nixos:oci:install ubuntu@"$IP"
```

La tâche évalue le système complet avant de toucher l'instance, affiche la dernière sauvegarde de Pangolin et son âge,
propose d'en prendre une si elle manque ou date de plus de 24 h, puis demande `y/N` avant l'effacement. Elle lance
`nixos-anywhere` (épinglé par commit) via `nonix`, avec `--flake .#kazimierz-akn-aarch64 --extra-files extra` et
`--kexec-extra-flags --kexec-syscall` (le noyau arm64 d'Oracle exige l'appel système historique `kexec_load`).

Sur macOS, `nonix` ne peut pas monter directement le socket de l'agent SSH : voir l'encadré de
[Initialiser Rimbilliton](Initialiser-Rimbilliton.md#4-installer-nixos), qui s'applique tel quel.

`nixos-anywhere` ne peut pas détecter l'architecture cible : toujours passer le suffixe (`aarch64` ici). Si l'exécution
échoue après l'étape kexec, l'instance exécute déjà l'installeur NixOS, où seul `root` existe : reprendre à l'étape du
disque, en `root` :

```sh
cd projects/kazimierz.akn/src/infrastructure/nixos
nonix run github:nix-community/nixos-anywhere -- --flake .#kazimierz-akn-aarch64 \
  --extra-files extra --phases disko,install,reboot --target-host root@"$IP"
```

Le tableau de [dépannage de l'installation de Rimbilliton](Initialiser-Rimbilliton.md#dépanner-linstallation) s'applique
tel quel. Pour répéter toute la procédure d'abord sur une VM de test Proxmox KVM :

```sh
mise run nixos:e2e <user@host>   # la cible est obligatoire ; son adresse devient l'IP de liaison
```

## Vérifier le résultat

```sh
tailscale status | grep kazimierz-akn
ssh root@kazimierz-akn 'systemctl status docker-pangolin docker-gerbil docker-traefik docker-error-pages \
  pangolin-prepare pangolin-tailscale-serve; docker ps; tailscale serve status'
curl -sI https://pangolin.chezmoi.sh | head -n1
```

- Le tableau de bord répond avec un certificat valide. Sur une installation neuve, ouvrir
  `https://pangolin.chezmoi.sh/auth/initial-setup` pour créer le compte administrateur de Pangolin (le jeton
  d'initialisation est affiché une seule fois dans les logs du conteneur : `docker logs pangolin`).
- Les sites (Newt sur `lungmen.akn` et `rhodes.akn`) apparaissent en ligne dans le tableau de bord.
- `pulumi preview` dans `rhodes.akn` et `lungmen.akn` n'affiche aucun diff sur les ressources `pangolin`.
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
   cd projects/kazimierz.akn/src/infrastructure/nixos
   mkdir -p extra/var/lib/pangolin/config
   tar -C extra/var/lib/pangolin/config -xzf <sauvegarde>.tgz
   ```

3. Reprendre le `pangolin_server_secret` actuel dans le fichier SOPS (les données de Pangolin y sont liées) et installer
   comme à l'étape 2. La nouvelle clé d'hôte doit remplacer l'ancienne comme destinataire SOPS (`sops updatekeys`).

## Dépanner

| Symptôme                                                              | Cause et correction                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Please login as the user ubuntu` en se connectant en `root`          | Les images Ubuntu d'OCI préfixent `/root/.ssh/authorized_keys` d'une restriction `command="echo 'Please login as the user ubuntu'..."`. Copier le `authorized_keys` de l'utilisateur `ubuntu` vers root avant `nixos-anywhere`, ou installer en `ubuntu@<ip>`.                                                                                                                                                                 |
| `Too many authentication failures`                                    | Le sshd de l'hôte a `MaxAuthTries 3` ; un agent qui propose plusieurs clés l'épuise. Utiliser `IdentitiesOnly yes` (avec `-i <clé>`) ou un agent dédié qui ne contient que la bonne clé.                                                                                                                                                                                                                                       |
| `Connection refused` sur le socket de l'agent depuis `nonix` (macOS)  | Le conteneur ne voit que l'agent de la session `launchd` : `launchctl setenv SSH_AUTH_SOCK ...` puis redémarrer OrbStack (voir l'[encadré macOS de Rimbilliton](Initialiser-Rimbilliton.md#4-installer-nixos)).                                                                                                                                                                                                                |
| Tailscale ne s'enregistre pas, ou le nœud s'appelle `kazimierz-akn-1` | La `tailscaleAuthKey` (`TailnetKey` Pulumi, usage unique, 7 jours) est consommée par un premier boot : une installation refaite ou une vieille clé exige d'en générer une nouvelle avec `pulumi up --replace <urn de kazimierz-tailscale-key>`, puis de mettre à jour `tailscale_authkey` dans le fichier SOPS. Supprimer l'ancien nœud de la console Tailscale **avant** le premier boot, sinon il devient `kazimierz-akn-1`. |
| `pulumi stack output` échoue ou vise la mauvaise stack                | La stack en service est `kazimierz_akn.live` : passer `--stack kazimierz_akn.live` (les tâches `nixos:*` le font déjà).                                                                                                                                                                                                                                                                                                        |

## Appliquer une modification après l'amorçage

La configuration et les secrets vivent dans Git (le flake et le fichier SOPS) ; rien ne se modifie à la main sur l'hôte.
Après avoir commité la modification, l'appliquer depuis le poste, via le tailnet :

```sh
mise run nixos:oci:update
```

La tâche rafraîchit l'IP de liaison, puis lance
`nixos-rebuild switch --flake .#kazimierz-akn-aarch64 --target-host root@kazimierz-akn`. `nixos-rebuild --rollback` sur
l'hôte revient à la génération précédente. Il n'y a volontairement aucune mise à jour automatique : l'instance n'est pas
encore supervisée et un rollback est difficile à faire proprement (voir
l'[ADR-008](../decisions/008-kazimierz-ansible-over-kubernetes.md)). Rafraîchir les entrées avec `nonix flake update`,
puis déployer.

## Historique

- _2026-10-11_ : migration vers le standard de documentation. Le guide était `projects/kazimierz.akn/docs/BOOTSTRAP.md`,
  en anglais ; il est traduit et vérifié contre les tâches `mise`, le flake NixOS et la stack Pulumi. L'ancien
  `MIGRATION_NIXOS.md` est archivé (`Migration-de-Kazimierz-vers-NixOS.md`).

## Pour aller plus loin

- [Initialiser Rimbilliton](Initialiser-Rimbilliton.md) : le même schéma d'installation NixOS pour l'hôte Minecraft,
  avec le dépannage de `nixos-anywhere`.
- [Vue d'ensemble de `kazimierz.akn`](../../projects/kazimierz.akn/README.md) : rôle du VPS et architecture de la
  passerelle Pangolin.
- [ADR-016](../decisions/016-kazimierz-nixos-over-ansible.md) : pourquoi NixOS remplace Ansible et Docker Compose.
- [ADR-008](../decisions/008-kazimierz-ansible-over-kubernetes.md) : pourquoi la passerelle reste hors de Kubernetes.
