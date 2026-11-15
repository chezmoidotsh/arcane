# Architecture du dépôt Reference

Organisation cible du dépôt : ce qui va dans `catalog/`, `fleet/`, `policies/` et `docs/`, comment un élément de la
flotte est agencé, et comment OpenBao suit cette organisation. Cette page est la source de vérité de l'arborescence ;
les noms des machines sont dans [Nommage des machines](Nommage-des-Machines-Reference.md), la raison du choix dans
[ADR-021](../decisions/ADR-021-Passer-d-une-Vue-Projet-a-une-Vue-Flotte.md).

## Découpage de la racine

| Dossier     | Rôle                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `catalog/`  | Ce qui est partagé et réutilisable : bases Kubernetes, charts, modules et images Nix, composants Pulumi |
| `fleet/`    | Tout élément déployé : clusters, machines, fondation commune                                            |
| `policies/` | Les politiques de validation en CI (OPA)                                                                |
| `docs/`     | La documentation, source du wiki                                                                        |
| Autres      | `.agents/`, `.github/`, `.mise/`, `.rtunk/`, `scripts/`                                                 |

## `fleet/` : un dossier par élément

Le dépôt décrit des éléments de la flotte, pas des projets. **Un service appartient à exactement un élément** ; un
élément porte plusieurs services. La ressource côté consommateur d'un service (par exemple le client OIDC d'une
application) vit avec le consommateur.

