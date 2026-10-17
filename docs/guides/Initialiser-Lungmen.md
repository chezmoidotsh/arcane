# Initialiser Lungmen

Vérifié contre le dépôt le 2026-10-11 ; les commandes n'ont pas été rejouées pour cette migration.

## Version courte

`lungmen.akn` est provisionné de bout en bout par [Sidero Omni](https://omni.siderolabs.com), sans création manuelle de
VM ni `talosctl`. Ce guide donne les paramètres propres à `lungmen.akn` et ses écarts avec la
[procédure générique de création d'un cluster Talos avec Omni](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md),
dont `lungmen.akn` est l'exemple concret (voir aussi [`catalog/omni/README.md`](../../catalog/omni/README.md)).

```bash
# OMNICONFIG doit être renseigné (omnictl config new ou omnictl config add).
# Les machine classes doivent exister dans Omni (communes à tous les clusters).
mise run omni:machineclass:apply

cd projects/lungmen.akn

# Validation hors ligne du template
mise run omni:clustertemplate:validate

# Application et réconciliation du cluster (en ligne, authentifié)
omnictl cluster template sync -f src/infrastructure/omni/lungmen.clustertemplate.yaml

# Suivi de la convergence, puis kubeconfig
omnictl cluster status lungmen-akn
omnictl kubeconfig --cluster lungmen-akn ~/.kube/config-lungmen-akn
export KUBECONFIG=~/.kube/config-lungmen-akn
kubectl get nodes -o wide

# lungmen.akn est un spoke GitOps : enregistrement dans l'ArgoCD de rhodes.akn
argocd cluster add lungmen-akn --name lungmen.akn
```

Le cluster a été recréé de zéro après l'issue 1188 (qui remplace l'issue 1028) : `proxmox-csi-plugin` dès le départ,
sans Longhorn.

> [!NOTE]\
> Pour restaurer des données applicatives plutôt qu'amorcer un cluster vide, voir
> [`src/infrastructure/kubernetes/velero/`](../../projects/lungmen.akn/src/infrastructure/kubernetes/velero/). Les
> sauvegardes antérieures à la recréation portent la classe de stockage `longhorn` ; le `ConfigMap`
> `change-storage-class-config` la remappe vers `proxmox-lvmthin-ext4` à la restauration.

## Identité du cluster

| Paramètre             | Valeur                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Nom du cluster        | `lungmen-akn`                                                                                                                             |
| Fichier de template   | [`src/infrastructure/omni/lungmen.clustertemplate.yaml`](../../projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml) |
| CIDR de Pod (ADR-014) | `172.30.32.0/19` (cluster ID 2, voir l'[IPAM](../reference/IPAM-Reference.md))                                                            |
| CIDR de Service / DNS | `172.31.0.0/19` / `172.31.0.10` (communs à tous les clusters, à ne pas modifier)                                                          |
| Control plane         | `c1.minimal` × 1                                                                                                                          |
| Workers               | `w1.large` × 3                                                                                                                            |
| Rôle GitOps           | Spoke : enregistré dans l'ArgoCD hub de `rhodes.akn`, sans installation ArgoCD locale                                                     |

Le template `lungmen.clustertemplate.yaml` est une copie complète et autonome de
[`catalog/omni/clustertemplates/base.yaml`](../../catalog/omni/clustertemplates/base.yaml) : les templates Omni ne se
composent pas avec `kustomize` (voir le commentaire d'en-tête de ce fichier). Les écarts propres à `lungmen.akn` se
modifient donc directement dans le template.

## Avant de commencer

- `omnictl`, `kubectl` et `argocd`, installés par `mise install` (le `.mise.toml` à la racine fixe la version
  d'`omnictl`).
- Une authentification Omni : `OMNICONFIG` renseigné par `omnictl config new` ou `omnictl config add`.
- Les machine classes appliquées dans Omni (`mise run omni:machineclass:apply` depuis la racine du dépôt). Ce sont des
  ressources COSI communes, hors du template de cluster, perdues si Omni est réinitialisé.
- Un accès à l'ArgoCD de `rhodes.akn` (le hub GitOps) pour l'enregistrement du cluster, voir la
  [topologie hub et spoke](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#topologie-gitops-hub-et-spoke).
- La stack Pulumi du projet
  ([`src/infrastructure/pulumi/stack/proxmox.ts`](../../projects/lungmen.akn/src/infrastructure/pulumi/stack/proxmox.ts))
  livre l'identité du Proxmox CCM/CSI : ce n'est pas une étape manuelle. Elle s'applique quand le cluster est `Ready`,
  avant le déploiement de `dist/infrastructure/kubernetes/proxmox/`.

## Étapes

Suivre la procédure générique en entier, avec le tableau d'identité ci-dessus. Les numéros d'étape renvoient à cette
procédure.

1. **Machine classes** (étape 1) : à appliquer une fois, communes à tous les clusters.
2. **Identité du cluster** (étape 2) : déjà allouée (cluster ID 2, `172.30.32.0/19`). Une nouvelle allocation n'est
   nécessaire que si le template est recréé.
3. **Template** (étape 3) : existe déjà. Modifier `lungmen.clustertemplate.yaml` sur place au lieu d'en créer un
   nouveau.
4. **Accessibilité du SHA** (étape 4) : à vérifier avant la synchronisation si le SHA des manifests de bootstrap du
   template a changé.
5. **Validation hors ligne** (étape 5) : `mise run omni:clustertemplate:validate`.
6. **Application** (étape 6) : `omnictl cluster template sync -f src/infrastructure/omni/lungmen.clustertemplate.yaml`.
7. **Convergence et kubeconfig** (étapes 7 et 8).
8. **Identité Proxmox CCM/CSI** (étape 9) : appliquer la stack Pulumi du projet, voir « Avant de commencer ».
9. **CSI et CCM** (étape 10) : déployer depuis `dist/infrastructure/kubernetes/proxmox/`.
10. **Enregistrement en spoke** (étape 11) dans le hub de `rhodes.akn` :

    ```bash
    argocd cluster add lungmen-akn --name lungmen.akn
    ```

    Une fois le cluster enregistré, les ApplicationSets d'ArgoCD prennent en charge tout `dist/apps/` et le reste de
    `dist/infrastructure/kubernetes/` (voir le
    [README du projet](../../projects/lungmen.akn/README.md#usage-and-development)).

11. **Liste de validation** CNI/CSI/CCM : la dérouler dans la procédure générique
    ([liste de validation](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#liste-de-validation))
    avant d'ouvrir le cluster au trafic applicatif.

L'application du template est détaillée à
l'[étape 6 de la procédure](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#étape-6--appliquer-le-template-de-cluster).

## Après l'amorçage

- Les manifests suivent le chemin `src/` vers `dist/` (généré par `dist:render`) vers ArgoCD. `dist/` ne s'édite jamais
  à la main (voir le [README du projet](../../projects/lungmen.akn/README.md#usage-and-development)).
- `lungmen.akn` dépend du cluster de plateforme `rhodes.akn` pour OpenBao (secrets, via External Secrets Operator) et
  Pocket-Id (OIDC/SSO). Les deux doivent être joignables pour que les ExternalSecrets et les routes protégées par SSO
  deviennent sains.

## Historique

- _2026-10-11_ : Migration vers le standard de documentation (issue #1257) : page traduite en français, déplacée dans
  `docs/guides/`, bloc `<details>` remplacé par la section « Version courte ».
- _2026-10-11_ : Corrections vérifiées contre le dépôt. La remarque sur le remappage Velero citait
  `proxmox-lvmthin-ext4` et `proxmox-lvmthin-xfs` ; `change-storage-class.configmap.yaml` ne remappe que `longhorn` vers
  `proxmox-lvmthin-ext4`. La mention d'un `TODO` de l'étape 9 de la procédure générique pour les autres clusters est
  retirée : la procédure liste désormais les programmes Pulumi de `rhodes.akn` et de `lungmen.akn`.

## Pour aller plus loin

- [Créer un cluster Talos avec Omni](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : la
  procédure générique dont ce guide est l'exemple concret.
- [Catalogue Omni](../../catalog/omni/README.md) : templates de base et machine classes partagés.
- [README de `lungmen.akn`](../../projects/lungmen.akn/README.md) : services, développement et reprise après sinistre du
  cluster.
- [IPAM](../reference/IPAM-Reference.md) : allocation des CIDR de Pod par cluster.
