---
status: "implemented"
date: 2026-10-11
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-4-6"]
informed: []
template-version: "2.0.0"
---

# ADR-012 Remplacer Kyverno par OPA

## Contexte et problème

Tous les clusters de ce homelab utilisent un miroir OCI Zot local (`oci.chezmoi.sh`) pour les images de conteneurs, ce
qui renforce la chaîne d'approvisionnement et réduit la dépendance à des registres externes. La MutatingPolicy Kyverno
`enforce-local-registry` réécrivait à l'exécution chaque référence d'image vers le miroir local. Le 2026-05-26, cette
politique a provoqué une panne sur l'ensemble du cluster `amiya.akn` (le cluster de plateforme centrale) parce qu'elle
s'appliquait à `longhorn-system` : il en résultait une dépendance circulaire, Longhorn ayant besoin de Zot pour tirer
ses images alors que le PVC de stockage de Zot reposait sur Longhorn. Lors des redémarrages de pods, la chaîne s'est
rompue et a provoqué des `ImagePullBackOff` en cascade sur tout le cluster.

Kyverno a été retiré entièrement par le commit `8780c40f`, par mesure d'urgence. L'incident est documenté dans
[l'incident du 2026-05-26](../incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md).

La question stratégique à laquelle cet ADR répond est la suivante : **comment imposer que toutes les images de
conteneurs passent par le miroir OCI local, sans réintroduire un contrôleur d'admission à l'exécution capable de créer
des dépendances circulaires pendant l'amorçage du cluster ?**

## Facteurs de décision

- **Exigences fonctionnelles** :
  - Toute image de conteneur des namespaces hors infrastructure doit être tirée via `oci.chezmoi.sh`.
  - Les namespaces d'infrastructure (`kube-system`, `longhorn-system`, etc.) doivent être exemptés pour éviter les
    dépendances circulaires.
  - Les violations de politique doivent être détectées avant la fusion, pas au moment du déploiement.

- **Exigences non fonctionnelles** :
  - Aucune dépendance à l'exécution du mécanisme d'application de la politique : pas de webhook d'admission, pas de
    contrôleur de mutation qui aurait lui-même besoin d'images.
  - La politique est versionnée avec les manifestes qu'elle valide.
  - Les développeurs _(c'est-à-dire moi)_ obtiennent un retour immédiat dans les PR grâce à la CI.

- **Contraintes** :
  - Le dépôt utilise ArgoCD pour le GitOps ; l'ajout de nouveaux contrôleurs côté cluster doit se justifier face au
    principe de simplicité de l'âge d'acier (Steel Age).
  - L'incident du 2026-05-26 a prouvé que la mutation à l'exécution des références d'image est fondamentalement
    dangereuse dans un homelab où le registre dépend de la couche de stockage.

## Options envisagées

### Option A : Kyverno avec exclusions de namespaces (rétablissement)

> **Statut : REJETÉE**

Réinstaller Kyverno avec une liste d'exclusions élargie qui inclut `longhorn-system`. La MutatingPolicy existante serait
rétablie avec le correctif appliqué. C'est l'option au changement minimal : elle traite le mode de défaillance précis
sans modifier l'architecture.

Le problème de fond demeure toutefois : Kyverno est lui-même une charge de travail du cluster, exécutée sous forme de
Deployments qui consomment des images. Si Zot (le registre local) devient indisponible, quelle qu'en soit la raison
(disque plein, partition réseau, erreur de configuration), Kyverno ne peut plus appliquer la politique de façon fiable,
et le cluster entre dans un état où le moteur de politiques dépend de l'infrastructure qu'il contrôle. L'incident du
2026-05-26 a été déclenché par une exclusion de namespace manquante, mais la cause racine est le motif architectural de
la mutation d'images à l'exécution.

- `+` Rétablit le comportement existant avec un effort minimal.
- `+` L'application à l'exécution détecte les dérives que la CI peut manquer (par exemple un `kubectl apply` manuel).
- `-` N'élimine pas la classe de défaillances par dépendance circulaire : ne corrige qu'une instance.
- `-` L'empreinte de Kyverno (mémoire et CPU requis) est importante pour un homelab à un seul opérateur.

### Option B : politiques OPA/Rego appliquées en CI avec conftest

> **Statut : ACCEPTÉE**

Porter la politique `enforce-local-registry` du DSL YAML de Kyverno vers Rego. Exécuter
[conftest](https://www.conftest.dev/) dans un workflow GitHub Actions sur chaque PR et chaque merge group qui touche des
fichiers YAML de `projects/`. La politique vit dans `catalog/opa/policies/`, à côté des manifestes qu'elle valide.

Cette approche supprime entièrement la dépendance à l'exécution. Les violations de politique sont détectées au moment de
la PR, avant que le manifeste n'atteigne le cluster. Il n'y a ni webhook d'admission, ni contrôleur de mutation, ni
composant côté cluster susceptible de tomber en panne. Le workflow de CI constitue la frontière d'application.

- `+` Aucune dépendance à l'exécution : pas de webhook d'admission, pas de risque de dépendance circulaire.
- `+` Politique en tant que code : versionnée, relue et testée avec les manifestes.
- `+` Retour immédiat aux développeurs dans les PR via GitHub Actions.
- `+` Léger : conftest est un binaire statique unique, sans ressource dans le cluster.
- `-` Pas d'application à l'exécution : un `kubectl apply` direct contourne la vérification.
- `-` Les développeurs doivent exécuter conftest en local ou s'appuyer sur la CI pour le retour.

### Option C : OPA Gatekeeper pour le contrôle d'admission à l'exécution

> **Statut : DIFFÉRÉE** (phase 3 de l'issue #1005)

Installer OPA Gatekeeper comme webhook d'admission avec les mêmes politiques Rego que l'option B. Cela fournit une
application à la fois en CI et à l'exécution : conftest détecte les violations dans les PR, Gatekeeper détecte ce qui
atteint le cluster par d'autres chemins.

Gatekeeper est plus léger que Kyverno (pas de prolifération de CRD, architecture plus simple) et prend en charge les
mêmes politiques Rego. Il réintroduit toutefois un contrôleur d'admission à l'exécution, la même classe de composant que
celle qui a causé l'incident d'origine. Son déploiement peut être sûr si le namespace de Gatekeeper est lui-même exclu
de l'application des politiques, mais la complexité d'exploitation ne se justifie pas pour un homelab à un seul
opérateur.

- `+` Application complète à l'exécution, complémentaire de la CI.
- `+` Utilise les mêmes politiques Rego que l'option B : aucune duplication.
- `+` Plus léger que Kyverno (constraint templates plutôt que CRD par politique).
- `-` Réintroduit un webhook d'admission : même classe de défaillance que Kyverno.
- `-` Composant supplémentaire côté cluster à maintenir et à mettre à jour.
- `-` Non justifié pour un homelab à un seul opérateur à ce stade.

## Décision retenue

**Option retenue : « Politiques OPA/Rego appliquées en CI avec conftest » (option B)**, parce qu'elle élimine
complètement la classe de défaillances par dépendance circulaire qui a causé l'incident du 2026-05-26. La cause racine
n'était pas une exclusion de namespace manquante : c'était le motif architectural de la mutation des références d'image
à l'exécution, dans un cluster où le registre dépend de la couche de stockage. L'application en CI seule contourne ce
problème en faisant du dépôt Git la frontière d'application, ce qui s'aligne avec le modèle GitOps où Git est l'unique
source de vérité.

L'absence d'application à l'exécution (le principal inconvénient) est acceptable parce que tous les changements passent
par le GitOps (ArgoCD). Le `kubectl apply` direct ne fait pas partie du flux standard et serait détecté par la revue
opérationnelle. Si l'application à l'exécution devient nécessaire, Gatekeeper (option C) pourra s'ajouter par-dessus les
mêmes politiques Rego, sans remplacer la couche de CI.

---

## Conséquences

### Positives

- (+) Élimine entièrement la classe de dépendances circulaires liées au webhook d'admission.
- (+) Rego est un langage de politiques standard et bien documenté : pas de verrouillage chez un éditeur.
- (+) Les mêmes politiques Rego sont réutilisables avec Gatekeeper si l'application à l'exécution devient nécessaire.
- (+) Le workflow de CI donne une visibilité des violations de politique au niveau de la PR.
- (+) Aucune consommation de ressources dans le cluster par un moteur de politiques.

### Négatives

- (-) Un `kubectl apply` contourne la vérification : une discipline opérationnelle est nécessaire.
- (-) La migration initiale des politiques exige d'auditer tous les manifestes existants pour leur conformité.
- (-) conftest ajoute une dépendance à la CI (téléchargement d'un binaire externe).

### Neutres

- (\~) La politique est d'abord non bloquante (`continue-on-error: true`) pour permettre une mise en conformité
  progressive. Une fois tous les manifestes mis à jour avec les préfixes `oci.chezmoi.sh`, le workflow deviendra
  bloquant.

---

## Détails de mise en œuvre et état

- **Composants terminés** : politiques Rego (`catalog/opa/policies/SEC001:kubernetes.rego`,
  `catalog/opa/policies/SEC001:cloudnative-pg.rego`), tests unitaires (29/29 réussis), intégration à trunk
  (`.trunk/trunk.yaml`, linter conftest sur `dist/`), workflow de CI (`.github/workflows/pull_request.conftest.yaml`),
  documentation de la règle (`catalog/opa/rules/SEC001-enforce-local-registry.md`), README du répertoire
  (`catalog/opa/README.md`).

- **Composants restants** : auditer tous les manifestes pour la conformité au préfixe `oci.chezmoi.sh`. Rendre le
  workflow de CI bloquant une fois toutes les violations résolues.

- **Architecture** :

```text
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Developer   │────▶│  GitHub PR       │────▶│   ArgoCD    │
│  pushes YAML │     │  conftest CI job │     │   applies   │
└──────────────┘     │  (enforcement)   │     └─────────────┘
                     └──────────────────┘
                               │
                        ┌──────▼──────┐
                        │ Rego policy │
                        │ (catalog/   │
                        │  opa/)      │
                        └─────────────┘
```

- **Spécification des standards** :
  - Toutes les politiques Rego vivent dans `catalog/opa/policies/`.
  - Les politiques utilisent des règles `deny[msg]` compatibles à la fois avec conftest et avec Gatekeeper.
  - Les namespaces exclus sont définis dans la politique Rego sous forme de constante ensemble.

---

## Historique des modifications

- **2026-10-11** : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections
  renommées, sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`, statut de
  l'option C traduit en `DIFFÉRÉE`, `template-version` ajouté. Décision, options, chronologie et dates d'origine
  inchangées.
- **2026-10-11** : **FEATURE** : Passage de `status` de `accepted` à `implemented`, sans `implementation-completed` (le
  texte n'établit pas de date de fin). Le dépôt prouve que la décision est appliquée : politiques Rego et tests dans
  `catalog/opa/policies/`, conftest exécuté sur les répertoires `dist/` par les workflows `*.compliance-*.yaml` sans
  `continue-on-error`, aucun manifeste Kyverno dans `projects/*/src` ni dans `catalog/`. Mise à jour de `date`. Les
  chemins cités (`.trunk/trunk.yaml`, `pull_request.conftest.yaml`) sont ceux de la décision ; les sections
  `Détails de mise en œuvre et état` et `Conséquences` n'ont pas été réécrites, hormis les préfixes `(+)`, `(-)` et
  `(\~)` des conséquences.
- **2026-05-29** : **FEATURE** : Création initiale de l'ADR, qui documente la décision de remplacer Kyverno par une
  application OPA/Rego en CI avec conftest.

---

## Pour aller plus loin

- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](./ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md) :
  le durcissement complémentaire de la chaîne d'approvisionnement, dont les `dist/` que conftest vérifie.
- [Incident du 2026-05-26](../incidents/2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md) : l'incident qui a
  déclenché cette décision.
- [Documentation des politiques OPA](../../catalog/opa/README.md) : les politiques et les règles en vigueur.
- [conftest](https://www.conftest.dev/) : l'outil d'application des politiques sur les manifestes Kubernetes.
- [OPA Gatekeeper](https://open-policy-agent.github.io/gatekeeper/) : l'option d'application à l'exécution différée.