| Dossier           | Contenu                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet/hosts/`    | Machines configurées individuellement (animaux de compagnie) : configuration du système, de la plateforme, et leur Pulumi propre. Une machine peut porter plusieurs rôles.              |
| `fleet/clusters/` | Clusters Kubernetes : des animaux de compagnie faits de bétail. Les nœuds Talos gérés par Omni ne sont jamais listés individuellement.                                                  |
| `fleet/base/`     | Ressources liées à aucune machine (Cloudflare, Tailscale, B2, groupes Pocket-Id globaux). Le nom `base` évite la confusion avec la famille `core` ; son projet Pulumi s'appelle `base`. |

Le nom de chaque dossier suit la règle de [Nommage des machines](Nommage-des-Machines-Reference.md), qui contient aussi
l'inventaire des éléments.

### Agencement d'un élément

Dans un élément, les sous-dossiers portent le nom de l'outil qui les consomme (`kubernetes/`, `nix/`, `pulumi/`, …) : un
seul glob par outil pour ArgoCD et, plus tard, pour un Pulumi Operator.

| Élément | Contenu                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cluster | `omni/` (modèle de cluster), `kubernetes/{src,dist}/{apps,system}/`, `pulumi/`, `README.md`, `architecture.d2`, `assets/`, `.mise.toml`, `.mise/`. `akn.rhodes` ajoute `kubernetes/{src,dist}/argocd/` : c'est le hub ArgoCD. |
| Hôte    | `nix/`, `pulumi/`, `fs/` pour les fichiers installés à la main, `mise/` pour le code de déploiement exécuté par mise, `README.md`, `.mise.toml`, `.mise/`.                                                                    |

- Le dossier `nix/` couvre NixOS, nix-darwin et les images de LXC : un outil, un nom de dossier, et le flake dit quel
  système il construit.
- `mise/` contient le code de déploiement que mise exécute (quand mise installe le code sur la machine), `.mise/`
  contient l'outillage (tâches, configuration des outils).
- Les espaces de noms suivent la convention `system/<x>` pour l'espace de noms `<x>-system`.
- Le modèle `src/` puis `dist/` de l'[ADR-011](../decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md)
  s'applique : un `dist/` par cluster, jamais modifié à la main (`dist:render`).
- Un élément ne garde que son README, son diagramme d'architecture et les références générées. Les documents longs
  restent dans `docs/`.

## `catalog/` : le partagé

**Un composant système déployé sur deux clusters ou plus a sa base partagée dans `catalog/kubernetes/<x>/`.** Un
composant utilisé par un seul élément vit chez lui. Un lint de structure vérifie la règle.

| Dossier               | Contenu                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `catalog/kubernetes/` | Bases Kustomize et valeurs Helm de référence des composants système déployés sur deux clusters ou plus |
| `catalog/helm/`       | Charts partagés                                                                                        |
| `catalog/nix/`        | Flake, images OCI (`images/`), modules (`modules/`), paquets (`pkgs/by-name/`)                         |
| `catalog/omni/`       | Modèle de cluster de base, classes de machines, manifestes d'amorçage Talos (`manifests/`)             |
| `catalog/pulumi/`     | Composants, bibliothèque et SDK Pulumi                                                                 |

## `policies/` : la validation en CI

Les politiques OPA vivent dans `policies/opa`, à plat pour éviter le doublon `policies/opa/policies/` : les fichiers
`.rego` (et leurs tests) directement sous `policies/opa/`, les fiches de règles dans `policies/opa/rules/`, le README à
côté. conftest ne lit que les fichiers `.rego`.

## OpenBao

| Montage ou préfixe     | Rôle                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `<nom canonique>/`     | Un montage KV v2 par cluster, nommé d'après le cluster (`rhodes.akn/`, `lungmen.akn/`)                                              |
| `hosts/`               | Un montage générique pour les hôtes, avec un préfixe par hôte au nom canonique (`hosts/closure.akn/…`) et une politique par préfixe |
| `shared/`, `personal/` | Montages partagé et personnel                                                                                                       |

> [!NOTE]\
> Un montage par machine serait disproportionné pour deux ou trois secrets. La convention détaillée (chemins,
> métadonnées, montages, politiques) vivra dans une page de référence dédiée au nommage dans Vault, à écrire ; en
> attendant, elle est dans l'[ADR-003](../decisions/ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) et
> l'[ADR-004](../decisions/ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md).

## Exemple d'arborescence

Exemple avec des noms génériques ; l'inventaire des éléments est dans
[Nommage des machines](Nommage-des-Machines-Reference.md).

```text
.
├── catalog/
│   ├── kubernetes/<composant>/     base partagée d'un composant système (deux clusters ou plus)
│   ├── helm/<chart>/
│   ├── nix/                        flake.nix, images/<image>/, modules/<module>/, pkgs/by-name/
│   ├── omni/                       clustertemplates/, machineclasses/, manifests/<composant>/
│   └── pulumi/                     components/, lib/, sdks/
├── policies/opa/                   *.rego, rules/, README.md
├── docs/
└── fleet/
    ├── base/pulumi/
    ├── clusters/
    │   └── <famille>.<nom>/        omni/, kubernetes/{src,dist}/{apps,system}/, pulumi/
    │       └── kubernetes/src/{apps/<application>,system/<composant>}/
    └── hosts/
        └── <famille>.<nom>/        nix/, pulumi/, fs/, mise/
```

Un cluster qui héberge ArgoCD ajoute `kubernetes/{src,dist}/argocd/`. Les sous-dossiers d'un hôte dépendent de ce qu'il
porte (`nix/`, `pulumi/`, `fs/`, `mise/`).

## Pour aller plus loin

- [Nommage des machines](Nommage-des-Machines-Reference.md) : la règle de nommage et l'inventaire des éléments.
- [Migrer vers la flotte](../migrations/MIGR-20261114-00-Migrer-vers-la-Flotte.md) : comment passer de `projects/` à
  `fleet/`.
- [ADR-021 Passer d'une vue projet à une vue flotte](../decisions/ADR-021-Passer-d-une-Vue-Projet-a-une-Vue-Flotte.md) :
  pourquoi ce changement et les options écartées.
- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](../decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md)
  : le modèle `src/` puis `dist/`.
- [ADR-002 Topologie des secrets OpenBao](../decisions/ADR-002-Topologie-des-Secrets-OpenBao.md) : les montages OpenBao
  que le montage `hosts/` complète.
