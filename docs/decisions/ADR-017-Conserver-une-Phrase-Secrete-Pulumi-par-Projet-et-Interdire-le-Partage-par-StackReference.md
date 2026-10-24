---
status: "proposed"
date: 2026-10-24
decision-makers: ["Alexandre"]
assisted-by: ["claude-sonnet-5.5"]
informed: []
template-version: "2.0.0"
---

# ADR-017 Conserver une phrase secrète Pulumi par projet et interdire le partage par StackReference

## Contexte et problème

Chaque projet Pulumi sous `projects/*/src/infrastructure/pulumi/` (aujourd'hui `chezmoi.sh`, `hass`, `kazimierz.akn`,
`lungmen.akn`, `rhodes.akn`, `rimbilliton.akn`) stocke son état dans le même bucket S3 Garage (`pulumi-states`, voir
[`INF-20260705-00`](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)) et
utilise le fournisseur de secrets par défaut, la phrase secrète (_passphrase_). Chaque projet a sa propre
`PULUMI_CONFIG_PASSPHRASE`, conservée dans un `.mise/env.yaml` chiffré avec SOPS/age que `mise` déchiffre à l'entrée du
répertoire du projet. Cette phrase secrète protège les secrets de configuration du projet et chaque valeur secrète de
son état.

L'issue [#1171](https://github.com/chezmoidotsh/arcane/issues/1171) soulève deux inquiétudes. D'abord, une stack qui lit
la sortie d'une autre stack avec `pulumi.StackReference` ne peut pas déchiffrer une sortie secrète chiffrée avec une
autre phrase secrète : Pulumi l'élide (« eliding undecryptable secrets ») au lieu d'échouer. Ensuite, un futur Pulumi
Kubernetes Operator aurait besoin d'un `Secret` de phrase secrète par CR `Stack`.

Ce que le dépôt montre réellement (vérifié statiquement, sans accès aux clusters) :

- `StackReference` est instancié à six endroits : `hass`, `kazimierz.akn`, `lungmen.akn` et `rhodes.akn` lisent chacun
  des identifiants de groupes depuis `chezmoi.sh` (`getOutput` : `adminGroupId`, `maisonGroupId`, `familleGroupId`, tous
  des UUID Pocket-Id) ; `rimbilliton.akn` lit le compartiment OCI `chezmoiSh` depuis `kazimierz.akn` ; `rhodes.akn` lit
  `garageBackupBucketId` depuis `amiya.akn` ; une septième occurrence, commentée, se trouve dans `rimbilliton.akn`.
  **Aucune des sorties consommées n'est un secret** : rien n'est élidé aujourd'hui.
- La référence à `amiya.akn` dans `projects/rhodes.akn/.../stack/cloudnative-pg.ts` pointe vers une stack dont aucun
  projet ne subsiste dans l'arborescence, et aucun export `garageBackupBucketId` n'existe dans le dépôt. C'est un
  reliquat d'avant la migration (voir `docs/migrations/amiya.akn->rhodes.akn.md`) et un nettoyage distinct, hors de
  cette décision.
- Le seul cas où un secret a vraiment dû traverser des projets (les jetons Proxmox `rhodes-akn-bootstrap@pve` et
  `lungmen-akn-bootstrap@pve`) a déjà été résolu en écrivant un `Secret` Kubernetes directement dans le cluster cible.
  Les commentaires de `chezmoi.sh/.../proxmox/access/{rhodes,lungmen}-akn-bootstrap.ts` indiquent que des phrases
  secrètes séparées sont voulues : une phrase secrète divulguée ne doit pas exposer les secrets d'un autre projet.
- L'ADR-015 fait du Pulumi Kubernetes Operator la phase 2 cible, « différée, pas rejetée », et la phase 1 (exécution
  locale) est en cours. Aucune issue ni aucun document ne planifie l'adoption de l'Operator à une date donnée.

Le problème est donc un piège latent, pas une panne avérée. **La question stratégique est : comment faire traverser les
secrets entre stacks Pulumi, et comment provisionner les phrases secrètes des stacks, pour un homelab à opérateur unique
avec une exécution locale aujourd'hui et un Operator dans le cluster plus tard ?**

