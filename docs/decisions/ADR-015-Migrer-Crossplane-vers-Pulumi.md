---
status: "implemented"
date: 2026-10-11
decision-makers: ["Alexandre"]
assisted-by: ["claude-opus-4.8", "claude-sonnet-5"]
informed: []
template-version: "2.0.0"
---

# ADR-015 Migrer Crossplane vers Pulumi

Migré le 2026-10-11 ; l'état des clusters n'a pas été revérifié.

Titre d'origine : « Migrate cloud infrastructure management from Crossplane to Pulumi ».

> [!NOTE]\
> **État au 2026-10-11 : migration réalisée, phase 1 (exécution locale) en vigueur.** Le dépôt ne contient plus de
> Crossplane : `catalog/crossplane/` n'existe plus, aucun dossier `projects/*/src/infrastructure/crossplane/` n'existe
> et chaque projet à infrastructure cloud ou hôte porte une stack Pulumi sous
> `projects/<projet>/src/infrastructure/pulumi/` (`chezmoi.sh`, `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn`,
> `rimbilliton.akn`), avec l'état dans le backend S3 Garage (`Pulumi.yaml`). Le cluster `amiya.akn`, cité dans le texte
> plus bas, n'existe plus dans `projects/`. Restent deux résidus : l'`AppProject` ArgoCD `crossplane`, présent dans
> `projects/rhodes.akn/src/argocd/appprojects.yaml`, et des motifs `infrastructure/crossplane` dans
> `scripts/dist:render`. La phase 2 (exécution dans le cluster) n'est pas engagée : aucune ressource `Stack` ni Pulumi
> Kubernetes Operator n'apparaît dans `projects/` ni dans `catalog/kubernetes/`. Le texte ci-dessous est conservé tel
> que décidé.

## Contexte et problème

`amiya.akn` exécute Crossplane comme unique contrôleur de l'infrastructure cloud et périphérique au cloud. Le modèle de
Crossplane installe **un paquet de fournisseur par famille d'API cloud**, chacun composé d'un Deployment et de son
propre jeu de CRD, et exprime la logique de démultiplication (une claim qui produit de nombreuses ressources gérées) au
moyen de XRD et de Compositions personnalisées. Cela représente aujourd'hui 12 paquets de fournisseurs, deux XRD
personnalisées (`ClusterVault`, `DomainIdentity`), environ 8 jetons Cloudflare, environ 19 ressources Vault/OpenBao,
environ 9 ressources AWS SES/Cloudflare et 6 Workspaces Terraform exécutés via `provider-terraform`.

