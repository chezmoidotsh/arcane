# ADR-007 Structure des projets et conventions de nommage

> Cet ADR fixait les conventions de structure et de nommage des projets Arcane. Il est archivé parce qu'il mêlait trois
> décisions distinctes à une spécification de plus de mille lignes, et que son contexte ne correspondait pas à ce qu'il
> tranchait.

Cet ADR a été écrit le 2025-10-31 après un audit de `amiya.akn`, `lungmen.akn` et `chezmoi.sh`, puis révisé le 2025-11-02,
le 2026-01-13 et le 2026-05-24. Son statut était `implemented`.

> [!NOTE]\
> **Archivé le 2026-10-18.** Le document n'est plus tenu à jour et aucune page ne le remplace en entier (voir plus
> bas).

## Ce que couvrait le document

Le contexte décrivait un audit qui avait relevé des incohérences de structure, de nommage de fichiers, de labels
Kubernetes et d'organisation des ressources entre trois projets. Les options ne tranchaient pourtant que trois questions.
La première était le contrôle de la synchronisation ArgoCD d'une application : le préfixe astérisque du 2025-10-31 a été
remplacé le 2026-01-13 par des fichiers `.application.patch`. La deuxième était le schéma de labels, révisé le 2025-11-02
pour ne garder que des labels standard minimaux. La troisième était le nommage des HTTPRoute selon leur contexte.

Une spécification en douze domaines s'y ajoutait : répertoires, fichiers, labels, images de conteneurs, annotations,
ressources, kustomizations, répertoire de sécurité, secrets, bases de données, namespaces et motifs de structure d'un
projet. Elle n'avait ni option ni justification propre.

## Pourquoi il est archivé

Lors de la relecture de la migration, le mainteneur a relevé que le contexte annonçait un chantier de structure complet
alors que les décisions portaient sur trois points sans lien direct, et que la spécification ne justifiait rien. Il a
choisi de l'archiver plutôt que de le réécrire.

Le dépôt, relu le 2026-10-18, confirme que le document ne décrit plus l'état réel. Les ApplicationSets de
`projects/rhodes.akn/src/argocd/shoot.apps/` fusionnent bien les fichiers `.application.patch`, mais aucun répertoire
préfixé par `*` n'existe plus. Huit kustomizations d'applications placent `app.kubernetes.io/instance` dans `labels`, ce que
la révision du 2025-11-02 interdisait. Le nom de la datasource Renovate est `github-releases`, non `github-release` comme
l'ADR l'écrivait. Enfin `amiya.akn` est devenu `rhodes.akn`, Crossplane a laissé la place à Pulumi, Longhorn au plugin
Proxmox CSI et Envoy Gateway à la Gateway Cilium.

Aucune page ne remplace le document en entier. Les conventions vivent dans le code de `projects/` ; la structure du dépôt
est décrite dans [AGENTS.md](../../AGENTS.md), les labels de version et les datasources dans
[la référence Renovate](../reference/Renovate-Reference.md), et les manifestes pré-rendus de `dist/` dans
[l'ADR-011](../decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md).

## Texte intégral

Le texte d'origine, tel qu'il était au dernier commit avant la migration, est dans l'historique Git :
[`docs/decisions/007-project-structure-and-naming-conventions.md`](https://github.com/chezmoidotsh/arcane/blob/71690f13fc2532f652eb3f3a8f04f063b7a35372/docs/decisions/007-project-structure-and-naming-conventions.md). La version française migrée est dans
l'historique de la pull request 1321.

## Pour aller plus loin

- [Référence Renovate](../reference/Renovate-Reference.md) : les datasources et les labels de version qui complétaient cet
  ADR.
- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](../decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md) : le motif des manifestes
  pré-rendus de `dist/`.
- [ADR-015 Migrer Crossplane vers Pulumi](../decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md) : le remplacement de
  Crossplane cité par l'ADR archivé.
