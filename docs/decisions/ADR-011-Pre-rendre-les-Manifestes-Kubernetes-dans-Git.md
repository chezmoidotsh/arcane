---
status: "implemented"
date: 2026-10-11
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6"]
informed: []
template-version: "2.0.0"
---

# ADR-011 Pré-rendre les manifestes Kubernetes dans Git

## Contexte et problème

ArgoCD est le seul moteur GitOps de tous les clusters de ce homelab. Il synchronise l'état du cluster en lisant des
répertoires sources de ce dépôt et, pour les composants qui utilisent la directive `helmCharts:` de Kustomize, il
télécharge les archives de charts Helm depuis des registres amont à chaque cycle de synchronisation. C'est le mode de
fonctionnement par défaut, « rendu au moment de la synchronisation », recommandé par le projet Argo et largement adopté
dans l'industrie.

En pratique, ce mode cumule deux problèmes.

**Surface d'attaque de la chaîne d'approvisionnement au moment de la synchronisation.** Chaque synchronisation ArgoCD
qui inclut une source `helmCharts:` émet une requête réseau en direct vers un registre externe :
`https://helm.cilium.io/`, `https://charts.longhorn.io/`, `https://argoproj.github.io/argo-helm/` et une douzaine
d'autres. Un détournement DNS, une fuite de route BGP, la compromission d'un registre ou la réécriture d'un tag OCI
mutable entre deux synchronisations pourrait injecter dans le cluster un rendu malveillant sans laisser de trace dans
Git. Les garanties d'intégrité du dépôt Git s'arrêtent à la version épinglée dans `kustomization.yaml` ; elles ne
s'étendent pas à l'archive que cette version désigne à l'exécution. Deux synchronisations du même commit peuvent même
produire des états de cluster différents si le registre amont modifie un tag, ce qui compromet la reproductibilité et
l'auditabilité : le dépôt n'est plus l'unique source de vérité du modèle GitOps.

**Différences de ressources invisibles lors des mises à jour de charts.** Quand Renovate ouvre une PR pour monter la
version d'un chart (par exemple `longhorn 1.6.2 → 1.7.0`), le seul changement visible dans le diff est une chaîne de
version d'une ligne dans `kustomization.yaml`. Le véritable delta de ressources Kubernetes (nouvelles CRD, règles RBAC
modifiées, arguments de conteneur ajoutés, ServiceAccounts supprimés) reste invisible pour les relecteurs. Il devient
impossible de mener une revue de sécurité sérieuse des mises à jour de charts, ce qui pose problème surtout pour les
composants d'infrastructure du cluster comme Cilium, Longhorn ou ArgoCD lui-même.

La question stratégique à laquelle cet ADR répond est la suivante : **comment supprimer entièrement les téléchargements
Helm à l'exécution, afin qu'ArgoCD n'applique que du contenu entièrement auditable dans Git, tout en préservant
l'automatisation des mises à jour et le flux de travail GitOps ?**

## Facteurs de décision

- **Exigences fonctionnelles** :
  - ArgoCD doit atteindre l'état `Synced / Healthy` à partir du seul contenu de Git, sans téléchargement de chart à la
    synchronisation pour les applications sans SOPS.
  - Une montée de version de chart doit produire un `git diff` lisible des changements réels de ressources Kubernetes
    qui seront appliqués au cluster.
  - Un mécanisme de pré-commit doit empêcher de commiter un rendu périmé lorsque les sources changent.
  - Les secrets chiffrés avec SOPS ne doivent jamais apparaître en clair dans un fichier commité.
  - Les motifs de découverte existants des ApplicationSets ArgoCD doivent continuer à fonctionner, sans gestion manuelle
    d'objets Application.

