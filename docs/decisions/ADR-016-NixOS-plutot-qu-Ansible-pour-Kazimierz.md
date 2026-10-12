---
status: "implemented"
date: 2026-10-10
implementation-completed: 2026-10-10
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-5.5"]
informed: []
template-version: "2.0.0"
---

# ADR-016 NixOS plutôt qu'Ansible pour Kazimierz

Migré le 2026-10-11 ; l'état des serveurs n'a pas été revérifié.

Titre d'origine : « `kazimierz`.AKN: NixOS (nixos-anywhere + sops-nix) over Ansible + Docker Compose ».

## Contexte et problème

L'[ADR-008](./ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md) a établi que `kazimierz.akn`, la passerelle
publique Pangolin, est un VPS unique et non un cluster Kubernetes, et a choisi Ansible + Docker Compose pour le
configurer. Le VPS vit désormais sur une instance Oracle Cloud Always Free A1 provisionnée par Pulumi, qui démarre une
image Ubuntu standard. Un playbook Ansible (rôles `system_setup` et `pangolin`) y installait Docker, Tailscale, UFW et
les mises à jour automatiques, puis générait la pile Compose de Pangolin, Gerbil et Traefik à partir de modèles Jinja2,
avec des secrets dans des `host_vars` chiffrés par ansible-vault. Depuis la suppression d'`ansible-pull` (2026-10-07),
le playbook était lancé à la main depuis une machine d'opérateur.

Entre-temps, `rimbilliton.akn`, un second hôte OCI A1, a été construit dans l'autre sens : NixOS installé par-dessus la
même image Ubuntu standard avec `nixos-anywhere`, puis géré avec `nixos-rebuild`, les secrets étant pris en charge par
`sops-nix`. Le dépôt compte donc deux hôtes mono-VM chez le même fournisseur, configurés par deux piles sans rapport, et
`kazimierz.akn` portait la plus lourde : une chaîne d'outils Python/Ansible avec des rôles et collections externes, un
mot de passe vault à protéger par un autre secret, et un OS qui dérive d'une exécution à l'autre (le ré-amorçage du
2026-10-07 sur Ubuntu 26.04 a échoué sur la clé de signature du PPA d'Ansible, consigné dans l'ADR-008).

La question stratégique : la gestion de configuration de `kazimierz.akn` doit-elle rester sur Ansible, ou passer au
modèle NixOS déjà utilisé par `rimbilliton.akn` ?

## Hors périmètre

- **Ne pas rouvrir Kubernetes contre VPS**, ni Pangolin comme passerelle : les autres décisions de l'ADR-008 restent en
  vigueur.
- **Ne pas ajouter de mises à jour automatiques.** Les hôtes ne sont pas encore supervisés et un retour arrière est
  difficile à réaliser proprement ; l'ADR-008 consigne déjà que `system.autoUpgrade` reste désactivé. Les mises à jour
  sont appliquées à la main avec `nixos-rebuild`.
- **Ne pas retirer la chaîne d'outils Ansible du dépôt** : Ansible reste utilisé par d'autres projets
  (`catalog/ansible/`, la préparation de l'hôte Proxmox dans `projects/chezmoi.sh`).

## Facteurs de décision

- **Une seule chaîne d'outils pour les hôtes OCI** : le même workflow d'installation, de déploiement et de gestion des
  secrets que `rimbilliton.akn`.
- **OS et services déclaratifs** : la configuration de l'OS, et pas seulement la pile applicative, doit être
  reproductible depuis Git, pour permettre de reconstruire un VPS sacrificiel.
- **Secrets dans Git sans second secret** : SOPS + age est déjà le mécanisme du dépôt pour les secrets qui doivent vivre
  dans Git (ADR-001 à ADR-004) ; un mot de passe ansible-vault en ajoute un parallèle.
- **Retour arrière** : un mauvais changement doit pouvoir être annulé vers la génération précédente.
- **Contrainte** : le quota Always Free A1 du tenant est entièrement utilisé (`kazimierz-pangolin` et
  `rimbilliton-minecraft`), donc une migration côte à côte sur une seconde instance est impossible.

## Options envisagées

### Option 1 : conserver Ansible + Docker Compose

> **Statut : REJETÉE**

Conserver le playbook et ses rôles, lancés à la main en SSH. Rien à migrer et aucune interruption. C'est une
configuration qui fonctionne et qui a fait ses preuves, mais elle reste une seconde pile à maintenir à côté de celle de
`rimbilliton.akn` sous NixOS, et elle ne converge que ce que décrivent les rôles : les paquets, les paramètres noyau et
tout ce qui a été modifié à la main sur l'hôte Ubuntu modifiable persistent.

- `+` Aucune migration, aucune interruption
- `+` Éprouvée en production jusqu'à la migration
- `-` Seconde chaîne d'outils (Ansible, rôles Galaxy, ansible-vault) à côté de NixOS pour le même type d'hôte
- `-` OS modifiable : dérive de configuration et casse venant des sources de paquets amont (l'incident du PPA du
  2026-10-07)
- `-` Secrets protégés par un mot de passe vault qui est lui-même un secret SOPS

### Option 2 : NixOS installé avec nixos-anywhere, secrets avec sops-nix

> **Statut : ACCEPTÉE**

Remplacer Ubuntu par NixOS, installé par-dessus l'image OCI standard avec `nixos-anywhere` (kexec, puis partitionnement
du volume de démarrage avec disko). Le système, le durcissement et la pile Pangolin (les mêmes images de conteneurs
amont, exécutées via `oci-containers`) sont décrits dans un flake avec une sortie par plateforme : l'A1 de production
(aarch64) et une VM de test x86_64 sur Proxmox. Les secrets vivent dans un fichier SOPS dont les destinataires sont la
clé d'administration et la clé SSH de l'hôte, déchiffré sur l'hôte par `sops-nix`. Les changements sont déployés avec
`nixos-rebuild switch --target-host` via le tailnet. Une tentative NixOS antérieure (voir « Évolution de la décision »)
a été abandonnée pour des raisons qui ne s'appliquent pas à cette méthode d'installation.

