---
status: "implemented"
date: 2026-10-11
decision-makers: ["Alexandre"]
assisted-by: ["claude-opus-4.8", "claude-sonnet-5"]
informed: []
template-version: "2.0.0"
---

# ADR-015 Migrer Crossplane vers Pulumi

## Contexte et problème

`amiya.akn` exécute Crossplane comme unique contrôleur de l'infrastructure cloud et périphérique au cloud. Le modèle de
Crossplane installe **un paquet de fournisseur par famille d'API cloud**, chacun composé d'un Deployment et de son
propre jeu de CRD, et exprime la logique de démultiplication (une claim qui produit de nombreuses ressources gérées) au
moyen de XRD et de Compositions personnalisées. Cela représente aujourd'hui 12 paquets de fournisseurs, deux XRD
personnalisées (`ClusterVault`, `DomainIdentity`), environ 8 jetons Cloudflare, environ 19 ressources Vault/OpenBao,
environ 9 ressources AWS SES/Cloudflare et 6 Workspaces Terraform exécutés via `provider-terraform`.

Ce modèle par fournisseur ne passe pas à l'échelle sur du matériel de homelab. La migration de `kazimierz.akn` de
Hetzner vers Oracle Cloud (#1010, #1076) a été le point de bascule : l'intégration de quelques ressources OCI a exigé
**7 paquets de fournisseurs supplémentaires et environ 500 ressources Kubernetes supplémentaires**. Cette surcharge
structurelle (Deployments de fournisseurs, CRD et objets de ressources gérées qui se multiplient par famille d'API) est
le problème concret, compté directement dans le POC (#1089, §1). Le coût en CPU et en RAM qui s'y ajoute devrait être
important, mais il n'a pas été quantifié (les critères d'empreinte V-005 et V-006 du POC sont `Pending`) : la décision
repose sur l'explosion structurelle observée, pas sur un écart de ressources non mesuré.

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
  > ACME sont gérés via Pulumi : ce sont des objets de configuration d'administration, pas la création ou la suppression
  > de VM et de LXC, et ils ne portent pas le risque de cycle de confiance que ce hors-périmètre vise à bloquer.
  > L'exception ne tient que tant que `stack/proxmox/` (comme chaque stack `chezmoi-sh-infra` aujourd'hui) s'exécute
  > **localement** (phase 1 de cet ADR, voir Mise en œuvre). Si l'exécution de Pulumi passe un jour dans le cluster
  > (phase 2), `stack/proxmox/` doit rester exclue de cette migration, sinon le cycle exact
  > `Proxmox → héberge K8s → K8s gère Proxmox` se rouvre par elle.

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
- **Opérateur Kubernetes mature pour la future exécution dans le cluster** : l'exécution dans le cluster reste la cible
  finale ; cette phase est différée, pas abandonnée.
- **Fournisseurs natifs faciles à écrire** : l'outil doit permettre d'écrire un fournisseur natif sur l'API propre à un
  produit, pour couvrir des produits comme Garage, Talos Omni ou Pocket-Id.
- **Sûreté pendant la migration** : l'adoption doit importer les ressources existantes sans aucune recréation
  (`pulumi import`, `pulumi preview` propre) et n'introduire aucune fenêtre où deux contrôleurs réconcilient la même
  ressource.

## Options envisagées

### Option 1 : Terraform / OpenTofu

> **Statut : REJETÉE**

L'alternative IaC courante, déjà en partie présente dans le dépôt : les 6 Workspaces Terraform s'exécutent aujourd'hui
via `provider-terraform` de Crossplane. Standardiser sur Terraform/OpenTofu consoliderait l'ensemble sur un outil très
répandu, doté d'un large écosystème de fournisseurs, et s'exécuterait aussi hors cluster, ce qui satisfait la contrainte
de `rhodes`.

- `+` Large écosystème ; exécutable hors cluster ; déjà en partie utilisée.
- `-` La logique de composition et de démultiplication (`ClusterVault`/`DomainIdentity`) s'exprime moins bien en modules
  HCL qu'en code.
- `-` Opérateur Kubernetes moins abouti que celui de Pulumi, ce qui compte pour la phase différée dans le cluster.
- `-` Plus de friction pour le travail assisté par IA et pour l'écriture de fournisseurs natifs.

### Option 2 : Pulumi

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

**Option retenue : « Pulumi » (option 2).**

Les deux options sortent du modèle par fournisseur de Crossplane et s'exécutent sans cluster, ce que la reconstruction
de `rhodes` (#370) exige. Terraform et OpenTofu franchissent donc les deux seuils, mais perdent face à Pulumi sur quatre
points qui relèvent de l'appréciation du mainteneur :

- **Composition sous forme de code, pas de modules HCL.** La démultiplication `ClusterVault`/`DomainIdentity` se traduit
  naturellement en une `ComponentResource` Pulumi (du vrai TypeScript), plus maintenable que son équivalent en modules
  Terraform.
- **Meilleur opérateur Kubernetes.** Le Pulumi Kubernetes Operator est jugé nettement mieux conçu que les options
  d'opérateur de Terraform, ce qui est décisif puisque l'exécution dans le cluster est la cible _finale_ : la phase
  différée doit s'appuyer sur un opérateur solide.
- **Ergonomie pour l'assistance par IA.** Une base de code TypeScript courante est plus simple à manipuler pour des
  assistants IA que du HCL, ce qui compte pour un homelab à opérateur unique qui s'appuie sur l'IA.
- **Fournisseurs natifs moins coûteux.** Écrire un fournisseur natif à partir de l'API d'un produit (Garage, Omni,
  Pocket-Id) est jugé plus simple avec le modèle de fournisseur de Pulumi qu'avec celui de Terraform.

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
- (+) Les 6 Workspaces Terraform que Crossplane exécutait via `provider-terraform` sont réécrits avec les fournisseurs
  Pulumi natifs (`@pulumi/hcloud`, `@pulumi/tailscale`) : plus de HCL à maintenir à côté du TypeScript.

### Négatives

- (-) **Tant que l'exécution est locale (phase actuelle)** : aucune réconciliation continue des dérives (une dérive
  n'apparaît que lorsqu'une personne lance `pulumi preview`) et aucune visibilité de l'état du cloud dans l'interface
  d'ArgoCD. Ce sont précisément les propriétés que la **phase différée dans le cluster** rétablit : ce sont donc des
  limites de phase, pas des régressions permanentes.
- (-) La surface de chaîne d'approvisionnement de Pulumi (dépendances npm exécutées avec des identifiants cloud) doit
  être maîtrisée : légèrement maintenant (installations `npm ci` à lockfile strict en local), et avec les protections
  des pods d'exécution identifiées par le POC à l'arrivée de la phase dans le cluster (voir Mise en œuvre).

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
  différée, pas rejetée : elle n'est risquée que _maintenant_, en pleine migration. À son arrivée, les protections des
  pods d'exécution identifiées par le POC redeviennent pertinentes : étiquette d'image épinglée (téléchargements
  `IfNotPresent`), cache npm éphémère propre au pod et `CiliumNetworkPolicy` de sortie par Stack.

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

- **Composants terminés** : `catalog/pulumi/` (dont le composant `ClusterVaultComponent`) et les stacks par projet sous
  `projects/*/src/infrastructure/pulumi/`, avec l'état dans Garage ; les Workspaces Terraform réécrits avec
  `@pulumi/hcloud` et `@pulumi/tailscale` ; Crossplane désinstallé et `catalog/crossplane/` supprimé. La XRD
  `DomainIdentity` a été abandonnée plutôt que migrée, les e-mails sortants passant désormais par Mailjet.
- **Composants restants** : la suppression de l'`AppProject` ArgoCD `crossplane` de `rhodes.akn`
  ([#1327](https://github.com/chezmoidotsh/arcane/pull/1327)), le nettoyage des motifs `infrastructure/crossplane` de
  `scripts/dist:render` ([#1326](https://github.com/chezmoidotsh/arcane/issues/1326)), et la phase 2 d'exécution dans le
  cluster, différée par décision.
- **Spécification des standards** : composants partagés dans `catalog/pulumi/` ; stacks par projet dans
  `projects/<périmètre>/src/infrastructure/pulumi/`, sur le modèle du découpage `catalog/crossplane/` +
  `projects/<cluster>/src/infrastructure/crossplane/` qu'elles remplacent.

---

## Évolution de la décision

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
- **2026-07-05 (cet ADR)** : décision de migrer de Crossplane vers Pulumi, motivée par la surcharge structurelle par
  fournisseur et par l'exigence « sans cluster » de `rhodes`, Terraform/OpenTofu ayant été étudié puis écarté. Exécution
  étagée : locale d'abord pendant la migration, dans le cluster (Pulumi Operator) différée comme cible finale.
- **2026-07-02 (POC, #1089)** : évaluation de Pulumi face à Crossplane via le Pulumi Kubernetes Operator dans le
  cluster. Parité fonctionnelle et Garage comme backend d'état confirmés ; empreinte de ressources non mesurée
  (V-005/V-006 en attente).

---

## Historique des modifications

- **2026-10-11** : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections
  renommées, sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, émojis des
  conséquences remplacés par les marqueurs du gabarit, `template-version` passé de `1.1.0` à `2.0.0`. L'option «
  conserver Crossplane », qui n'en était pas une (la raison de partir est dans le contexte), est retirée :
  Terraform/OpenTofu et Pulumi deviennent les options 1 et 2, et les arguments contre Terraform passent dans
  `Décision retenue`. Conséquences transitoires ou hors sujet retirées, état de mise en œuvre condensé, évolution de la
  décision triée du plus récent au plus ancien. Décision et dates d'origine inchangées.
- **2026-10-11** : **FEATURE** : Passage de `status` de `accepted` à `implemented`, sans `implementation-completed` (le
  texte ne fixe aucune date de fin). Le dépôt prouve que la migration est faite : `catalog/crossplane/` n'existe plus,
  aucun dossier `infrastructure/crossplane` ne subsiste sous `projects/`, des stacks Pulumi existent pour six projets
  (`projects/*/src/infrastructure/pulumi/`) avec le backend Garage dans leurs `Pulumi.yaml`, et `AGENTS.md` établit
  qu'aucun Crossplane n'existe dans l'arbre. Restent l'`AppProject` `crossplane` de `rhodes.akn`, des motifs dans
  `scripts/dist:render` et la phase 2, différée par décision. Les imports sur les ressources actives n'ont pas pu être
  vérifiés. Suites renvoyées vers [#1326](https://github.com/chezmoidotsh/arcane/issues/1326) et
  [#1327](https://github.com/chezmoidotsh/arcane/pull/1327) dans `Détails de mise en œuvre et état` (sans réécrire la
  décision), mise à jour de `date`.
- **2026-07-19** : **FEATURE** : Amendement du hors-périmètre sur Proxmox par une exception étroite pour les ACL, le
  SDN, le stockage de sauvegarde, les pools et ACME (#1118), limitée de façon à rester compatible avec le raisonnement
  d'origine sur le cycle de confiance tant que l'exécution de Pulumi reste locale (phase 1).
- **2026-07-07** : **DEPRECATION** : Désinstallation de Crossplane sur `amiya.akn` : contrôleur, définitions de
  fournisseurs, stacks d'infrastructure par projet, politiques réseau et politique d'approvisionnement OpenBao supprimés
  au profit du remplaçant Pulumi déjà en place (#1091). Les XRD et Compositions partagées de `catalog/crossplane/` sont
  conservées pour l'instant (sans référence, sans effet à l'exécution) afin d'éviter un conflit avec d'autres travaux en
  cours ; leur suppression est différée à une PR de suivi. L'`AppProject` ArgoCD `crossplane` est de même conservé un
  cycle de synchronisation de plus, pour qu'ArgoCD puisse élaguer les Applications Crossplane avant la suppression du
  projet.
- **2026-07-05** : **DEPRECATION** : Abandon de la XRD `DomainIdentity` et du `DomainIdentityComponent`, retirés de
  Crossplane et de l'ossature Pulumi : les e-mails sortants de chezmoi.sh passent désormais par Mailjet, ce qui rend
  inutilisée la configuration de l'identité de domaine AWS SES.
- **2026-07-05** : **FEATURE** : Mise à jour de l'état de mise en œuvre : `catalog/pulumi/` et les cinq stacks par
  projet en place avec parité 1:1 des ressources (#1091, exécution encore en attente).
- **2026-07-05** : **FEATURE** : Création initiale de l'ADR, qui documente la migration de Crossplane vers Pulumi pour
  la gestion de l'infrastructure cloud, avec un modèle d'exécution étagé (local d'abord, dans le cluster différé), ce
  qui tranche l'orientation de #1091.

---

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