- **Exigences non fonctionnelles** :
  - La frontière de confiance doit s'arrêter à la limite du dépôt Git : aucun appel réseau à l'exécution vers des
    registres externes pour des ressources déjà connues au moment du commit.
  - Rendu idempotent : exécuter deux fois l'étape de rendu sur les mêmes sources doit produire une sortie identique à
    l'octet près.
  - L'historique Git des répertoires `dist/` constitue un enregistrement auditable de chaque état de ressources
    Kubernetes appliqué au cluster.
  - Les performances de synchronisation d'ArgoCD doivent s'améliorer ou rester identiques (plus d'aller-retour pour
    télécharger l'archive du chart).

- **Contraintes** :
  - Le dépôt standardise sur ArgoCD ; Flux et les autres contrôleurs GitOps sont hors périmètre (voir les principes de
    l'âge d'acier dans `AGENTS.md`).
  - Certains composants (`argocd`, `pocket-id`, `vault`, `tailscale`, `cloudflare-public-gateway`) embarquent des
    secrets chiffrés avec SOPS, déchiffrés par le plugin KSOPS à la synchronisation d'ArgoCD. Les rendre exigerait la
    clé privée age au moment du commit, volontairement absente de la CI, ou exposerait des secrets en clair dans Git.
  - Kustomize et Helm sont disponibles via `mise` ; aucun nouvel outillage côté cluster ne peut être introduit.

## Options envisagées

### Option 1 : manifestes pré-rendus commités dans Git (motif `dist/`)

> **Statut : ACCEPTÉE**

Chaque répertoire d'application sans SOPS reçoit un pendant `dist/`. Au moment du commit,
`kustomize build --enable-helm <chemin-src>` est exécuté en local ; sa sortie est découpée en un fichier par ressource
Kubernetes, nommé `<groupe>.<version>.<Kind>.<nom>.yaml`, puis commitée sous `dist/`. Les ApplicationSets ArgoCD sont
modifiés pour découvrir et utiliser `dist/` comme source à la place de `src/`. L'arborescence `src/` conserve les
sources Kustomize et les valeurs Helm comme interface d'écriture, mais ArgoCD ne les rend jamais à la synchronisation.

Pour les composants qui embarquent des secrets chiffrés avec SOPS, la kustomization est scindée : le bloc `generators:`
de KSOPS est extrait dans un overlay minimal `src/<app>/sops/kustomization.yaml` qui référence les fichiers chiffrés du
répertoire parent. La `src/<app>/kustomization.yaml` principale ne contient plus de SOPS et est pré-rendue dans
`dist/<app>/`. L'Application ArgoCD de ce composant utilise deux sources : `dist/<app>/` pour les manifestes rendus et
`src/<app>/sops/` pour les secrets générés par KSOPS, la seconde source étant déclarée dans le
`dist/<app>/.application.patch` de l'application.

Le contrôle de fraîcheur se fait en couches : une action trunk de pré-commit refait le rendu des seuls projets touchés
par le commit courant et ajoute automatiquement la sortie `dist/` à l'index ; une action trunk de pré-push exécute un
contrôle complet de fraîcheur sur tous les répertoires `dist/` ; enfin, un job de CI refait le rendu de l'ensemble à
chaque push et pull request et échoue si le `dist/` commité diverge de la sortie fraîchement rendue.

- `+` Supprime tous les téléchargements de registres Helm à l'exécution pour les applications sans SOPS.
- `+` Chaque mise à jour de chart produit un `git diff` complet et lisible des ressources Kubernetes réelles ; la revue
  de sécurité des PR Renovate devient praticable.
- `+` L'historique Git de `dist/` est un journal auditable de chaque état de ressources jamais appliqué.
- `+` La synchronisation ArgoCD devient un simple `kubectl apply` sans dépendance réseau externe, ce qui améliore la
  vitesse et la fiabilité.
- `+` Le retour arrière par `git revert` annule l'état exact des ressources précédemment appliqué.
- `+` L'exception SOPS est minimisée : seuls les overlays générateurs de secrets restent dans `src/` ; toutes les autres
  ressources de l'application sont pré-rendues.
- `-` Les répertoires `dist/` ajoutent du contenu généré commité qu'il faut garder synchronisé. Les hooks de contrôle et
  la CI atténuent le risque de dérive.
- `-` La migration initiale exige de rendre et de commiter tous les composants existants, un effort ponctuel important.
- `-` Le refactoring des applications SOPS (extraction des overlays `sops/`) ajoute de la complexité pour la poignée de
  composants concernés.

### Option 2 : miroir de charts Helm auto-hébergé uniquement

> **Statut : REJETÉE**

Tous les charts Helm amont sont répliqués dans un registre OCI auto-hébergé (par exemple le registre OCI de Forgejo à
`forgejo.local`) et les sources `helmCharts:` d'ArgoCD sont modifiées pour y puiser. Les charts ne sont récupérés depuis
les registres amont que lorsqu'ils sont explicitement répliqués par Renovate ou par un job de CI, et non à chaque
synchronisation ArgoCD.

Cela réduit la surface d'attaque à l'exécution (un `helm.cilium.io` compromis ne peut plus injecter de contenu à la
synchronisation) sans la supprimer. ArgoCD rend toujours les manifestes à la synchronisation à partir du chart répliqué
: le rendu reste éphémère, invisible dans `git diff` et non reproductible d'une synchronisation à l'autre si un tag
répliqué est écrasé. Le problème de cécité des diffs sur les PR Renovate n'est pas du tout traité.

- `+` Réduit la dépendance à la disponibilité des registres amont.
- `+` Préserve le flux de rendu ArgoCD existant avec très peu de changements.
- `-` Le rendu reste éphémère ; le `git diff` des montées de version de charts reste aveugle.
- `-` Le registre OCI auto-hébergé devient un nouveau point de défaillance unique pour toutes les synchronisations.
- `-` L'infrastructure de réplication ajoute une charge d'exploitation sans résoudre le problème central.

### Option 3 : remplacer tous les charts Helm par des manifestes écrits à la main

> **Statut : REJETÉE**

Chaque composant géré par Helm (Cilium, Longhorn, ArgoCD, cert-manager, external-dns, …) est remplacé par du YAML
Kubernetes rédigé manuellement. Le dépôt possède la définition complète des ressources de chaque composant, sans
dépendance à un chart amont.

Cette option offre un contrôle maximal et supprime toute dépendance externe de rendu, mais la charge de maintenance est
prohibitive. Les charts Helm de composants d'infrastructure comme Cilium encodent des centaines de variantes de
ressources conditionnelles, une logique de migration propre à chaque version et la gestion du cycle de vie des CRD.
Maintenir une fonctionnalité équivalente en YAML écrit à la main d'une version de chart à l'autre consommerait plus de
temps que tout le reste de la maintenance du homelab réuni. L'approche par pré-rendu atteint les mêmes objectifs de
durcissement de la chaîne d'approvisionnement pour une fraction du coût, en préservant l'interface d'écriture Helm tout
en supprimant le rendu à l'exécution.

- `+` Contrôle complet de chaque définition de ressource.
- `+` Aucune dépendance externe de rendu.
- `-` Charge de maintenance initiale et continue extrêmement élevée.
- `-` Perte des chemins de mise à jour Helm éprouvés pour les composants d'infrastructure complexes.
- `-` Incompatible avec l'automatisation Renovate pour le suivi des dépendances.

## Décision retenue

**Option retenue : « Manifestes pré-rendus commités dans Git (motif `dist/`) » (option 1)**, parce que c'est la seule
option qui ferme à la fois la surface d'attaque de la chaîne d'approvisionnement à la synchronisation _et_ rend les
changements de ressources rendues visibles dans `git diff`. L'option du miroir (option 2) réduit le risque mais laisse
entièrement non résolu le problème de cécité des diffs. L'option des manifestes écrits à la main (option 3) atteint les
deux objectifs, mais pour un coût de maintenance incompatible avec un homelab durable.

La scission en sous-répertoire `sops/` est le choix de conception qui rend le motif praticable. Plutôt que de traiter
tout composant porteur de secrets comme une exception inaccessible, la génération des secrets chiffrés est isolée dans
un overlay minimal `sops/kustomization.yaml`. Le reste de l'application (tous les Deployments, Services, ConfigMaps,
NetworkPolicies, CRD) est pré-rendu. L'exception SOPS est ainsi bornée au plus petit ensemble de ressources possible.