## Hors périmètre

- Migrer vers le Pulumi Kubernetes Operator : l'ADR-015 le diffère ; cet ADR vérifie seulement que le choix ne le
  bloque pas.
- Changer le backend d'état (Garage S3) ou passer à Pulumi Cloud.
- Faire tourner une phrase secrète existante : aucune option ci-dessous ne l'exige dans la voie recommandée.
- Nettoyer la `StackReference` orpheline vers `amiya.akn` (suivi distinct).

## Facteurs de décision

- **Simplicité et maintenabilité** : usage personnel, pragmatisme plutôt que perfection.
- **Rayon d'impact** : une phrase secrète divulguée doit exposer un projet, pas toutes les stacks (la justification
  actuelle).
- **Reprise après sinistre** : l'état Pulumi vit sur le NAS derrière `pve-01`, et `rhodes.akn` héberge OpenBao. La
  reconstruction ne doit pas exiger un service que Pulumi doit lui-même reconstruire d'abord.
- **Aucune nouvelle dépendance payante ou hébergée** : l'état est volontairement auto-hébergé, sans Pulumi Cloud.
- **Échouer bruyamment** : un secret illisible ne doit pas devenir vide en silence.
- **Compatibilité avec l'Operator** : une voie doit exister, même si elle n'est pas prise maintenant.

## Options envisagées

### Option 1 : pérenniser le mécanisme actuel et le rendre plus résilient

> **Statut : ACCEPTÉE**

Garder une phrase secrète par projet et rendre explicite la frontière que le dépôt respecte déjà de fait, en deux temps :

- **Avant le bootstrap** (tant qu'OpenBao et Pocket-Id ne sont pas disponibles) : les stacks nécessaires au démarrage
  sont isolées et regroupées dans `chezmoi.sh`. Elles ne manipulent aucun secret : tout ce qu'elles échangent est une
  valeur non secrète (identifiant, nom), lisible par `StackReference` sans que les phrases secrètes aient à coïncider.
- **Après le bootstrap** : toute donnée partagée entre projets, secrète ou non, passe par OpenBao (ADR-001 à ADR-004),
  jamais par `StackReference`. Le producteur l'écrit dans un chemin OpenBao, le consommateur la lit (fournisseur Vault
  de Pulumi, ou `ExternalSecret` côté cluster). C'est déjà la voie suivie pour les jetons Proxmox de bootstrap, qui
  atterrissent dans un `Secret` Kubernetes du cluster cible.

Un garde-fou statique (par exemple un grep en CI qui rejette `StackReference` hors du périmètre de bootstrap) transforme
l'élision silencieuse en échec à la revue. À l'adoption de l'Operator, chaque CR `Stack` reçoit sa phrase secrète par un
`ExternalSecret` qui lit OpenBao ; avec six stacks, cela fait six petits manifestes, pas un problème de conception.

- `+` Aucune migration de l'état chiffré des stacks en production.
- `+` Préserve le rayon d'impact par projet.
- `+` Le bootstrap ne dépend d'aucun service qu'il doit lui-même reconstruire ; après lui, OpenBao est la seule voie de
  partage, donc un seul endroit à auditer.
- `+` Aucune nouvelle dépendance hors de celles déjà en place.
- `-` Il faut inventorier les stacks de bootstrap et déplacer dans `chezmoi.sh` celles qui n'y sont pas, ce qui est un
  chantier réel.
- `-` Les lectures par `StackReference` des identifiants de groupes Pocket-Id passent par OpenBao : un chemin à définir
  et une écriture de plus côté producteur.
- `-` Six phrases secrètes à provisionner pour l'Operator au lieu d'une (atténué en générant les `ExternalSecret` depuis
  le même `ApplicationSet` qui crée les CR `Stack`).
- `-` Un garde-fou applique une convention, ce n'est pas une barrière technique : une revue ou un lint doit détecter les
  violations.

### Option 2 : une seule phrase secrète pour toutes les stacks

> **Statut : REJETÉE**

