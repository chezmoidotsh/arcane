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
- [Incidents](incidents/README.md)

### Référence

- [Architecture & Documentation Réseau](network/README.md)
- [Renovate](RENOVATE.md)
- [Décisions d'Architecture](decisions/001-centralized-secret-management.md)

### Archives

- [Migrer les nœuds Talos du VLAN 2 au VLAN 5](archives/MIGR-20260628-00-Migrer-les-Noeuds-Talos-du-VLAN-2-au-VLAN-5.md)
- [Ajouter une SecurityPolicy OIDC sur une HTTPRoute](archives/SEC-20250808-00-Ajouter-une-SecurityPolicy-OIDC-sur-une-HTTPRoute.md)
- [Migration de Kazimierz vers NixOS](archives/Migration-de-Kazimierz-vers-NixOS.md)
- [Intégration de CrowdSec dans Kazimierz](archives/Integration-de-CrowdSec-dans-Kazimierz.md)
- [Réflexion sur le déploiement Kubernetes de Kazimierz](archives/Reflexion-sur-le-Deploiement-Kubernetes-de-Kazimierz.md)

9 other conflicted commits exist — scope with `but resolve conflicts <branch>`. Resolve with
`but resolve apply <path>[:<N>] --commit docs/balayage-final --ours|--theirs` or pipe mixed content into
`but resolve apply <path>:<N> --commit docs/balayage-final`. `but resolve --ai` resolves everything at once.