Le contrôle en couches (nouveau rendu au pré-commit, contrôle complet au pré-push, barrière de fraîcheur en CI) permet
de détecter la dérive de `dist/` au plus tôt, sans bloquer les flux de développement habituels.

---

## Conséquences

### Positives

- (+) Toutes les synchronisations ArgoCD des applications sans SOPS deviennent de simples opérations `kubectl apply` sur
  du YAML statique commité, sans appel réseau sortant à la synchronisation.
- (+) Les PR Renovate de montée de version de charts exposent le delta complet des ressources Kubernetes, ce qui permet
  une vraie revue de sécurité avant la fusion.
- (+) `git revert` sur un commit de `dist/` annule précisément l'état de ressources appliqué, ce qui simplifie les
  retours arrière d'urgence.
- (+) Le dépôt Git devient la frontière de confiance stricte pour tout l'état du cluster.
- (+) Les analyses Trivy / kubesec hors ligne de `dist/` sont triviales, ce qui soutient une future automatisation de la
  sécurité (liée à l'issue #456).

### Négatives

- (-) Les répertoires `dist/` ajoutent du contenu généré qui doit rester synchronisé avec `src/`. L'automatisation du
  pré-commit et le contrôle en CI atténuent le risque de dérive sans l'éliminer.
- (-) La migration initiale (rendu et commit de tous les composants sans SOPS) est un effort ponctuel non négligeable,
  les composants d'infrastructure d'`amiya.akn` portant le risque le plus élevé si un rendu est incorrect.
- (-) Le refactoring des applications SOPS (extraction des overlays `sops/`) ajoute un répertoire par composant
  dépendant de SOPS, ce qui accroît légèrement la complexité structurelle.

### Neutres

- (\~) Les fichiers `dist/` sont marqués `linguist-generated` dans `.gitattributes`, de sorte que GitHub les replie par
  défaut dans les revues de PR.
- (\~) L'étape `kustomize build --enable-helm` exige que `helm` soit disponible dans l'environnement local. La chaîne
  d'outils `mise` existante le fournit déjà.
- (\~) Les références de source dans les annotations `argocd-extension-application-map` d'ArgoCD sont mises à jour pour
  pointer vers `src/`, afin de faciliter la traçabilité pour les développeurs, même si la source effective est `dist/`.

---

## Détails de mise en œuvre et état

- **Composants terminés** : ADR rédigé ; script de rendu et workflow de CI définis ; applications, infrastructure et
  `argocd` d'`amiya.akn` migrés (scissions SOPS comprises). Au 2026-10-11, le dépôt montre en plus : le hook
  `dist-render-pre-commit` de `.rtunk/rtunk.yaml`, la migration de `lungmen.akn` (`projects/lungmen.akn/dist/apps/` et
  `projects/lungmen.akn/dist/infrastructure/`) et le basculement des ApplicationSets `system` et `applications` sur les
  chemins `dist/` (voir ci-dessous).

- **Composants restants** : historiquement, les actions trunk, la migration de `lungmen.akn` et la mise à jour des
  ApplicationSets (passage des AppSets `system` et `applications` des chemins `src/` aux chemins `dist/`). Au
  2026-10-11, la preuve dans le dépôt est la suivante :

| Élément                              | Preuve dans le dépôt                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script de rendu                      | `scripts/dist:render` (options `--all`, `--staged-only`, `--changed`, `--branch`, chemin)                                                                                                           |
| Hook de pré-commit                   | `dist-render-pre-commit` dans `.rtunk/rtunk.yaml` : `scripts/dist:render --staged-only`, déclenché par `projects/*/src/apps/**`, `projects/*/src/infrastructure/kubernetes/**` et `catalog/helm/**` |
| Contrôle de pré-push                 | Aucune action dédiée à `dist/` : seul `trunk-check-pre-push` est activé ; suivi par [#1379](https://github.com/chezmoidotsh/arcane/issues/1379)                                                     |
| Barrière de fraîcheur en CI          | `.github/workflows/push,pull_request.dist-staleness-check.yaml` : `scripts/dist:render --all` puis échec si `git diff` sur `projects/*/dist/**` n'est pas vide                                      |
| Conformité OPA                       | `merge_group.compliance-full.yaml` et `push,pull_request.compliance-partial.yaml` contrôlent chaque `dist/` modifié (ou tous, pour le workflow complet)                                             |
| Migration de `rhodes.akn`            | `projects/rhodes.akn/dist/` : `apps/` (`pocket-id`, `vault`), `argocd/` et `infrastructure/kubernetes/` (8 composants)                                                                              |
| Migration de `lungmen.akn`           | `projects/lungmen.akn/dist/` : `apps/` (8 applications, comme `src/apps/`) et `infrastructure/kubernetes/` (12 composants)                                                                          |
| ApplicationSets sur `dist/`          | `projects/rhodes.akn/src/argocd/seed.apps/shoot.applicationset.yaml` fixe les chemins des AppSets `system` et `applications` sur `dist/infrastructure/kubernetes/*` et `dist/apps/*`                |
| Fichiers de base des ApplicationSets | `projects/rhodes.akn/src/argocd/shoot.apps/system.applicationset.yaml` conserve `src/infrastructure/kubernetes/*` dans son modèle de base, remplacé par le patch ci-dessus                          |

Le motif est donc appliqué sur les deux clusters.

- **Architecture — convention de répertoires** :

```text
projects/<cluster>/
├── src/                             # Interface d'écriture — fichiers kustomization, valeurs Helm, secrets SOPS
│   ├── apps/<app>/
│   │   ├── kustomization.yaml       # Source Kustomize (peut référencer helmCharts:)
│   │   ├── .application.patch       # Métadonnées de l'application ArgoCD / surcharges de la politique de sync
│   │   ├── *.helmvalues/            # Fichiers de valeurs Helm
│   │   └── sops/                    # [Applications SOPS uniquement] overlay générateur KSOPS
│   │       └── kustomization.yaml   # Contient generators: [ksops], référence ../secret.yaml
│   └── infrastructure/kubernetes/<name>/
│       └── (même structure)
│
└── dist/                            # Sortie pré-rendue — commitée, jamais modifiée à la main
    ├── apps/<app>/
    │   ├── .application.patch       # Copié tel quel depuis src/ par le script de rendu
    │   │                            # [Applications SOPS] contient aussi la surcharge spec.sources vers src/sops/
    │   └── <group>.<version>.<Kind>.<name>.yaml   # Un fichier par ressource Kubernetes
    └── infrastructure/kubernetes/<name>/
        └── (même structure)
```

- **Convention de nommage des fichiers** : `<group>.<version>.<Kind>.<name>.yaml`, où le composant de groupe des
  ressources de l'API core (groupe vide dans `apiVersion`) est normalisé en `core`. Exemples :
  `apps.v1.Deployment.forgejo.yaml`, `core.v1.Service.forgejo.yaml`, `networking.k8s.io.v1.NetworkPolicy.forgejo.yaml`.

- **Liste des exceptions SOPS** : composants qui conservent un overlay `src/<app>/sops/` :

| Composant                   | Projet      | Secrets chiffrés                                                                                                                     |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pocket-id`                 | `amiya.akn` | Identité SSO, identifiants PostgreSQL, clé de sauvegarde S3                                                                          |
| `vault` (OpenBao)           | `amiya.akn` | Jetons SoftHSM, identifiants de base de données, clé de sauvegarde S3                                                                |
| `tailscale`                 | `amiya.akn` | Clé d'authentification du connecteur                                                                                                 |
| `cloudflare-public-gateway` | `amiya.akn` | Identifiants du tunnel Cloudflare                                                                                                    |
| `argocd`                    | `amiya.akn` | Secrets d'amorçage, identifiants GitHub : suit le motif de scission `sops/` ; amorcé manuellement, puis auto-géré via `dist/argocd/` |

- **Spécification des standards** :
  - Les fichiers `dist/` ne sont jamais modifiés à la main ; tout changement passe par `scripts/dist:render`.
  - `src/*/sops/kustomization.yaml` ne doit contenir que des générateurs KSOPS ; aucune entrée `resources:` ordinaire
    n'est autorisée dans un overlay `sops/`.
  - Toute nouvelle application qui exige des secrets chiffrés avec SOPS doit suivre dès le départ le motif de scission
    `sops/`.

---

## Historique des modifications

- **2026-10-11** : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections
  renommées, sommaire manuel supprimé, titre reformulé (« Rendered Manifests Pattern ») et aligné sur le nom de fichier,
  section `Pour aller plus loin`, bloc de code de la convention de répertoires typé `text`, `template-version` ajouté.
  Option « artefacts OCI Flux » retirée (Flux est exclu par les contraintes) et troisième problème du contexte fusionné
  dans le premier. Décision, chronologie et dates d'origine inchangées.
- **2026-10-11** : **FEATURE** : Passage de `status` de `accepted` à `implemented`, sans `implementation-completed` (le
  texte de l'ADR n'établit aucune date de fin). Le dépôt prouve que le motif est appliqué sur `rhodes.akn` et
  `lungmen.akn` : répertoires `dist/` rendus par `scripts/dist:render`, hook `dist-render-pre-commit`, workflow
  `push,pull_request.dist-staleness-check.yaml`, ApplicationSets `system` et `applications` fixés sur `dist/` par
  `projects/rhodes.akn/src/argocd/seed.apps/shoot.applicationset.yaml`, conformité OPA exécutée sur chaque `dist/`. La
  mention « en attente » de la migration de `lungmen.akn`, des actions trunk et des ApplicationSets, devenue fausse, est
  corrigée dans `Détails de mise en œuvre et état` ; l'action de pré-push dédiée à `dist/`, absente, est suivie par
  [#1379](https://github.com/chezmoidotsh/arcane/issues/1379). Mise à jour de `date`.
- **2026-05-28** : **FEATURE** : Application de la scission `sops/` à `argocd` ; `dist/argocd/` est désormais rendu et
  `bootstrap.application.yaml` utilise comme sources `dist/argocd/` et `src/argocd/sops/`. Suppression de l'exception
  d'amorçage : `argocd` s'auto-gère après l'amorçage initial.
- **2026-05-24** : **FEATURE** : Création initiale de l'ADR documentant la décision d'adopter le motif des manifestes
  pré-rendus (`dist/`) pour durcir la chaîne d'approvisionnement et rendre les diffs GitOps lisibles.

---

## Pour aller plus loin

- [ADR-001 Gestion centralisée des secrets](./ADR-001-Gestion-Centralisee-des-Secrets.md) : la gestion centralisée des
  secrets.
- [ADR-002 Topologie des secrets OpenBao](./ADR-002-Topologie-des-Secrets-OpenBao.md) : la topologie des secrets
  OpenBao.
- [ADR-007 Structure des projets et conventions de nommage](../archives/ADR-007-Structure-des-Projets-et-Conventions-de-Nommage.md)
  : l'organisation des projets, dont les répertoires `src/` et `dist/`.
- [ADR-012 Remplacer Kyverno par OPA](./ADR-012-Remplacer-Kyverno-par-OPA.md) : les politiques OPA exécutées sur les
  manifestes rendus de `dist/`.
- NIST SP 800-218, Secure Software Development Framework (SSDF) : les pratiques SI.2 et SI.3 sur la vérification de
  l'intégrité des logiciels tiers.
- SLSA Supply Chain Security Framework : le motif `dist/` atteint le niveau SLSA Build L1 en rendant la provenance du
  build traçable via Git.
- Issue GitHub #990 : issue de suivi d'origine et contexte technique complet.
- Issue GitHub #453 : standardiser les motifs de déploiement de `lungmen.akn` (objectif aligné).
- Issue GitHub #456 : automatisation du centre de sécurité (l'analyse Trivy hors ligne devient triviale avec `dist/`
  pré-rendu).
- [Argo CD, source de type répertoire](https://argo-cd.readthedocs.io/en/stable/user-guide/directory/) :
  `directory.recurse: true` pour appliquer tout le YAML d'un répertoire.
- [Kustomize, inflateur de charts Helm](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/helmcharts/)
  : référence de `kustomize build --enable-helm`.
- [KSOPS](https://github.com/viaduct-ai/kustomize-sops) : le générateur KSOPS utilisé pour les secrets chiffrés avec
  SOPS.