Tous les projets partagent une même `PULUMI_CONFIG_PASSPHRASE`. Les lectures de secrets par `StackReference`
déchiffreraient alors, et l'Operator n'aurait besoin que d'un `Secret`. Les stacks existantes doivent être rechiffrées
(`pulumi stack change-secrets-provider` avec la nouvelle phrase secrète) une par une sur l'état en production.

- `+` Les lectures de secrets entre stacks fonctionnent de façon transparente ; un seul `Secret` pour l'Operator.
- `-` Une seule phrase secrète divulguée ouvre toutes les stacks, y compris `chezmoi.sh` (mot de passe root Proxmox,
  identifiants Tailscale et Cloudflare). Cela défait l'isolation sur laquelle s'appuient les commentaires du dépôt.
- `-` Exige de toucher à l'état chiffré de chaque stack en production pour un bénéfice que personne n'utilise
  aujourd'hui.

### Option 3 : phrase secrète stockée dans OpenBao

> **Statut : REJETÉE**

Les phrases secrètes passent de `.mise/env.yaml` à OpenBao et sont lues au chargement de l'environnement `mise` et par
l'Operator.

- `+` Un seul magasin audité, rotation facile ; s'intègre à l'Operator via External Secrets.
- `-` Dépendance circulaire : OpenBao tourne sur `rhodes.akn`, dont les montages et backends d'authentification sont
  provisionnés par la stack Pulumi de `rhodes` (`cluster-vault`). Reconstruire `rhodes` exigerait la phrase secrète
  détenue par ce qu'on reconstruit. La documentation de reprise après sinistre de `rhodes.akn` évite volontairement ces
  boucles (voir les commentaires de `cloudnative-pg.ts`).
- `-` Chaque commande `pulumi` locale exige désormais une connexion à Vault et un cluster joignable, une régression par
  rapport à `mise` qui déchiffre un fichier SOPS local hors ligne.

### Option 4 : Pulumi ESC

> **Statut : REJETÉE**

Pulumi ESC (Environments, Secrets and Configuration) centralise la configuration et les secrets, et peut être importé
entre stacks.

- `+` Conçu pour partager secrets et configuration entre stacks, avec un support de premier plan pour l'Operator.
- `-` C'est un service Pulumi Cloud (une édition auto-hébergée n'existe que dans l'offre entreprise). Le dépôt n'a
  volontairement aucun lien avec Pulumi Cloud ; adopter ESC inverse ce choix pour résoudre un problème qui ne se produit
  pas actuellement.
