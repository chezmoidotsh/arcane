---
status: "implemented"
date: 2026-10-11
implementation-completed: 2025-11-15
decision-makers: ["Alexandre"]
assisted-by: ["claude-4.5-sonnet", "claude-sonnet-5.5"]
informed: []
template-version: "2.0.0"
---

# ADR-008 Ansible plutôt que Kubernetes pour Kazimierz

Migré le 2026-10-11 ; les affirmations sur l'état des serveurs n'ont pas été revérifiées.

> [!CAUTION]\
> **Partiellement supplantée par l'[ADR-016](./016-kazimierz-nixos-over-ansible.md) (2026-10-10, vérifié le
> 2026-10-11).** Reste valable : la décision de fond, un VPS unique et non un cluster Kubernetes, avec Pangolin comme
> passerelle, Pangolin, Gerbil et Traefik tournant en conteneurs, et `kazimierz.akn` hors du parc ArgoCD. Supplanté : le
> choix de gestion de configuration (Ansible + Docker Compose), remplacé par NixOS installé avec `nixos-anywhere` et
> `sops-nix` ; l'ADR-016 déclare ne supplanter que ce choix. Preuves : `projects/kazimierz.akn/src/infrastructure/` ne
> contient plus que `nixos/` et `pulumi/`, et le playbook `src/infrastructure/ansible/site.yml` cité plus bas n'existe
> plus. Les passages propres à Ansible (dont `ansible-pull`, ARA et ce chemin) sont conservés comme historique. Le
> statut reste `implemented`, car la décision contre Kubernetes est toujours appliquée.

## Contexte et problème

`kazimierz`.AKN est une passerelle publique hébergée sur un VPS, qui fait tourner Pangolin (reverse proxy avec WAF) pour
donner un accès sécurisé aux services du homelab. La question d'infrastructure : ce déploiement doit-il utiliser
Kubernetes (comme les autres clusters Arcane, `amiya` et `lungmen`) ou adopter une approche plus simple, Docker
Compose + Ansible ?

Plusieurs tentatives de déploiement de Pangolin sur Kubernetes ont été faites avec diverses configurations (FluxCD ou
ArgoCD, avec CNPG et/ou cert-manager), mais chaque itération ajoutait de la complexité sans bénéfice net pour ce cas
d'usage précis. L'environnement de déploiement présente des contraintes particulières :

- **Une seule application** : le reverse proxy Pangolin comme charge de travail principale
- **Ressources limitées** : un VPS de 4 Go de RAM au total
- **Exposition publique** : un accès direct depuis Internet, qui exige une posture de sécurité robuste
- **Isolation du homelab** : aucune connectivité réseau directe avec les clusters internes
- **Infrastructure sacrificielle** : conçue pour être détruite et reconstruite rapidement en cas de compromission

La question centrale : la cohérence avec les autres clusters justifie-t-elle la charge d'exploitation de Kubernetes pour
ce scénario de déploiement précis ?

## Facteurs de décision

### Exigences fonctionnelles

- **Déploiement de l'application** : prendre en charge le reverse proxy Pangolin avec ses capacités de WAF
- **Gestion des tunnels WireGuard** : Gerbil doit manipuler IPTables pour le routage des tunnels
- **Workflow GitOps** : une gestion déclarative de l'infrastructure depuis le dépôt Git
- **Reprise rapide** : pouvoir reconstruire vite après un incident de sécurité

### Exigences non fonctionnelles

- **Efficacité des ressources** : minimiser la charge mémoire et CPU pour un déploiement mono-application
- **Simplicité d'exploitation** : réduire la complexité de débogage et la charge de maintenance
- **Alignement avec l'amont** : suivre les modèles de déploiement officiels des projets amont
- **Maintenabilité** : permettre une gestion par un seul opérateur

### Contraintes

- **Ressources du VPS** : 4 Go de RAM, allocation CPU limitée
- **Système d'exploitation** : l'OS proposé nativement par l'hébergeur du VPS (couramment Ubuntu Server, différent de
  Talos Linux utilisé dans les autres clusters)
- **Architecture réseau** : exposition à l'Internet public, avec des tunnels WireGuard vers le homelab
- **Infrastructure autonome** : aucune gestion centralisée par l'ArgoCD du cluster `amiya`