- `+` Même modèle et mêmes tâches que `rimbilliton.akn`
- `+` OS et services déclarés ensemble, avec retour arrière par génération
- `+` Secrets chiffrés avec SOPS + age du dépôt, sans mot de passe supplémentaire
- `-` Pas de migration côte à côte : `nixos-anywhere` repartitionne le volume de démarrage, donc la migration coûte une
  interruption et l'état de l'hôte doit être sauvegardé puis restauré
- `-` Le retour arrière de l'hôte entier après une réinstallation est impossible (le volume de démarrage est effacé)
- `-` Une expertise NixOS est nécessaire pour toute modification de l'hôte

## Décision retenue

**Option retenue : « NixOS installé avec nixos-anywhere, secrets avec sops-nix » (option 2)**, parce qu'elle retire la
seconde pile de gestion de configuration des hôtes OCI et rend l'hôte entier, pas seulement la couche applicative,
reproductible depuis Git, tout en réutilisant un workflow déjà éprouvé sur `rimbilliton.akn`. L'arbitrage décisif est
opérationnel : Ansible fonctionne, mais le conserver revient à maintenir deux chaînes d'outils pour deux hôtes par
ailleurs semblables, contre un coût de migration ponctuel (de quelques minutes à plusieurs dizaines de minutes
d'interruption, atténué par une sauvegarde et une restauration de l'état de Pangolin). La migration a été validée en
production le 2026-10-10 : état restauré, conteneurs en marche, nœud Tailscale enregistré, `tailscale serve`
fonctionnel.

Cette décision supplante **uniquement** le choix de gestion de configuration de l'ADR-008 (Ansible + Docker Compose).
Pangolin et les conteneurs Docker restent, et la décision de l'ADR-008 contre Kubernetes est inchangée.

---

## Conséquences

### Positives

- (+) Une seule chaîne d'outils (`nixos-anywhere`, `nixos-rebuild`, `sops-nix`) pour les deux hôtes OCI ; ce projet n'a
  plus besoin d'Ansible (son code, son mot de passe vault et sa règle SOPS ont été supprimés)
- (+) OS déclaratif avec retour arrière par génération (`nixos-rebuild --rollback`)
- (+) Le volume de données OCI de 50 Go, inutilisé, a été retiré de la stack Pulumi

### Négatives

- (-) **Aucune mise à jour automatique, volontairement** : les hôtes ne sont pas supervisés, une mauvaise mise à jour
  non surveillée passerait inaperçue et le retour arrière est difficile à réaliser proprement. Les mises à jour sont
  appliquées à la main (`mise run nixos:oci:update`) ; à réexaminer une fois les instances supervisées.
- (-) **L'état vit sur le volume de démarrage** (`/var/lib/pangolin/config`) et une réinstallation l'efface. Une
  sauvegarde est obligatoire avant toute réinstallation : `mise run nixos:backup` en prend une à chaud, et
  `nixos:oci:install` affiche la dernière sauvegarde et son âge, propose d'en prendre une et demande confirmation. La
  sauvegarde contient des secrets en clair et est conservée hors du dépôt.