- `-` Ajoute un SaaS externe à la chaîne de reprise après sinistre et un identifiant de compte Pulumi à protéger. (Les
  tarifs et niveaux de fonctionnalités n'ont pas été vérifiés pour cet ADR.)

### Option 5 : fournisseur de secrets KMS ou Vault transit

> **Statut : REJETÉE**

Basculer chaque stack vers un fournisseur de secrets `hashivault://` (transit) ou KMS cloud, pour que le déchiffrement
soit autorisé par une politique de clé plutôt que par une phrase secrète partagée, et que les lectures entre stacks
fonctionnent pour toute identité autorisée sur la clé.

- `+` Des clés par stack avec politiques : le partage est un octroi explicite, la rotation est une opération sur la clé,
  plus de fichiers de phrase secrète.
- `-` Le transit sur OpenBao a la même circularité avec `rhodes` que l'option 3 et fait d'OpenBao un prérequis dur de
  chaque commande `pulumi`. Un KMS cloud est une dépendance externe et demande des identifiants à chaque session
  d'opérateur et pour le pod de l'Operator.
- `-` Le fonctionnement du fournisseur `hashivault` de Pulumi contre OpenBao n'a pas été vérifié ici ; il faudrait le
  tester avant de reconsidérer cette option.
- `-` Même risque de rechiffrement de l'état en production que l'option 2, pour chaque stack.

## Décision retenue

**Option retenue : « Pérenniser le mécanisme actuel et le rendre plus résilient » (option 1).**

Le seul besoin observé de faire traverser un secret entre projets a été satisfait sans partager de phrase secrète, et
les commentaires aux sites d'appel montrent que l'isolation est voulue. L'option 1 garde cette isolation et ne la
complète que par une règle de partage : un bootstrap sans secret, puis OpenBao pour tout le reste. Les options 2 à 5
paient toutes un prix réel dès maintenant (rechiffrer l'état en production, ou placer OpenBao ou un SaaS dans la chaîne
de reprise de Pulumi) pour supprimer une défaillance qui ne s'est jamais produite, ce qui contredit « pragmatique plutôt
que parfait ». Les options 3 et 5 introduisent en plus une boucle de bootstrap via `rhodes.akn`, le cluster que l'état
Pulumi est le plus susceptible de devoir reconstruire : l'option 1 évite cette boucle précisément en cantonnant le
bootstrap à des stacks sans secret, qui n'ont pas besoin d'OpenBao. Le coût accepté est l'inventaire et le déplacement
des stacks de bootstrap, six `Secret` de phrase secrète pour l'Operator au lieu d'un, et une convention appliquée par un
garde-fou plutôt que par la plateforme.

Ce qui changerait la décision : un cas réel de secret qui doit être lu par un projet avant qu'OpenBao soit disponible
(il faudrait alors évaluer l'option 5 avec un KMS cloud, après vérification du comportement), ou un déploiement de
l'Operator où six `ExternalSecret` s'avèrent pesants.

## Conséquences

### Positives

- (+) Aucun changement de l'état chiffré en production.
- (+) L'isolation entre projets reste intacte, y compris sous l'Operator.
- (+) La reconstruction après sinistre démarre par des stacks sans secret, donc sans dépendance à OpenBao.

### Négatives

- (-) La règle reste une convention tant que le garde-fou n'existe pas. D'ici là, un contributeur pourrait encore
  exporter un secret et le consommer par `StackReference`, et il serait élidé en silence.
- (-) Le périmètre de bootstrap doit être tenu à jour : une stack ajoutée à tort dans ce périmètre réintroduit
  `StackReference` là où la règle l'interdit.
- (-) Le provisionnement de la phrase secrète par stack reste une étape par projet dans la phase Operator.

### Neutres

- (\~) Les critères de mise en œuvre de l'issue #1171 (« approche retenue mise en œuvre sur toutes les stacks ») se
  réduisent à : inventorier et isoler le bootstrap, ajouter le garde-fou et supprimer la référence orpheline à
  `amiya.akn`.

## Détails de mise en œuvre et état

Cet ADR ne met rien en œuvre. Travail restant, à suivre sur #1171 :

- Inventorier les stacks nécessaires au bootstrap et regrouper dans `chezmoi.sh` celles qui n'y sont pas, sans secret.
- Faire passer par OpenBao les données lues aujourd'hui par `StackReference` après le bootstrap (identifiants de groupes
  Pocket-Id inclus), selon les conventions de nommage de l'ADR-003.
- Ajouter le garde-fou (grep en CI ou lint) sur les lectures de `StackReference` hors du périmètre de bootstrap.
- Supprimer la `StackReference` vers `amiya.akn` quand `rhodes.akn` n'a plus besoin d'accéder à son bucket.
- À l'adoption de l'Operator, générer un `ExternalSecret` par CR `Stack` depuis OpenBao.

> [!WARNING]\
> **Non vérifié.** Aucun accès aux clusters n'était disponible. Il n'a pas été vérifié que les phrases secrètes diffèrent
> réellement d'un projet à l'autre (les fichiers `env.yaml` sont chiffrés avec SOPS), qu'aucune stack en production
> n'exporte une sortie secrète consommée ailleurs, que la stack `amiya.akn` existe encore dans le bucket Garage, ni que
> le fournisseur `hashivault` de Pulumi accepte OpenBao.

### Mode d'emploi pour l'opérateur

Quand une stack a besoin d'une valeur produite par un autre projet, le choix dépend du moment où elle est produite, pas
de sa nature.

**Stack de bootstrap (avant OpenBao et Pocket-Id) : `StackReference` sur une valeur non secrète.** La stack productrice
vit dans `chezmoi.sh` et n'exporte aucun secret.

1. Dans le projet producteur, exporter la valeur en clair, sous un nom explicite.
2. Dans le projet consommateur, lire la valeur avec `getOutput` sur une `StackReference`.

**Après le bootstrap : OpenBao, jamais de `StackReference`, que la valeur soit secrète ou non.** Précédent : le jeton
Proxmox `rhodes-akn-bootstrap@pve`, écrit directement dans le cluster cible.

1. Dans le projet producteur, écrire la valeur dans le système où elle sera consommée : un chemin OpenBao (ADR-001 à
   ADR-004), ou un `Secret` Kubernetes du cluster cible
   (`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/access/rhodes-akn-bootstrap.ts`, avec un
   `k8s.Provider` qui vise le cluster cible).
2. Ne pas exporter cette valeur comme sortie de stack.
3. Dans le projet consommateur, relire la valeur depuis OpenBao, ou la laisser à l'`ExternalSecret` qui lit OpenBao
   (`projects/rhodes.akn/src/infrastructure/pulumi/stack/proxmox.ts` illustre la relecture d'un `Secret` du cluster).

**Reconnaître le symptôme.** Si un secret a été exporté puis lu par `StackReference` entre deux projets de phrases
secrètes différentes, `pulumi preview` ou `pulumi up` du consommateur affiche
`eliding undecryptable secrets for stack reference '<organisation>/<projet>/<stack>'` et la valeur lue est vide (voir
[Cas similaires](#cas-similaires) pour le test). Pulumi n'échoue pas. Pour corriger : retirer l'export secret du
producteur et passer par la voie OpenBao ci-dessus. Ne pas aligner les phrases secrètes pour faire
disparaître l'avertissement (option 2, rejetée).

> [!WARNING]\
> Le garde-fou en CI n'est **pas implémenté**. Il est seulement proposé (option 1) et son suivi reste à ouvrir dans une
> issue distincte. Aujourd'hui, seule la revue de code empêche d'exporter un secret lu par `StackReference`.

Si un humain décide plus tard d'adopter un autre fournisseur (options 2 à 5), la séquence sûre par stack, exécutée
depuis le répertoire du projet, est : (1) sauvegarder l'état (`pulumi stack export --show-secrets` est interdit dans un
terminal partagé ; copier plutôt l'objet de la stack sous `.pulumi/stacks/` dans le bucket) et le `env.yaml` SOPS ; (2)
`pulumi preview` pour confirmer un état de référence propre ; (3)
`pulumi stack change-secrets-provider <nouveau-fournisseur>` (pour le fournisseur à phrase secrète, l'ancienne phrase
secrète est dans `PULUMI_CONFIG_PASSPHRASE` et la nouvelle est demandée), puis mettre à jour `.mise/env.yaml` avec
`sops` ; (4) `pulumi preview` de nouveau, qui ne doit montrer ni changement ni erreur de déchiffrement ; (5) pour
revenir en arrière, restaurer l'objet d'état sauvegardé et le `env.yaml` précédent. Traiter une stack à la fois,
`chezmoi.sh` en dernier.

### Cas similaires

Sources communautaires (fil de discussion du Slack Pulumi archivé), pas de la documentation officielle.

- Des échecs de `StackReference` quand les stacks n'ont pas la même phrase secrète ou des clés KMS distinctes sont
  rapportés :
  [fil 15743347](https://archive.pulumi.com/t/15743347/need-some-help-pretty-stuck-how-can-i-reference-a-stack-when),
  [fil 16766106](https://archive.pulumi.com/t/16766106/in-order-to-use-a-stack-reference-to-obtain-outputs-from-ano) et
  [fil 2844075](https://archive.pulumi.com/t/2844075/i-m-attempting-to-use-stackreference-to-the-test-stack-with-).
- Contournements vus dans ces fils : partager la phrase secrète (option 2), utiliser Pulumi ESC (option 4, hébergé, donc
  en conflit avec le facteur « aucune dépendance hébergée » ; une
  [intégration avec External Secrets Operator](https://www.pulumi.com/docs/esc/integrations/kubernetes/external-secrets-operator)
  existe), ou un fournisseur KMS (option 5).
- Aucune documentation officielle trouvée sur une phrase secrète propre à chaque CR `Stack` du Pulumi Kubernetes
  Operator. Ce point reste à vérifier avant l'adoption de l'Operator.

### Test local : sortie non secrète et phrases secrètes différentes

Question ouverte : une sortie non secrète reste-t-elle lisible par `StackReference` quand les deux stacks ont des
`PULUMI_CONFIG_PASSPHRASE` différentes ?

- **Date** : 2026-10-20. **Version** : Pulumi v3.268.0.
- **Protocole** : backend fichier local jetable (`pulumi login file://…`, aucun état ni phrase secrète du dépôt), runtime
  YAML. La stack `a` (phrase secrète `passA`) exporte `plain` (chaîne) et `sec` (chaîne secrète). La stack `r` (phrase
  secrète `passR`) lit les deux avec une `StackReference` vers `a`.
- **Résultat** : `gotPlain` vaut `hello-plain` (lisible). `gotSecret` est vide (`{}` avec `--show-secrets`). Pulumi
  affiche `eliding undecryptable secrets for stack reference 'organization/a/dev'` et l'opération réussit.
- **Conséquence** : l'affirmation de l'ADR est confirmée, une sortie non secrète traverse les phrases secrètes. Nuance :
  l'avertissement est émis dès que la stack référencée contient au moins une sortie secrète, même si seules des sorties
  non secrètes sont lues.

## Historique des modifications

- **2026-10-24** : **CLARIFICATION** : L'option 1 devient « pérenniser le mécanisme actuel et le rendre plus
  résilient » : bootstrap sans secret regroupé dans `chezmoi.sh`, puis partage de toute donnée par OpenBao. Le mode
  d'emploi, les conséquences et la décision suivent.
- **2026-10-20** : **CLARIFICATION** : Ajout du mode d'emploi opérateur, des cas similaires et du test local de
  `StackReference` ; facteur de décision reformulé.
- **2026-10-20** : **CHORE** : Traduction en français et mise au gabarit 2.0.0 (renommé de
  `016-pulumi-stack-secret-sharing.md` en `ADR-017`, le numéro 016 étant pris par l'ADR NixOS pour Kazimierz). Faits et
  décision inchangés.
- **2026-10-08** : **FEATURE** : Proposition initiale.

## Pour aller plus loin

- [ADR-015](ADR-015-Migrer-Crossplane-vers-Pulumi.md) : adoption de Pulumi et phase Operator différée.
- [ADR-001](ADR-001-Gestion-Centralisee-des-Secrets.md) et [ADR-002](ADR-002-Topologie-des-Secrets-OpenBao.md) :
  OpenBao comme source des secrets.
- [`INF-20260705-00`](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md) :
  organisation du backend d'état et du fournisseur de secrets.
- [Secrets Pulumi](https://www.pulumi.com/docs/iac/concepts/secrets/) et
  [`pulumi stack change-secrets-provider`](https://www.pulumi.com/docs/iac/cli/commands/pulumi_stack_change-secrets-provider/) :
  documentation des fournisseurs de secrets.
- [Pulumi ESC](https://www.pulumi.com/docs/esc/) : documentation du service évalué à l'option 4.
- [Issue #1171](https://github.com/chezmoidotsh/arcane/issues/1171) : demande à l'origine de cet ADR.
- [Fil communautaire 15743347](https://archive.pulumi.com/t/15743347/need-some-help-pretty-stuck-how-can-i-reference-a-stack-when),
  [fil 16766106](https://archive.pulumi.com/t/16766106/in-order-to-use-a-stack-reference-to-obtain-outputs-from-ano) et
  [fil 2844075](https://archive.pulumi.com/t/2844075/i-m-attempting-to-use-stackreference-to-the-test-stack-with-) :
  rapports d'échecs de `StackReference` (sources communautaires).
- [Pulumi ESC avec External Secrets Operator](https://www.pulumi.com/docs/esc/integrations/kubernetes/external-secrets-operator) :
  intégration citée dans les cas similaires.