## Options envisagées

### Option 1 : pile Kubernetes complète (tentatives initiales)

> **Statut : REJETÉE**

Déployer Pangolin sur Kubernetes avec des modèles d'orchestration standards, cohérents avec les autres clusters Arcane.

**Pile technologique :**

- **Distribution Kubernetes** : K3s (léger) ou Talos Linux (OS immuable)
- **Contrôleur GitOps** : FluxCD ou ArgoCD pour des déploiements déclaratifs
- **Base de données** : l'opérateur CloudNative-PG (CNPG) pour PostgreSQL
- **Gestion des certificats** : cert-manager avec intégration Let's Encrypt
- **Réseau** : des Services Kubernetes avec les privilèges `hostNetwork` pour Gerbil
- **Déploiement de l'application** : des manifestes Kubernetes ou des charts Helm sur mesure pour Pangolin

Avantages et inconvénients :

- `+` **Cohérence architecturale** : les mêmes modèles de déploiement que les clusters `amiya` et `lungmen`
- `+` **Outillage Kubernetes** : un workflow natif avec kubectl, Helm et Kustomize
- `+` **Gestion des ressources** : le scheduler Kubernetes pour l'allocation et les limites de ressources
- `+` **Supervision de santé** : des sondes liveness et readiness intégrées
- `+` **GitOps natif** : ArgoCD ou FluxCD pour une infrastructure déclarative
- `+` **Débogage standardisé** : les outils de dépannage natifs de Kubernetes
- `-` **Surcharge de ressources** : le plan de contrôle Kubernetes consomme \~1 Go de RAM (25 % de la capacité du VPS),
  et \~700 Mo de RAM pour qu'ArgoCD gère une seule application
- `-` **Écart avec l'amont** : Pangolin n'a pas de déploiement Kubernetes officiel (pas de chart Helm)
- `-` **Contournement de l'abstraction réseau** : Gerbil exige `hostNetwork: true`, ce qui annule les bénéfices du
  réseau Kubernetes
- `-` **Incohérence d'OS** : Ubuntu sur `kazimierz` contre Talos Linux sur les autres clusters
- `-` **Aucune réutilisation de composants** : aucun composant d'infrastructure partagé avec les autres clusters
- `-` **Charge de maintenance** : les manifestes sur mesure divergent des mises à jour amont de Pangolin
- `-` **Surcharge de complexité** : plusieurs couches (K8s + Docker + Compose) pour un déploiement mono-application

### Option 2 : Ansible + Docker Compose

> **Statut : ACCEPTÉE**

Utiliser Ansible pour la gestion de configuration, avec le déploiement officiel de Pangolin par Docker Compose.

**Pile technologique (Ansible) :**