- (-) Une réinstallation régénère la clé de l'hôte (un nouveau destinataire SOPS) et consomme la clé Tailscale à usage
  unique
- (-) `unattended-upgrades` et sa notification Slack n'ont pas été portés

### Neutres

- (\~) Le durcissement (sshd, sysctl, fail2ban, DNS) a été porté avec les mêmes paramètres ; le pare-feu NixOS remplace
  UFW
- (\~) Les images de Pangolin restent épinglées par tag et par digest, désormais dans le module Nix

---

## Détails de mise en œuvre et état

Mis en œuvre et en production depuis le 2026-10-10 : sorties de flake `kazimierz-akn-aarch64` (A1 OCI) et
`kazimierz-akn-x86_64` (VM de test), secrets de l'hôte dans un fichier versionné chiffré par SOPS, et tâches `mise`
`nixos:*` pour l'installation, la mise à jour, la sauvegarde et la répétition de bout en bout. La procédure se trouve
dans [Initialiser Kazimierz](../guides/Initialiser-Kazimierz.md) et le compte rendu de la bascule dans
[Archive : migration de Kazimierz vers NixOS](../archives/Migration-de-Kazimierz-vers-NixOS.md).

Vérifié dans le dépôt le 2026-10-11 : le flake sous `projects/kazimierz.akn/src/infrastructure/nixos/` expose bien
`kazimierz-akn-aarch64` et `kazimierz-akn-x86_64`, les tâches `nixos:*` existent sous
`projects/kazimierz.akn/.mise/tasks/nixos/` (`backup`, `binding-ip`, `e2e`, `oci/install`, `oci/update`),
`projects/kazimierz.akn/src/infrastructure/` ne contient plus que `nixos/` et `pulumi/`, et `.mise.toml` ne mentionne
plus Ansible. L'état des serveurs n'a pas été revérifié.

---

## Évolution de la décision

- **2026-08-01** : une première tentative NixOS (une image qcow2 immuable construite en local) a été abandonnée au
  profit d'Ansible : la construction de l'image exigeait KVM en local, indisponible sur le poste Apple Silicon, et un
  test `nixos-anywhere` sur une VM Proxmox s'est bloqué sur un problème de démarrage OVMF non résolu (voir les notes de
  session dans `.agents/sessions/`).
- **2026-10-10** : décision révisée, NixOS par `nixos-anywhere` par-dessus l'image OCI standard. Aucun des deux blocages
  ne s'applique : la closure est construite sans VM locale, et la cible est une vraie instance OCI, une méthode éprouvée
  sur `rimbilliton.akn`.

---

## Historique des modifications

- _2026-10-11_ : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections renommées,
  sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, `template-version` passé
  de 1.1.0 à 2.0.0, références de documentation mises à jour en liens relatifs vers `docs/guides/` et `docs/archives/`.
  Statut `implemented` conservé : le flake NixOS, les tâches `nixos:*` et l'absence d'Ansible dans
  `projects/kazimierz.akn/` le confirment dans le dépôt. Décision, options, chronologie, dates et `decision-makers`
  inchangés.
- _2026-10-10_ : **FEATURE** : ADR créé et mis en œuvre ; supplante le choix de gestion de configuration de l'ADR-008.

---

## Pour aller plus loin

- [ADR-008 Ansible plutôt que Kubernetes pour Kazimierz](./ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md) : la
  décision supplantée en partie, sur la gestion de configuration.
- [ADR-001 Gestion centralisée des secrets](./ADR-001-Gestion-Centralisee-des-Secrets.md) : le cadre des secrets (SOPS +
  age pour ceux qui vivent dans Git).
- [Initialiser Kazimierz](../guides/Initialiser-Kazimierz.md) : la procédure d'installation et de mise à jour sous
  NixOS.
- [Archive : migration de Kazimierz vers NixOS](../archives/Migration-de-Kazimierz-vers-NixOS.md) : le compte rendu de
  la bascule d'Ansible vers NixOS.
- [Initialiser Rimbilliton](../guides/Initialiser-Rimbilliton.md) : l'hôte OCI dont le modèle NixOS a été repris.
- [Notes de session de la tentative antérieure](../../.agents/sessions/20260801-kazimierz-nixos-vs-ansible.md) : la
  première tentative NixOS, abandonnée le 2026-08-01.
- [nixos-anywhere](https://github.com/nix-community/nixos-anywhere) et [sops-nix](https://github.com/Mic92/sops-nix) :
  les outils d'installation et de gestion des secrets.
