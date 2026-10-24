**[Accueil](Home.md)**

### Exploiter les clusters

- [Créer un cluster Talos avec Omni](procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md)
- [Mettre à jour Talos avec Omni](procedures/infrastructure/INF-20260525-00-Mettre-a-Jour-Talos-avec-Omni.md)
- [Mettre à jour Kubernetes avec Omni](procedures/infrastructure/INF-20260525-01-Mettre-a-Jour-Kubernetes-avec-Omni.md)
- [Mettre à jour un LXC par échange du rootfs](procedures/infrastructure/INF-20260605-00-Mettre-a-Jour-un-LXC-par-Echange-du-Rootfs.md)
- [Installer node-exporter sur Proxmox](procedures/infrastructure/INF-20260620-00-Installer-Node-Exporter-sur-Proxmox.md)
- [Provisionner le SDN Proxmox](procedures/infrastructure/INF-20260627-00-Provisionner-le-SDN-Proxmox.md)
- [Gérer l'état Pulumi et importer des ressources](procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
- [Désactiver le suivi de connexion des pools LB](procedures/infrastructure/INF-20260730-00-Desactiver-le-Suivi-de-Connexion-des-Pools-LB.md)
- [Initialiser Lungmen](guides/Initialiser-Lungmen.md)
- [Initialiser Kazimierz](guides/Initialiser-Kazimierz.md)
- [Initialiser Rimbilliton](guides/Initialiser-Rimbilliton.md)

### Reprendre après une panne

- [Plan de reprise après sinistre](plan-de-reprise/brouillon/Plan-de-Reprise-apres-Sinistre.md)
- [Restaurer Rhodes](plan-de-reprise/brouillon/Restaurer-Rhodes.md)
- [Restaurer OpenBao](plan-de-reprise/brouillon/Restaurer-OpenBao.md)
- [Restaurer Pocket-Id](plan-de-reprise/brouillon/Restaurer-Pocket-Id.md)
- [Restaurer CNPG depuis le stockage objet](procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md)
- [Restaurer un PVC Velero sous GitOps](procedures/backups/BKP-20260805-00-Restaurer-un-PVC-Velero-sous-GitOps.md)
- [Restaurer Minecraft depuis restic](procedures/backups/BKP-20261005-00-Restaurer-Minecraft-depuis-Restic.md)
- [Rétablir un cluster CNPG au WAL plein](procedures/databases/DB-20260530-00-Retablir-un-Cluster-CNPG-au-WAL-Plein.md)
- [Corriger l'erreur Expected empty archive de barman-cloud](procedures/databases/DB-20260530-01-Corriger-l-Erreur-Expected-Empty-Archive-de-barman-cloud.md)
- [Incidents](incidents/Index-des-Incidents.md)

### Référence

- [Architecture & Documentation Réseau](reference/Reseau-Reference.md)
- [Plan d'adressage (IPAM)](reference/IPAM-Reference.md)
- [Oripathy](reference/Oripathy-Reference.md)
- [Passerelles et DNS](reference/Passerelles-et-DNS-Reference.md)
- [Renovate](reference/Renovate-Reference.md)
- [Infrastructure manuelle](reference/Infrastructure-Manuelle-Reference.md)

### Post-mortems

- [Échec d'authentification Vault du ClusterSecretStore de Lungmen](incidents/Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md)
- [Saturation du disque de Zot](incidents/Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md)
- [ImagePullBackOff circulaire Kyverno et Zot sur Amiya](incidents/Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md)
- [Feature gate supprimée dans Kubernetes 1.35 sur Lungmen](incidents/Incident-2026-05-26-Feature-Gate-Supprime-Kubernetes-1-35-Lungmen.md)
- [Échec de la mise à jour de Cilium 1.19](incidents/Incident-2026-05-27-Echec-Mise-a-Jour-Cilium-1-19.md)
- [WAL plein sur le cluster CNPG apps-secured](incidents/Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md)
- [PushSecrets en 504 : NetworkPolicy de Vault](incidents/Incident-2026-05-30-PushSecrets-504-Vault-NetworkPolicy-Lungmen.md)
- [ImagePullBackOff de Redis : index Zot corrompu](incidents/Incident-2026-05-30-ImagePullBackOff-Redis-Index-Zot-Corrompu.md)
- [Dérive de l'agent Cilium et de la Gateway API sur Amiya](incidents/Incident-2026-05-31-Derive-Agent-Cilium-Gateway-API-NetworkPolicy-Amiya.md)
- [ArgoCD inaccessible : wildcard Cilium incohérent](incidents/Incident-2026-06-19-ArgoCD-Inaccessible-Wildcard-Cilium-Incoherent.md)

### Décisions d'Architecture

- [ADR-001 Gestion centralisée des secrets](decisions/ADR-001-Gestion-Centralisee-des-Secrets.md)
- [ADR-002 Topologie des secrets OpenBao](decisions/ADR-002-Topologie-des-Secrets-OpenBao.md)
- [ADR-003 Conventions de nommage des chemins OpenBao](decisions/ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md)
- [ADR-004 Conventions de nommage des politiques OpenBao](decisions/ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md)
- [ADR-005 Authentification OIDC par Envoy Gateway](decisions/ADR-005-Authentification-OIDC-par-Envoy-Gateway.md)
- [ADR-008 Ansible plutôt que Kubernetes pour Kazimierz](decisions/ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md)
- [ADR-009 Consolider les bases PostgreSQL](decisions/ADR-009-Consolider-les-Bases-PostgreSQL.md)
- [ADR-010 Remplacer Gitmoji par des symboles de type de commit](decisions/ADR-010-Remplacer-Gitmoji-par-des-Symboles-de-Type-de-Commit.md)
- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md)
- [ADR-012 Remplacer Kyverno par OPA](decisions/ADR-012-Remplacer-Kyverno-par-OPA.md)
- [ADR-013 Observabilité centralisée VictoriaMetrics sur LXC](decisions/ADR-013-Observabilite-Centralisee-VictoriaMetrics-sur-LXC.md)
- [ADR-014 Séparer le trafic des nœuds Talos du VLAN Homelab](decisions/ADR-014-Separer-le-Trafic-des-Noeuds-Talos-du-VLAN-Homelab.md)
- [ADR-015 Migrer Crossplane vers Pulumi](decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md)
- [ADR-016 NixOS plutôt qu'Ansible pour Kazimierz](decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md)
- [ADR-017 Conserver une phrase secrète Pulumi par projet](decisions/ADR-017-Conserver-une-Phrase-Secrete-Pulumi-par-Projet-et-Interdire-le-Partage-par-StackReference.md)

### Expérimentations

- [Proxmox CSI et CCM](experiments/Experimentation-2026-06-17-Proxmox-CSI-et-CCM.md)
- [Évaluation de Pulumi contre Crossplane](experiments/Experimentation-2026-07-02-Evaluation-Pulumi-contre-Crossplane.md)
- [Sauvegarde de PVC avec Velero](experiments/Experimentation-2026-08-03-Sauvegarde-de-PVC-avec-Velero.md)
- [Propriétés des applications ArgoCD](experiments/Experimentation-2025-01-10-Proprietes-des-Applications-ArgoCD.md)
- [ArgoCD en Zero Trust avec Tailscale](experiments/Experimentation-2025-03-12-ArgoCD-Zero-Trust-avec-Tailscale.md)

### Archives

- [ADR-007 Structure des projets et conventions de nommage](archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md)

- [Migrer Amiya vers Rhodes](archives/MIGR-20260729-00-Migrer-Amiya-vers-Rhodes.md)
- [Relier Lungmen au réseau Talosnet](archives/MIGR-20260801-00-Relier-Lungmen-au-Reseau-Talosnet.md)
- [Audit de la documentation](archives/AUDIT-20261011-00-Audit-de-la-Documentation.md)
- [Migrer les nœuds Talos du VLAN 2 au VLAN 5](archives/MIGR-20260628-00-Migrer-les-Noeuds-Talos-du-VLAN-2-au-VLAN-5.md)
- [Ajouter une SecurityPolicy OIDC sur une HTTPRoute](archives/SEC-20250808-00-Ajouter-une-SecurityPolicy-OIDC-sur-une-HTTPRoute.md)
- [Migration de Kazimierz vers NixOS](archives/Migration-de-Kazimierz-vers-NixOS.md)
- [Intégration de CrowdSec dans Kazimierz](archives/Integration-de-CrowdSec-dans-Kazimierz.md)
- [Réflexion sur le déploiement Kubernetes de Kazimierz](archives/Reflexion-sur-le-Deploiement-Kubernetes-de-Kazimierz.md)

9 other conflicted commits exist — scope with `but resolve conflicts <branch>`. Resolve with
`but resolve apply <path>[:<N>] --commit docs/balayage-final --ours|--theirs` or pipe mixed content into
`but resolve apply <path>:<N> --commit docs/balayage-final`. `but resolve --ai` resolves everything at once.