_Note : l'automatisation GitOps `ansible-pull` (minuteur systemd de 15 minutes) listée ci-dessous et l'avantage « GitOps
maintenu » ont été supprimés le 2026-10-07 ; le playbook est désormais lancé à la main. Voir
[Changement postérieur à la mise en œuvre](#changement-postérieur-à-la-mise-en-œuvre--suppression-dansible-pull-2026-10-07)._

- **Gestion de configuration** : Ansible pour le provisionnement du système et le déploiement de l'application
- **Automatisation GitOps** : `ansible-pull` via un minuteur systemd (intervalles de 15 minutes)
- **Déploiement de l'application** : le `docker-compose.yml` officiel de Pangolin, issu de l'amont
- **Réseau** : le réseau Docker direct, avec manipulation native d'iptables
- **Base de données** : un conteneur PostgreSQL standard issu de Docker Hub
- **Gestion des secrets** : des variables Ansible avec des fichiers vault chiffrés

Avantages et inconvénients :

- `+` **Alignement avec l'amont** : utilise le `docker-compose.yml` officiel de Pangolin, maintenu par l'amont
- `+` **Efficacité des ressources** : le démon Docker consomme moins de 256 Mo de RAM contre \~1 Go pour le plan de
  contrôle Kubernetes
- `+` **Accès natif à IPTables** : Gerbil manipule le routage sans abstraction Kubernetes
- `+` **Simplicité de débogage** : des commandes Docker standards (`docker-compose logs`, `docker ps`)
- `+` **GitOps maintenu** : `ansible-pull` fournit une infrastructure déclarative depuis Git
- `+` **Reconstruction rapide** : un seul playbook Ansible, contre un amorçage Kubernetes en plusieurs étapes
- `+` **Itération plus rapide** : un déploiement direct, sans boucle de réconciliation Kubernetes
- `+` **Complexité minimale** : moins de couches d'abstraction (ni scheduler K8s, ni opérateurs)
- `-` **Incohérence d'outillage** : un workflow de déploiement différent des autres clusters Arcane
- `-` **Pas de sondes de santé natives** : repose sur les politiques de redémarrage de Docker Compose plutôt que sur les
  sondes Kubernetes
- `-` **Gestion manuelle des secrets** : pas d'intégration d'External Secrets Operator avec OpenBao
- `-` **Pas de tableau de bord centralisé** : pas d'interface ArgoCD (journaux disponibles via `journalctl`)
- `-` **Limites de Docker Compose** : une orchestration moins sophistiquée que celle de Kubernetes

## Décision retenue

**Option retenue : « Ansible + Docker Compose » (option 2)**, parce qu'elle offre le meilleur équilibre entre
simplicité, efficacité des ressources et alignement avec l'architecture de Pangolin, tout en satisfaisant toutes les
exigences fonctionnelles du scénario de déploiement propre à `kazimierz`.

### Justification

### 1. Alignement avec l'architecture de Pangolin

La méthode de déploiement officielle de Pangolin est un `docker-compose.yml` maintenu par les développeurs amont.
L'adapter à Kubernetes introduit une charge de maintenance importante :

Adaptations nécessaires pour Kubernetes :

- des manifestes Kubernetes ou des charts Helm sur mesure (aucun chart officiel n'existe)
- la traduction du réseau Docker Compose en Services Kubernetes
- la recréation des mécanismes d'injection de variables d'environnement
- une gestion des secrets divergente de la documentation officielle
- une synchronisation continue avec les changements du `docker-compose.yml` amont

**Impact** : une charge de maintenance et un écart avec l'amont, qui augmentent le risque opérationnel et réduisent la
capacité à s'appuyer sur le support et la documentation de l'amont.

### 2. Exigences réseau de Gerbil

Gerbil (gestionnaire de tunnels WireGuard) exige une manipulation directe d'IPTables pour le routage des tunnels. C'est
techniquement possible dans Kubernetes avec `hostNetwork: true`, mais cette configuration :

- contourne entièrement les abstractions réseau de Kubernetes
- exige l'exécution de conteneurs privilégiés
- annule les network policies de Kubernetes (l'isolation de sécurité est perdue)
- ajoute de la complexité inutile sans bénéfice fonctionnel
- est nettement plus simple avec le réseau Docker standard

**Impact** : le modèle réseau de Kubernetes n'apporte aucune valeur à Gerbil, tout en ajoutant de la complexité
d'exploitation.

### 3. Aucune réutilisation de composants

`kazimierz` fonctionne en isolation complète des autres clusters Arcane, sans aucun composant d'infrastructure partagé :

Pas de réseau partagé :

- aucune communication entre clusters (hors tunnels WireGuard)
- aucune intégration de service mesh
- aucun contrôleur d'ingress partagé

Pas de GitOps partagé :

- non géré par l'ArgoCD d'`amiya` (infrastructure différente)
- une implémentation GitOps autonome est nécessaire
- aucune gestion centralisée des applications

Peu de composants d'infrastructure partagés :

- `cert-manager` : utilisé
- `cloudnative-pg` : utilisé
- `envoy-gateway` : non utilisé (Pangolin gère le routage)
- `external-secrets` : aucune intégration OpenBao prévue

**Impact** : l'architecture Kubernetes n'apporte que peu d'avantages de réutilisation de composants.

### 4. Gaspillage de ressources d'un ArgoCD autonome

Faire tourner ArgoCD sur `kazimierz` pour une seule application Docker Compose :

Coût en ressources :

- installation d'ArgoCD : \~700 Mo de RAM
- plan de contrôle Kubernetes : \~1 Go de RAM (en plus)
- **Total** : \~1,7 Go de RAM (42,5 % du VPS de 4 Go)

Valeur apportée :

- gestion d'une seule application Docker Compose
- aucun bénéfice de visualisation de la carte des applications (une seule application)
- aucune valeur de gestion multi-cluster
- l'accès au tableau de bord exige un proxy SSH ou Tailscale

**Alternative** : `ansible-pull` + `journalctl` fournit une fonctionnalité GitOps équivalente pour une charge faible.

**Impact** : 25 à 40 % des ressources du VPS consommés pour une valeur d'exploitation minime.

### 5. Inadéquation du contexte d'exploitation

Autres clusters Arcane (`amiya`, `lungmen`) :

- **Système d'exploitation** : Talos Linux (immuable, natif Kubernetes)
- **Modèle de charge** : plusieurs applications avec une infrastructure partagée
- **Modèle GitOps** : gestion centralisée par ArgoCD depuis `amiya`
- **Profil de ressources** : du matériel dédié, de capacité suffisante

Cluster `kazimierz` :

- **Système d'exploitation** : couramment Ubuntu Server (OS standard, modifiable)
- **Modèle de charge** : un déploiement mono-pile (Pangolin + dépendances)
- **Modèle GitOps** : une automatisation autonome (sans gestion centralisée)
- **Profil de ressources** : un VPS de 4 Go avec des contraintes de ressources strictes

**Impact** : imposer un déploiement Kubernetes contredit les contraintes de conception du cluster et ses exigences
d'exploitation.

---

## Conséquences

### Positives

_Note : l'élément « GitOps maintenu » ci-dessous ne tient plus depuis le 2026-10-07 : `ansible-pull` a été supprimé et
la configuration n'est appliquée que lorsque l'opérateur lance le playbook._

- (+) **Efficacité des ressources** : économie de \~750 Mo de RAM (démon Docker < 256 Mo contre \~1 Go pour le plan de
  contrôle Kubernetes)
- (+) **Simplicité d'exploitation** : des commandes Docker Compose standards pour le débogage et la gestion
- (+) **Alignement avec l'amont** : utilise le `docker-compose.yml` officiel de Pangolin, maintenu par les développeurs
  amont
- (+) **GitOps maintenu** : le minuteur systemd `ansible-pull` fournit une infrastructure déclarative depuis le dépôt
  Git
- (+) **Itération plus rapide** : un déploiement direct, sans boucle de réconciliation Kubernetes ni charge d'opérateurs
- (+) **Accès réseau natif** : Gerbil manipule IPTables sans abstraction du réseau Kubernetes
- (+) **Reconstruction rapide** : un seul playbook Ansible (\~10 minutes) contre un amorçage Kubernetes en plusieurs
  étapes
- (+) **Investigation simplifiée** : l'outillage Docker standard pour la réponse aux incidents et l'analyse de sécurité
- (+) **Surface d'attaque réduite** : un minimum de composants système par rapport à une pile Kubernetes complète
- (+) **Charge de maintenance réduite** : moins de pièces mobiles et de couches d'abstraction à maintenir

### Négatives

- (-) **Incohérence d'outillage** : un workflow de déploiement différent des autres clusters Arcane (docker-compose
  contre kubectl)
- (-) **Gestion manuelle des secrets** : pas d'intégration d'External Secrets Operator avec OpenBao (repose sur les
  variables Ansible)
- (-) **Pas de tableau de bord centralisé** : pas d'interface ArgoCD pour visualiser les déploiements (journaux
  disponibles via `journalctl`)
- (-) **Limites de Docker Compose** : des fonctions d'orchestration moins sophistiquées que celles de Kubernetes
- (-) **Observabilité limitée** : pas d'intégration native des métriques et de la supervision Kubernetes
- (-) **Fragmentation des connaissances** : les opérateurs doivent maintenir une expertise à la fois sur Kubernetes et
  sur Ansible/Docker Compose

### Neutres

- (\~) **Politiques de redémarrage Docker** : un remplacement acceptable des sondes liveness/readiness de Kubernetes
  pour un déploiement mono-application
- (\~) **Journalisation d'ansible-pull** : un remplacement suffisant du tableau de bord ArgoCD pour un déploiement
  mono-application (disponible via `journalctl`)
- (\~) **iptables + réseaux Docker** : un remplacement acceptable des network policies Kubernetes, vu l'isolation du VPS
- (\~) **Variables Ansible pour les secrets** : acceptable pour un déploiement mono-nœud sans besoin de gestion
  distribuée des secrets

---

## Détails de mise en œuvre et état

### Choix de l'outil de gestion de configuration

**Décision** : Ansible retenu face aux alternatives (pyinfra, SaltStack, Chef/Puppet)

**Pourquoi Ansible** :

- `ansible-pull` natif pour le GitOps (aucune logique cron sur mesure à écrire)
- un écosystème riche : les rôles `community.docker`, `geerlingguy.docker`, `artis3n.tailscale`
- cohérence avec les autres clusters Arcane (outillage unifié)
- une stabilité éprouvée en production et une documentation abondante

### Modèle d'automatisation GitOps

> [!CAUTION]\
> Obsolète depuis le 2026-10-07 : le service et le minuteur systemd `ansible-pull` (rôle `gitops_automation`) et les
> notifications Slack des exécutions ont été supprimés. La section ci-dessous, la phase d'amorçage « Mise en place du
> GitOps » et le risque « Échec d'ansible-pull » décrivent uniquement la conception d'origine. Les mises à jour
> automatiques de l'OS sont inchangées ; ARA a été supprimé plus tard (2026-10-08).

**Outil** : `ansible-pull` avec un minuteur systemd (intervalle de 15 minutes)

**Workflow** :

1. Le minuteur systemd déclenche `ansible-pull` périodiquement
2. Le dépôt est cloné ou mis à jour automatiquement
3. L'exécution du playbook applique l'état souhaité si Git a changé
4. Les journaux sont disponibles via `journalctl` pour l'audit

### Composants de déploiement

_Note : obsolète depuis le 2026-10-08 : ARA (le rôle `ara_server` et son listener Tailscale Serve) a aussi été supprimé,
ce qui laisse trois phases en pratique._

**Amorçage en 4 phases** :

1. **Installation du système** : Docker, VPN Tailscale, pare-feu UFW, mises à jour automatiques
2. **Mise en place du GitOps** : installation d'Ansible, service et minuteur systemd `ansible-pull`, collections Galaxy
3. **Observabilité** : ARA Records Ansible pour suivre les exécutions de playbooks (HTTPS Tailscale Serve), supprimé le
   2026-10-08, voir
   [Changement postérieur à la mise en œuvre](#changement-postérieur-à-la-mise-en-œuvre--suppression-dansible-pull-2026-10-07)
4. **Pile applicative** : Pangolin + Gerbil + Traefik par un rôle Ansible sur mesure

### Risques et atténuations

- **Échec d'ansible-pull** : minuteur systemd configuré avec une logique de reprise ; procédure d'exécution manuelle du
  playbook documentée.
- **Défaillance du démon Docker** : configuration du service systemd avec redémarrage automatique ; supervision de santé
  par le watchdog systemd.
- **Changements amont de Pangolin** : épingler l'image de conteneur Pangolin ; suivre les notifications de version ;
  tester les changements amont en environnement de développement.
- **Compromission du VPS** : philosophie d'infrastructure sacrificielle ; reconstruction rapide grâce à un seul playbook
  Ansible.

---

## Évolution de la décision

### Difficultés de mise en œuvre rencontrées (8 itérations majeures)

1. Restructuration du projet : Pangolin passe de docker-compose à des manifestes Kubernetes
2. Migration de Traefik : des manifestes bruts à un déploiement par chart Helm
3. Séparation de Gerbil : du pod Traefik groupé à un déploiement autonome
4. Migration de CNPG : d'OCIRepository au chart Helm officiel
5. Modernisation des sauvegardes : de `barmanObjectStore` intégré au plugin Barman Cloud
6. Ajout de CrowdSec : un moteur de sécurité complet avec intégration du bouncer Traefik
7. Ajout de cert-manager : automatisation des certificats TLS avec Let's Encrypt
8. Pivot final : abandon complet de l'approche Kubernetes

### Changement postérieur à la mise en œuvre : suppression d'`ansible-pull` (2026-10-07)

La décision de fond (Ansible + Docker Compose sur un VPS plutôt que Kubernetes) est inchangée. Seul l'élément GitOps à
tirage automatique a été abandonné : l'auto-synchronisation `ansible-pull` (service systemd + minuteur de 15 minutes,
rôle `gitops_automation`) et les notifications Slack des exécutions du playbook ont été retirés de `kazimierz.akn`. Le
playbook (`projects/kazimierz.akn/src/infrastructure/ansible/site.yml`, chemin qui n'existe plus depuis la bascule vers
NixOS) n'est plus lancé qu'à la main depuis une machine d'opérateur, en SSH
(`ansible-playbook -i inventory/remote.yml site.yml`), le mot de passe Ansible Vault étant lu depuis le fichier
`.vault-password.sops` chiffré avec sops.

**Pourquoi** : selon l'appréciation du propriétaire, la boucle GitOps à tirage automatique était élégante mais
n'apportait rien en pratique et était complexe à maintenir. Deux incidents observés le 2026-10-07, lors du ré-amorçage
du VPS après un changement imprévu de l'image d'OS vers Ubuntu 26.04, le confirment :

- Le rôle dépendait du PPA d'Ansible, dont la clé de signature n'a pas pu être récupérée sur cette version, ce qui a
  fait échouer toute l'exécution.
- Le rôle écrivait le mot de passe Ansible Vault en clair sur l'hôte (`/root/.local/ansible/vault-secret`), un secret
  qui n'a plus besoin de se trouver sur le VPS.

**Compromis accepté** : il n'y a plus de correction automatique de la dérive. Les changements de configuration ne
prennent effet que lorsque l'opérateur relance le playbook.

**ARA supprimé (2026-10-08)** : à la suite de la revue du propriétaire sur la PR 1262, ARA (Ansible Run Analysis, le
rôle `ara_server` et son listener Tailscale Serve dédié sur le port 10000) a lui aussi été supprimé : il n'est plus
nécessaire. Tailscale Serve reste utilisé par le rôle `pangolin` pour exposer l'API d'intégration de Pangolin sur le
tailnet.

**Pas de mise à jour automatique non plus sous NixOS (2026-10-10)** : `kazimierz.akn` (et `rimbilliton.akn`) sont passés
à NixOS, avec `nixos-rebuild` lancé à la main (PR 1304), et `system.autoUpgrade` est volontairement laissé désactivé.
Aucune des deux instances n'est encore supervisée, donc une mauvaise mise à jour non surveillée passerait inaperçue, et
le retour arrière est complexe. À réexaminer une fois les instances supervisées.

### Leçons apprises

### Quand Kubernetes a du sens

- **Plusieurs applications nécessitant de l'orchestration** : déploiement et mise à l'échelle coordonnés de nombreux
  services
- **Composants d'infrastructure partagés** : opérateurs, service meshes et piles d'observabilité réutilisables
- **Exigences d'ordonnancement avancées** : allocation de ressources, règles d'affinité, politiques de placement des
  pods
- **Gestion GitOps centralisée** : gestion multi-cluster (comme `amiya` → `lungmen`)
- **Exigences de haute disponibilité** : clusters multi-nœuds avec basculement automatique
- **Exigences réseau complexes** : service mesh, network policies, routage avancé

### Quand Docker Compose + Ansible a du sens

- **Déploiements mono-pile** : une application principale avec un minimum de dépendances (comme `kazimierz` + Pangolin)
- **Docker Compose d'abord côté amont** : la méthode de déploiement officielle est un `docker-compose.yml`
- **Environnements contraints en ressources** : RAM/CPU limités, où la surcharge de Kubernetes est significative
- **Besoin de réseau hôte** : manipulation directe d'IPTables ou du réseau système (comme Gerbil)
- **Infrastructure isolée** : aucune dépendance entre clusters ni composant partagé

---

## Historique des modifications

- _2026-10-11_ : **CLARIFICATION** : Statut conservé à `implemented`. Preuves : l'ADR-016 déclare ne supplanter que le
  choix de gestion de configuration de l'ADR-008 (« This supersedes only the configuration-management choice ») et
  maintient la décision contre Kubernetes ; `projects/kazimierz.akn/src/infrastructure/` ne contient plus que `nixos/`
  et `pulumi/`, donc le chemin `src/infrastructure/ansible/site.yml` n'existe plus. Le bandeau de tête est remplacé par
  une note datée qui distingue ce qui reste valable de ce qui est supplanté ; `date` mise à jour.
- _2026-10-11_ : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections renommées,
  sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, `template-version`
  ajouté, statut explicite ajouté à l'option 1 d'après le texte de la décision, émojis retirés, avertissements
  `> [!CAUTION]` ramenés à trois au plus (les autres deviennent des notes en italique), lien vers le guide d'amorçage
  mis à jour. Décision, options, chronologie et dates inchangées.
- _2026-10-10_ : **DEPRECATION** : Le choix de gestion de configuration (Ansible + Docker Compose) est supplanté par
  l'[ADR-016](./016-kazimierz-nixos-over-ansible.md) (NixOS via `nixos-anywhere` et `sops-nix`) ; le code Ansible a été
  supprimé. Statut conservé à `implemented` : la décision Kubernetes contre VPS reste valable. Les passages sur Ansible
  et le lien vers l'ancien README Ansible de `kazimierz` (désormais supprimé, voir l'historique Git) sont conservés
  comme historique.
