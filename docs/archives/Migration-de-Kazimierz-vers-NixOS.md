# Migration de Kazimierz vers NixOS

Ce document décrivait la bascule du VPS `kazimierz.akn` d'Ubuntu + Ansible + Docker Compose vers NixOS, réalisée le
2026-10-10. Il est archivé parce que la migration est terminée.

> [!NOTE]\
> **Archivée le 2026-10-11.** La migration est terminée ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

L'objectif était de remplacer la configuration Ubuntu + Ansible + Docker Compose du VPS par un hôte NixOS installé avec
`nixos-anywhere`, sur le modèle de `rimbilliton.akn`. La définition NixOS vit dans
`projects/kazimierz.akn/src/infrastructure/nixos/` (flake, `configuration.nix`, `modules/`, `platforms/`, `secrets/`).

Le quota Always Free A1 de la tenancy étant entièrement consommé, aucune migration côte à côte n'était possible :
`nixos-anywhere` repartitionne le volume de démarrage, ce qui impliquait une interruption de tous les services exposés
par Pangolin.

Les grandes étapes :

1. Sauvegarder l'état de Pangolin (base SQLite, clé WireGuard de Gerbil, certificats ACME), situé sur le volume de
   démarrage qui allait être effacé.
2. Préparer la clé d'hôte SSH, le fichier SOPS (la valeur courante de `pangolin_server_secret` devait être conservée) et
   l'état restauré, copié sur la nouvelle racine par `--extra-files`.
3. Supprimer l'ancien nœud `kazimierz-akn` de la console Tailscale pour libérer le nom.
4. Ouvrir SSH le temps de l'installation (`unsecure` dans la pile Pulumi), puis lancer `mise run nixos:oci:install`.
5. Vérifier le tableau de bord Pangolin, les sites Newt et l'Integration API, puis refermer SSH.
6. Nettoyer : retrait du code Ansible, mise à jour du README et du diagramme d'architecture, rédaction de l'ADR-016.

Correspondances principales entre l'ancien et le nouveau montage :

| Fonction              | Avant (Ansible)                         | Après (NixOS)                                       |
| --------------------- | --------------------------------------- | --------------------------------------------------- |
| Système, durcissement | rôle `system_setup`                     | `configuration.nix`                                 |
| Conteneurs            | Docker Compose dans `/opt/pangolin`     | `modules/pangolin.nix` (`oci-containers`)           |
| Secrets               | `host_vars` chiffrés avec ansible-vault | `secrets/kazimierz.sops.yaml` (SOPS + age)          |
| Déploiement           | `ansible-playbook` sur SSH              | `nixos-rebuild switch --target-host` via le tailnet |

Résultat : la bascule a été validée en production le jour même (état Pangolin restauré, 4 conteneurs en fonctionnement,
nœud Tailscale enregistré, `tailscale serve` opérationnel). `unattended-upgrades` n'a volontairement pas été porté.

Les pièges rencontrés pendant la bascule figurent dans la table de dépannage du guide courant : restriction `command=`
sur `/root/.ssh/authorized_keys` des images Ubuntu OCI, `MaxAuthTries 3` côté sshd, agent SSH du conteneur `nonix` sur
macOS, clé d'authentification Tailscale à usage unique.

## Pourquoi il est archivé

La migration est terminée et le code Ansible qu'elle mentionnait a été retiré de l'arbre (le dossier
`src/infrastructure/ansible/` n'existe plus dans `projects/kazimierz.akn/`). Le guide courant pour une (ré)installation
est [Amorcer Kazimierz](../guides/Initialiser-Kazimierz.md). La décision est portée par
l'[ADR-016](../decisions/016-kazimierz-nixos-over-ansible.md), qui remplace le choix de gestion de configuration de
l'ADR-008.

## Texte intégral

Le récit complet (procédure détaillée, section de retour arrière historique) reste dans l'historique Git, dans
`projects/kazimierz.akn/docs/MIGRATION_NIXOS.md` avant son archivage (migration de la documentation, issue #1257).

## Pour aller plus loin

- [Initialiser Kazimierz](../guides/Initialiser-Kazimierz.md) : le guide courant d'installation et de réinstallation.
- [ADR-016 Kazimierz NixOS over Ansible](../decisions/016-kazimierz-nixos-over-ansible.md) : la décision qui a motivé la
  migration.
- [Initialiser Rimbilliton](../guides/Initialiser-Rimbilliton.md) : le modèle NixOS + `nixos-anywhere` suivi par la
  migration.