Ce modèle par fournisseur ne passe pas à l'échelle sur du matériel de homelab. La migration du registre OCI (#1010,
#1076) a été le point de bascule : l'intégration de quelques ressources OCI a exigé **7 paquets de fournisseurs
supplémentaires et environ 500 ressources Kubernetes supplémentaires**. Cette surcharge structurelle (Deployments de
fournisseurs, CRD et objets de ressources gérées qui se multiplient par famille d'API) est le problème concret, compté
directement dans le POC (#1089, §1). Le coût en CPU et en RAM qui s'y ajoute devrait être important, mais il n'a pas été
quantifié (les critères d'empreinte V-005 et V-006 du POC sont `Pending`) : la décision repose sur l'explosion
structurelle observée, pas sur un écart de ressources non mesuré.

Le POC Pulumi contre Crossplane (#1089,
[`docs/experiments/20260702-pulumi-crossplane-evaluation/`](../experiments/20260702-pulumi-crossplane-evaluation/README.md))
a validé qu'une `ComponentResource` Pulumi atteint la parité fonctionnelle avec les Compositions `ClusterVault` et
`DomainIdentity`, et que Garage (compatible S3, #1097) fonctionne comme backend d'état Pulumi. Le modèle de Pulumi est
fondamentalement plus léger : un paquet npm par fournisseur (aucune CRD installée en permanence), des stacks écrites
sous forme de programmes TypeScript et un état dans S3 plutôt que dans etcd sous forme de ressources personnalisées.

Une seconde contrainte aggrave la première. La reconstruction de `rhodes` (#370) exige que l'état du cloud et de
l'infrastructure soit reconstructible et gérable **sans qu'aucun cluster Kubernetes soit garanti** : Crossplane, qui est
un contrôleur dans le cluster, ne peut pas le faire par construction.

La question stratégique à laquelle cet ADR répond est la suivante : **quel outil doit gérer l'infrastructure cloud et
périphérique au cloud du homelab sous forme de code, en remplacement du modèle CRD/contrôleur par fournisseur de
Crossplane, tout en restant exploitable pendant la reconstruction de `rhodes` alors qu'aucun cluster n'est garanti ?**

## Hors périmètre

- **Figer le modèle d'exécution définitif.** Cet ADR décide de l'_outil_ (Pulumi remplace Crossplane). L'exécution est
  déployée par phases : **locale, hors cluster, d'abord**, pendant la migration ; l'exécution de Pulumi **dans le
  cluster** via le Pulumi Kubernetes Operator reste la cible finale et est **différée, pas rejetée** (voir
  [Détails de mise en œuvre et état](#détails-de-mise-en-œuvre-et-état) pour l'ordonnancement et ses raisons).
- **Le cycle de vie des VM et LXC Proxmox, et la gestion IaC d'Unifi.** Les deux restent hors de Pulumi et du GitOps et
  restent manuels. Ils sont fondamentaux pour le homelab (Proxmox héberge chaque cluster ; Unifi est le substrat réseau)
  : des identifiants capables de créer, modifier ou supprimer du calcul ne doivent jamais se trouver dans quoi que ce
  soit qu'un cluster exécute, ni en aval de cela, afin d'éviter un cycle de confiance
  `Proxmox → héberge K8s → K8s gère Proxmox`. Cas délibéré suivi par l'inventaire de l'infrastructure manuelle (#1094) ;
  raisonnement repris du POC (§9).

  > [!NOTE]\
  > **Exception étroite (#1118, voir Évolution de la décision).** Les ACL de Proxmox VE (création d'utilisateurs, de
  > rôles et de jetons), le SDN (zones et vnets), l'enregistrement du stockage de sauvegarde, les pools de ressources et
  > ACME sont gérés via Pulumi : ce sont des objets de configuration d'administration, pas du cycle de vie du calcul, et
  > ils ne portent pas le risque de cycle de confiance que ce hors-périmètre vise à bloquer. L'exception ne tient que
  > tant que `stack/proxmox/` (comme chaque stack `chezmoi-sh-infra` aujourd'hui) s'exécute **localement** (phase 1 de
  > cet ADR, voir Mise en œuvre). Si l'exécution de Pulumi passe un jour dans le cluster (phase 2), `stack/proxmox/`
  > doit rester exclue de cette migration, sinon le cycle exact `Proxmox → héberge K8s → K8s gère Proxmox` se rouvre par
  > elle.

- **Rouvrir le choix du backend d'état.** Garage comme backend d'état S3 est tranché par #1097 et constitue une prémisse
  ici.

## Facteurs de décision

- **Sortir du modèle par fournisseur** : remplacer la surcharge d'un jeu de CRD par famille d'API de Crossplane, dont
  l'explosion structurelle (quantifiée dans le contexte) est la motivation principale. La réduction de l'empreinte est
  attendue mais non quantifiée.
- **Composition sous forme de code** : exprimer la logique de démultiplication (les motifs `ClusterVault` et
  `DomainIdentity`) dans un vrai langage de programmation plutôt que dans une couche de modèles ou de modules HCL, pour
  la maintenabilité et un raisonnement plus facile.
- **Exécution indépendante du cluster** : l'outil doit s'exécuter sans cluster Kubernetes, pour satisfaire la
  reconstruction de `rhodes` (#370).
- **Solide pour l'exécution dans le cluster, plus tard** : l'exécution dans le cluster étant la cible finale,
  l'opérateur Kubernetes de l'outil doit être de premier ordre ; cette phase est différée, pas abandonnée.
- **Création native de fournisseurs** : les fournisseurs natifs à venir pour Garage, Talos Omni et Pocket-Id
  (#1092/#1093/#1095) doivent être peu coûteux à construire sur l'API propre à chaque produit.
- **Sûreté pendant la migration** : l'adoption doit importer les ressources existantes sans aucune recréation
  (`pulumi import`, `pulumi preview` propre) et n'introduire aucune fenêtre où deux contrôleurs réconcilient la même
  ressource.

## Options envisagées

### Option 1 : conserver Crossplane

> **Statut : REJETÉE**

Rester sur Crossplane : un paquet de fournisseur par famille d'API cloud, des Compositions qui démultiplient les claims
en ressources gérées, le tout réconcilié en continu dans le cluster. Aucun coût de migration, et une vraie force : une
boucle de contrôle active qui corrige les dérives d'elle-même et expose l'état via `kubectl get composite,claim` et
ArgoCD.

Elle est rejetée pour les deux problèmes structurels qu'elle ne peut pas écarter. Le modèle par fournisseur est la
surcharge que cette décision vise à supprimer (l'explosion de fournisseurs de la migration OCI est intrinsèque, pas une
erreur de configuration). Et, étant un contrôleur dans le cluster, elle ne peut pas gérer l'état du cloud quand aucun
cluster n'existe, ce qui bloque la reconstruction de `rhodes` (#370).

- `+` Aucun effort de migration ; réconciliation continue des dérives ; visibilité native dans ArgoCD.
- `-` Le modèle CRD/contrôleur par fournisseur est exactement la surcharge à éviter.
- `-` Exige un cluster actif pour gérer l'état du cloud, incompatible avec `rhodes`.
- `-` Les XRD et Compositions personnalisées sont une abstraction sur mesure à maintenir à la main indéfiniment.

### Option 2 : Terraform / OpenTofu

> **Statut : REJETÉE**

L'alternative IaC courante, déjà en partie présente dans le dépôt : les 6 Workspaces Terraform s'exécutent aujourd'hui
via `provider-terraform` de Crossplane. Standardiser sur Terraform/OpenTofu consoliderait l'ensemble sur un outil très
répandu, doté d'un large écosystème de fournisseurs, et s'exécuterait aussi hors cluster, ce qui satisfait la contrainte
de `rhodes`.

Elle est rejetée au profit de Pulumi pour quatre raisons (les trois dernières relèvent de l'appréciation du mainteneur)
:

- **Composition sous forme de code, pas de modules HCL.** La démultiplication `ClusterVault`/`DomainIdentity` se traduit
  naturellement en une `ComponentResource` Pulumi (du vrai TypeScript), plus maintenable que son équivalent en modules
  Terraform.

- **Meilleur opérateur Kubernetes.** Le Pulumi Kubernetes Operator est jugé nettement mieux conçu que les options
  d'opérateur de Terraform, ce qui est décisif puisque l'exécution dans le cluster est la cible _finale_ (voir Hors
  périmètre et Mise en œuvre) : la phase différée doit s'appuyer sur un opérateur solide.

- **Ergonomie pour l'assistance par IA.** Une base de code TypeScript courante est plus simple à manipuler pour des
  assistants IA que du HCL, ce qui compte pour un homelab à opérateur unique qui s'appuie sur l'IA.

- **Fournisseurs natifs moins coûteux.** Construire un fournisseur natif à partir de l'API d'un produit (Garage, Omni,
  Pocket-Id : #1092/#1093/#1095) est jugé plus simple avec le modèle de fournisseur de Pulumi qu'avec celui de
  Terraform.

- `+` Large écosystème ; exécutable hors cluster ; déjà en partie utilisée.

- `-` Les modules HCL conviennent moins bien que du code à la logique de composition et de démultiplication existante.

- `-` Opérateur plus faible que celui de Pulumi, ce qui compte pour la phase différée dans le cluster.

- `-` Friction plus élevée pour le travail assisté par IA et pour la création de fournisseurs natifs.

### Option 3 : Pulumi

> **Statut : ACCEPTÉE**

Remplacer Crossplane par Pulumi : des stacks TypeScript (`catalog/pulumi/` pour les composants partagés, comme une
`ComponentResource` équivalente à `ClusterVault`, et `projects/<périmètre>/src/infrastructure/pulumi/` pour les stacks
par projet), un paquet npm par fournisseur et l'état dans Garage (#1097). Pulumi exécute le même programme en local ou
dans le cluster, ce qui permet d'étager le modèle d'exécution : local d'abord, dans le cluster ensuite, sur une seule
chaîne d'outils. Le POC a validé la parité et le backend S3 ; les Workspaces Terraform existants se replient dans des
fournisseurs Pulumi natifs (`@pulumi/hcloud`, `@pulumi/tailscale`), ce qui fusionne deux systèmes d'IaC en un seul.

- `+` Aucune CRD ni aucun contrôleur installé en permanence : la surcharge par fournisseur disparaît.
- `+` Logique de démultiplication sous forme de `ComponentResource` TypeScript ; opérateur Kubernetes solide pour la
  phase différée dans le cluster ; adapté à l'IA ; création peu coûteuse de fournisseurs natifs.
- `+` Le même programme s'exécute en local ou dans le cluster, ce qui permet un déploiement par étapes sur une seule
  chaîne d'outils.
- `+` Consolide les Workspaces de `provider-terraform` dans des fournisseurs Pulumi natifs.
- `-` Perd la réconciliation permanente de Crossplane et sa visibilité dans ArgoCD _tant que l'exécution est locale_
  (retrouvées à l'arrivée de la phase dans le cluster, voir Conséquences).
- `-` La migration exige d'importer chaque ressource sans aucune recréation.

## Décision retenue

**Option retenue : « Pulumi » (option 3).**

Pulumi est la seule option qui supprime la surcharge CRD/contrôleur par fournisseur _et_ s'exécute sans cluster.
Conserver Crossplane (option 1) échoue sur les deux plans par construction : la surcharge est intrinsèque à son modèle
et il ne peut pas gérer l'état du cloud quand aucun cluster n'existe, ce que la reconstruction de `rhodes` (#370) exige.
Terraform et OpenTofu (option 2) franchissent les deux seuils mais perdent face à Pulumi sur les qualités qui comptent
le plus pour ce homelab précis : exprimer la logique de composition et de démultiplication existante sous forme de code
plutôt que de modules HCL, un opérateur Kubernetes plus solide pour la phase finale dans le cluster, un travail assisté
par IA plus simple et une création de fournisseurs natifs moins coûteuse pour les fournisseurs Garage, Omni et Pocket-Id
déjà prévus (#1092/#1093/#1095).

Le fait que Pulumi exécute le _même_ programme en local ou dans le cluster rend possible le modèle d'exécution étagé
sans avoir à rechoisir d'outil plus tard : la migration se fait **en local d'abord** (détails et raisons dans
[Détails de mise en œuvre et état](#détails-de-mise-en-œuvre-et-état)), et l'opérateur dans le cluster, celui de Pulumi,
jugé le meilleur des candidats, est adopté ensuite comme seconde phase délibérée, sans être imposé maintenant alors que
Crossplane est encore actif.

L'ampleur de l'empreinte n'est volontairement pas déterminante : le POC a compté l'explosion structurelle (fournisseurs,
CRD, ressources) mais n'a jamais mesuré le CPU ni la RAM. La surcharge structurelle observée suffit à justifier
l'abandon de Crossplane ; l'écart de ressources non mesuré est un bonus, pas l'argument.

---

## Conséquences

### Positives

- (+) Supprime le modèle CRD/contrôleur par fournisseur de Crossplane et son explosion structurelle de ressources.
- (+) L'état du cloud devient gérable sans aucun cluster en fonctionnement, ce qui débloque la reconstruction de
  `rhodes` (#370).
- (+) Une seule chaîne d'outils s'exécute en local maintenant et dans le cluster plus tard, de sorte que le modèle
  d'exécution peut évoluer sans rechoisir d'outil.
- (+) Les Workspaces Terraform se consolident dans des fournisseurs Pulumi natifs, ce qui supprime un second système
  d'IaC.

### Négatives

- (-) **Tant que l'exécution est locale (phase actuelle)** : aucune réconciliation continue des dérives (une dérive
  n'apparaît que lorsqu'une personne lance `pulumi preview`) et aucune visibilité de l'état du cloud dans l'interface
  d'ArgoCD. Ce sont précisément les propriétés que la **phase différée dans le cluster** rétablit : ce sont donc des
  limites de phase, pas des régressions permanentes.
- (-) La migration doit importer par `pulumi import` chaque ressource gérée par Crossplane, sans aucune recréation.
- (-) La surface de chaîne d'approvisionnement de Pulumi (dépendances npm exécutées avec des identifiants cloud) doit
  être maîtrisée : légèrement maintenant (installations `npm ci` à lockfile strict en local), et avec les contrôles de
  durcissement des pods du POC à l'arrivée de la phase dans le cluster (voir Mise en œuvre).

### Neutres

- (\~) Unifi reste entièrement manuel (#1094), sans changement du fait de cette décision. Le cycle de vie des VM et LXC
  Proxmox reste manuel aussi ; sa couche ACL, SDN, stockage de sauvegarde, pools et ACME fait l'objet d'une exception
  depuis #1118 (voir Hors périmètre et Évolution de la décision).
- (\~) Garage comme backend d'état (#1097) est une prémisse de cet ADR, pas un effet.

---

## Détails de mise en œuvre et état

### Modèle d'exécution étagé

Pulumi exécute le même programme TypeScript quel que soit l'_endroit_ où il s'exécute : le modèle d'exécution est donc
déployé en deux phases plutôt que décidé une fois pour toutes.

- **Phase 1 : locale, hors cluster (actuelle).** `pulumi up` et `pulumi preview` s'exécutent sur la machine de la
  personne qui opère, sur un état hébergé dans Garage ; ni Pulumi Operator, ni tâche de CI (pas même un `preview` en
  lecture seule). Choisie pour _maintenant_ parce que la migration est en cours : ajouter l'opérateur dans le cluster
  pendant que Crossplane réconcilie encore créerait une fenêtre à deux réconciliateurs sur les mêmes ressources actives,
  et l'exécution locale est de toute façon ce dont la reconstruction de `rhodes` a besoin. Seule atténuation requise à
  ce stade : des installations `npm ci` à lockfile strict.
- **Phase 2 : dans le cluster (différée, la cible finale).** Une fois la migration stabilisée et Crossplane désinstallé,
  l'exécution de Pulumi passe dans le cluster via le Pulumi Kubernetes Operator (CR `Stack`, éventuellement générées par
  un `ApplicationSet` ArgoCD), ce qui rétablit la réconciliation continue et la visibilité dans ArgoCD. Elle est
  différée, pas rejetée : elle n'est risquée que _maintenant_, en pleine migration. À son arrivée, le durcissement des
  pods de travail du POC redevient pertinent : étiquette d'image épinglée (téléchargements `IfNotPresent`), cache npm
  éphémère propre au pod et `CiliumNetworkPolicy` de sortie par Stack.

```text
Phase 1 (maintenant) : locale, sans cluster   Phase 2 (différée) : dans le cluster
┌──────────────────────────────┐             ┌──────────────────────────────┐
│ machine de l'opérateur       │             │ Pulumi Kubernetes Operator   │
│ npm ci → pulumi up / preview │             │ CR Stack → pod de travail    │
└──────────────────────────────┘             │ (image épinglée, cache npm   │
             │                                │  éphémère, NetworkPolicy)    │
             ▼                                └──────────────────────────────┘
   État Garage (S3, #1097) ◀───── même état, même programme TypeScript ─────▶
             │
             ▼
   API cloud (AWS, Cloudflare, Vault/OpenBao, Hetzner, Tailscale)
```

### État

> [!NOTE]\
> Les puces de cette liste d'état sont celles de la décision du 2026-07-07. Les points `Pending` ont été revus le
> 2026-10-11 d'après le dépôt : les écarts sont signalés dans chaque puce.

- **Terminé** : le POC (#1089) a validé la parité fonctionnelle de Pulumi et de Crossplane pour
  `ClusterVault`/`DomainIdentity`, ainsi que Garage comme backend d'état. L'empreinte (V-005/V-006) n'a pas été mesurée.
- **Terminé** : `catalog/pulumi/` est en place (le composant `ClusterVaultComponent`, avec ses variantes
  Local/Remote/Tailscaled, existe sous `catalog/pulumi/components/cluster-vault/`) et les cinq stacks par projet
  (`chezmoi.sh`, `amiya.akn`, `lungmen.akn`, `kazimierz.akn`, `hass`) ont été écrites pour déclarer 1:1 toutes les
  ressources alors gérées par Crossplane, y compris les Workspaces Terraform migrés vers les fournisseurs natifs
  `@pulumi/hcloud` et `@pulumi/tailscale`. Au 2026-10-11, `amiya.akn` n'existe plus dans `projects/` et des stacks
  existent aussi pour `rhodes.akn` et `rimbilliton.akn`.
- **Hors périmètre abandonné** : la XRD `DomainIdentity` et le `DomainIdentityComponent` (vérification de domaine AWS
  SES pour chezmoi.sh) ont été retirés de Crossplane et de l'ossature Pulumi plutôt que migrés, car les e-mails sortants
  passent désormais par Mailjet et la configuration AWS SES est inutilisée.
- **Terminé** : Crossplane désinstallé sur `amiya.akn` : contrôleur, fournisseurs, stacks d'infrastructure par projet,
  politiques réseau et politique d'approvisionnement OpenBao supprimés. Les références du dépôt (`AGENTS.md`, README,
  guides d'amorçage, plan de reprise après sinistre, diagrammes d'architecture) ont été mises à jour pour désigner
  Pulumi comme couche d'IaC.
- **Terminé (revu le 2026-10-11)** : le backend Garage est configuré dans les `Pulumi.yaml` des projets (par exemple
  `projects/chezmoi.sh/src/infrastructure/pulumi/Pulumi.yaml`, `s3://pulumi-states`), la procédure d'import et de
  gestion de l'état existe
  ([Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)),
  et `catalog/crossplane/` (XRD, Compositions et politique OPA SEC001 associée) a été supprimé. Le dépôt ne prouve pas
  que les `pulumi import` ont été exécutés sur les ressources actives ni que `pulumi preview` est propre : ce point n'a
  pas pu être vérifié sans accès aux clusters et aux identifiants.
- **Reste à faire (revu le 2026-10-11)** : la suppression de l'`AppProject` ArgoCD `crossplane` (toujours déclaré dans
  `projects/rhodes.akn/src/argocd/appprojects.yaml` et rendu dans `projects/rhodes.akn/dist/argocd/`), le nettoyage des
  motifs `infrastructure/crossplane` de `scripts/dist:render`, et la phase 2 d'exécution dans le cluster, différée par
  décision. Ces suites étaient suivies par #1091.
- **Standards** : composants partagés dans `catalog/pulumi/` ; stacks par projet dans
  `projects/<périmètre>/src/infrastructure/pulumi/`, sur le modèle du découpage `catalog/crossplane/` +
  `projects/<cluster>/src/infrastructure/crossplane/` qu'elles remplacent.

---

## Évolution de la décision

- **2026-07-02 (POC, #1089)** : évaluation de Pulumi face à Crossplane via le Pulumi Kubernetes Operator dans le
  cluster. Parité fonctionnelle et Garage comme backend d'état confirmés ; empreinte de ressources non mesurée
  (V-005/V-006 en attente).
- **2026-07-05 (cet ADR)** : décision de migrer de Crossplane vers Pulumi, motivée par la surcharge structurelle par
  fournisseur et par l'exigence « sans cluster » de `rhodes`, Terraform/OpenTofu ayant été étudié puis écarté. Exécution
  étagée : locale d'abord pendant la migration, dans le cluster (Pulumi Operator) différée comme cible finale.
- **2026-07-19 (#1118)** : le hors-périmètre sur Proxmox est amendé par une exception étroite : les **ACL, le SDN,
  l'enregistrement du stockage de sauvegarde, les pools de ressources et ACME** de Proxmox VE deviennent gérés par
  Pulumi via un nouveau fournisseur ponté `catalog/pulumi/sdks/proxmox/` (`@pulumi/proxmox`, issu de
  `bpg/terraform-provider-proxmox`) et `stack/proxmox/`, sur le modèle des SDK pontés `proxmox-backup-server`/`b2`/
  `truenas` déjà utilisés. Motivée par trois recettes manuelles `pveum`/`pvesh` répétées à la main à chaque recréation
  d'un cluster sur Proxmox (jetons CCM/CSI, accès SDN d'Omni, enregistrement du stockage PBS), inventaire complet dans
  #1118. Cela ne rouvre **pas** le cycle de vie des VM et LXC (la capacité de création de calcul que protège le
  raisonnement d'origine sur le cycle de confiance), ni les realms (seuls les `pam`/`pve` intégrés existent ; pas
  d'intérêt à les codifier), ni le stockage local ou `nvme-lvm` (reste manuel, comme la couche VM/OS), ni le mappage de
  ressources PCI/USB (adresses IOMMU propres à l'hôte, à redécouvrir de toute façon à la reconstruction : codifier
  l'objet de mappage n'épargne aucun travail réel), ni les notifications (le fournisseur ponté n'a pas de type de
  ressource pour les notifications PVE : PVE reste sur son critère `sendmail`→`root@pam` intégré, documenté comme manuel
  dans `stack/proxmox/README.md`).

---

## Historique des modifications

- _2026-10-11_ : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections renommées,
  sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, émojis des conséquences
  remplacés par les marqueurs du gabarit, `template-version` passé de `1.1.0` à `2.0.0`. Décision, options, chronologie
  et dates d'origine inchangées.
- _2026-10-11_ : **FEATURE** : Passage de `status` de `accepted` à `implemented`, sans `implementation-completed` (le
  texte ne fixe aucune date de fin). Le dépôt prouve que la migration est faite : `catalog/crossplane/` n'existe plus,
  aucun dossier `infrastructure/crossplane` ne subsiste sous `projects/`, des stacks Pulumi existent pour six projets
  (`projects/*/src/infrastructure/pulumi/`) avec le backend Garage dans leurs `Pulumi.yaml`, et `AGENTS.md` établit
  qu'aucun Crossplane n'existe dans l'arbre. Restent l'`AppProject` `crossplane` de `rhodes.akn`, des motifs dans
  `scripts/dist:render` et la phase 2, différée par décision. Les imports sur les ressources actives n'ont pas pu être
  vérifiés. Ajout des notes `> [!NOTE]` en tête et dans `Détails de mise en œuvre et état` (sans réécrire la décision),
  mise à jour de `date`.
- _2026-07-19_ : **FEATURE** : Amendement du hors-périmètre sur Proxmox par une exception étroite pour les ACL, le SDN,
  le stockage de sauvegarde, les pools et ACME (#1118), limitée de façon à rester compatible avec le raisonnement
  d'origine sur le cycle de confiance tant que l'exécution de Pulumi reste locale (phase 1).
- _2026-07-07_ : **REMOVAL** : Désinstallation de Crossplane sur `amiya.akn` : contrôleur, définitions de fournisseurs,
  stacks d'infrastructure par projet, politiques réseau et politique d'approvisionnement OpenBao supprimés au profit du
  remplaçant Pulumi déjà en place (#1091). Les XRD et Compositions partagées de `catalog/crossplane/` sont conservées
  pour l'instant (sans référence, sans effet à l'exécution) afin d'éviter un conflit avec d'autres travaux en cours ;
  leur suppression est différée à une PR de suivi. L'`AppProject` ArgoCD `crossplane` est de même conservé un cycle de
  synchronisation de plus, pour qu'ArgoCD puisse élaguer les Applications Crossplane avant la suppression du projet.
- _2026-07-05_ : **REMOVAL** : Abandon de la XRD `DomainIdentity` et du `DomainIdentityComponent`, retirés de Crossplane
  et de l'ossature Pulumi : les e-mails sortants de chezmoi.sh passent désormais par Mailjet, ce qui rend inutilisée la
  configuration de l'identité de domaine AWS SES.
- _2026-07-05_ : **FEATURE** : Mise à jour de l'état de mise en œuvre : `catalog/pulumi/` et les cinq stacks par projet
  en place avec parité 1:1 des ressources (#1091, exécution encore en attente).
- _2026-07-05_ : **FEATURE** : Création initiale de l'ADR, qui documente la migration de Crossplane vers Pulumi pour la
  gestion de l'infrastructure cloud, avec un modèle d'exécution étagé (local d'abord, dans le cluster différé), ce qui
  tranche l'orientation de #1091.

## Pour aller plus loin

- [ADR-003 Conventions de nommage des chemins OpenBao](./ADR-003-Conventions-de-Nommage-des-Chemins-OpenBao.md) et
  [ADR-004 Conventions de nommage des politiques OpenBao](./ADR-004-Conventions-de-Nommage-des-Politiques-OpenBao.md) :
  les conventions que les ressources Vault/OpenBao migrées doivent continuer de suivre.
- [ADR-008 Ansible plutôt que Kubernetes pour Kazimierz](./ADR-008-Ansible-plutot-que-Kubernetes-pour-Kazimierz.md) : un
  cas antérieur de choix d'un modèle d'exécution plus léger plutôt que d'un motif imposé dans le cluster.
- [Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
  : la procédure d'état et d'import sur le backend Garage.
- [Expérience Pulumi contre Crossplane](../experiments/20260702-pulumi-crossplane-evaluation/README.md) : le POC (#1089)
  dont les constats fondent cette décision.
- [Issue #1091](https://github.com/chezmoidotsh/arcane/issues/1091) : la migration que cet ADR décide ; import, familles
  et désinstallation y sont suivis. Voir aussi #1089 (POC), #1097 (Garage), #370 (reconstruction de `rhodes`),
  #1092/#1093/#1095 (fournisseurs natifs), #1094 (inventaire de l'infrastructure manuelle) et l'épopée parente #1072.
- [Pulumi, backends DIY compatibles S3](https://www.pulumi.com/docs/iac/operations/stack-management/using-a-diy-backend/)
  : la documentation du backend d'état.
- [Pulumi Kubernetes Operator](https://github.com/pulumi/pulumi-kubernetes-operator) : la cible d'exécution de la
  phase 2.
- [Garage](https://garagehq.deuxfleurs.fr/) : le backend d'état compatible S3.