- _2026-10-08_ : **DEPRECATION** : Suppression d'ARA (le rôle `ara_server` et son listener Tailscale Serve) : plus
  nécessaire, d'après la revue du propriétaire sur la PR 1262. Statut conservé à `implemented`. Le passage d'origine sur
  l'observabilité est conservé et signalé.
- _2026-10-07_ : **DEPRECATION** : Suppression de l'auto-synchronisation `ansible-pull` (service systemd + minuteur de
  15 minutes, rôle `gitops_automation`) et des notifications Slack des exécutions ; le playbook est désormais lancé à la
  main depuis une machine d'opérateur. Statut conservé à `implemented` : la décision Ansible + Docker Compose tenait
  encore. Les passages GitOps d'origine sont conservés et signalés.
- _2026-05-24_ : **CHORE** : Renommage de `consulted` en `assisted-by` dans le front matter ; suppression du préfixe
  `ai/` des identifiants de modèles.
- _2026-03-19_ : **CHORE** : Migration de l'ADR vers le nouveau front matter YAML et le nouveau format de gabarit.
- _2025-11-16_ : **VALIDATED** : Décision d'architecture validée par la mise en œuvre.
- _2025-01-13_ : **ACCEPTED** : Décision acceptée après plusieurs tentatives de déploiement sur Kubernetes.

---

## Pour aller plus loin

- [ADR-016 NixOS plutôt qu'Ansible pour Kazimierz](./016-kazimierz-nixos-over-ansible.md) : l'ADR qui supplante le choix
  de gestion de configuration de cette décision.
- [Initialiser Kazimierz](../guides/Initialiser-Kazimierz.md) : la mise en place actuelle du serveur, sous NixOS.
- [Initialiser Rimbilliton](../guides/Initialiser-Rimbilliton.md) : l'hôte OCI de référence dont le modèle NixOS a été
  repris.
- [Archive : migration de Kazimierz vers NixOS](../archives/Migration-de-Kazimierz-vers-NixOS.md) : le compte rendu de
  la bascule d'Ansible vers NixOS.
- [Archive : réflexion sur le déploiement Kubernetes de Kazimierz](../archives/Reflexion-sur-le-Deploiement-Kubernetes-de-Kazimierz.md)
  : les tentatives Kubernetes qui ont précédé cette décision.
- [Archive : intégration de CrowdSec dans Kazimierz](../archives/Integration-de-CrowdSec-dans-Kazimierz.md) :
  l'intégration de CrowdSec évoquée parmi les itérations.
- [Documentation de Pangolin](https://github.com/fosrl/pangolin) : le projet amont et son déploiement officiel par
  Docker Compose.
- [Documentation d'Ansible](https://docs.ansible.com/) et
  [`ansible-pull`](https://docs.ansible.com/ansible/latest/cli/ansible-pull.html) : les outils de la conception
  d'origine.
- [ARA Records Ansible](https://ara.recordsansible.org/) : l'outil d'observabilité supprimé le 2026-10-08.
- Rôles et collections Ansible utilisés à l'origine :
  [geerlingguy.docker](https://github.com/geerlingguy/ansible-role-docker),
  [artis3n.tailscale](https://github.com/artis3n/ansible-role-tailscale),
  [community.general](https://docs.ansible.com/ansible/latest/collections/community/general/),
  [community.docker](https://docs.ansible.com/ansible/latest/collections/community/docker/).
