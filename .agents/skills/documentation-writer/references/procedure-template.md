<!--
  GABARIT DE PROCÉDURE v2.0.0 — voir la section "Template Versioning" de
  .agents/skills/documentation-writer/references/procedure.md pour l'historique et les règles de ce fichier.
  Supprimer ce commentaire HTML à la rédaction. Contrairement aux ADR, une procédure n'a pas de front matter de
  version : la provenance est dans l'historique Git et dans la section Historique.
  Le titre `#` reprend le nom du fichier (<ID>-<Verbes-en-Francais>.md), sans tirets entre les mots.
-->

# {PREFIX}-{YYYYMMDD}-{NN} {Titre}

> Un ou deux paragraphes (pas de puces) : ce que fait la procédure, quels composants elle touche et pourquoi elle existe
> sous forme de procédure reproductible plutôt que de savoir tacite. Deux ou trois phrases suffisent en général — voir
> SEC-20250808-00 ou INF-20260525-00 pour la bonne longueur.

{Écrire l'introduction ici...}

> [!WARNING]\
> {Facultatif — à inclure tant que la procédure n'a pas été rejouée de bout en bout : « Vérifiée contre le dépôt le
> AAAA-MM-JJ ; les commandes n'ont pas été rejouées sur le cluster. » Pour une procédure jamais exécutée, utiliser un
> `[!CAUTION]` qui le dit.}

## Cadre technique et conventions [Facultatif]

> À inclure quand la procédure impose des règles de nommage, des conventions de chemin ou une pile technique que le
> lecteur doit connaître avant les étapes (SEC-20250808-00 en est un bon exemple : convention de chemin Vault, nommage
> des fichiers SecurityPolicy, règle d'ordre Authelia). À omettre quand la procédure est une suite directe d'étapes sans
> convention de ce genre (MIGR-20260628-00 l'omet).

- **{Nom de la convention}** : {La règle, énoncée précisément, et pourquoi elle compte — les revues, conflits ou
  problèmes de reproductibilité qu'elle évite.}

## Prérequis

> Lister chaque outil à installer ou configurer et chaque accès nécessaire. Être exhaustif : un opérateur en plein
> incident ne doit jamais découvrir un prérequis manquant à la troisième étape.

Avant de commencer, vérifier que les outils suivants sont installés et configurés : `{outil1}`, `{outil2}`, ...

Les accès suivants sont également nécessaires :

- {Accès 1 — par exemple « accès `kubectl` avec les droits de gestion des ressources du namespace cible »}
- {Accès 2}

## Entrées requises

> Nommer les variables à définir avant d'exécuter les étapes : ce sont les marqueurs utilisés partout (par exemple
> `APP_DIR`, `CLUSTER`, `HOSTNAME`). Chaque étape référence ces variables au lieu de répéter des valeurs brutes, pour
> que la procédure reste copiable d'une exécution à l'autre. Les déclarer dans un seul bloc `export`, une variable par
> ligne : un marqueur `<…>` pour la valeur attendue, un exemple en commentaire de fin de ligne.

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export {VAR_1}=<{Ce que c'est}>   # ex. projects/<cluster>/src/apps/<app>
export {VAR_2}=<{Ce que c'est}>   # ex. {valeur d'exemple}
```

## Étape 1 — {Titre de l'action}

{Un court paragraphe de contexte si l'étape en a besoin : pourquoi elle existe, quel état elle modifie. L'omettre si la
commande se comprend d'elle-même.}

```bash
# {Commentaire expliquant ce que fait la commande, pas seulement la reformulation de celle-ci}
{commande utilisant les marqueurs ${VAR_1} déclarés plus haut}
# → {sortie attendue, ou comment la lire, pour que le lecteur se vérifie avant de continuer}
```

> [!NOTE]\
> {Ce que le lecteur doit savoir et qui ne tient pas en ligne — un choix de conception fait à cette étape, une mise en
> garde non évidente.}

## Étape 2 — {Titre de l'action}

...

## Étape N — {Titre de l'action}

...

> [!IMPORTANT]\
> {Pour une contrainte qui, si elle est ratée, casse une étape suivante ou provoque une perte de données.}

## Exemple complet : {Cas réel concret} [Facultatif — recommandé quand les étapes utilisent des marqueurs]

> Rejouer les étapes avec un cas réel et concret (un vrai cluster, une vraie application ou un vrai incident sur lequel
> la procédure a été exécutée), avec les valeurs réelles à la place des marqueurs. C'est ce qui rend la procédure fiable
> et copiable pour le prochain cas, au lieu d'obliger le lecteur à la redériver. À omettre seulement quand la procédure
> ci-dessus est déjà entièrement concrète, sans marqueur à résoudre.

### {Titre de la sous-étape}

```bash
{Mêmes commandes que ci-dessus, avec les valeurs réelles}
```

## Vérifications rapides

> Une liste de contrôle compacte pour savoir si c'est vraiment terminé, distincte de la sortie attendue de chaque étape.
> Utile à un opérateur qui revient plus tard confirmer que le correctif tient, ou qui veut un récapitulatif rapide sans
> relire toutes les étapes.

- **{Nom du contrôle}** : `{commande}` — {à quoi ressemble un résultat sain}
- **{Nom du contrôle}** : `{commande}` — {à quoi ressemble un résultat sain}

## Retour arrière [Facultatif — à inclure dès qu'une étape n'est pas naturellement réversible]

> Les redimensionnements de PVC, déplacements d'objets S3, réinitialisations de cluster, bascules DNS et opérations
> similaires, irréversibles par défaut, ont besoin d'une issue de secours explicite. Donner les commandes exactes de
> l'annulation, pas seulement « restaurer depuis la sauvegarde ».

```bash
{Commandes exactes pour annuler les effets de la procédure}
```

## Problèmes connus [Facultatif — pour les procédures complexes en plusieurs phases]

> À inclure quand les mêmes cas limites reviennent à chaque exécution (OMNI-20260721-00 est le modèle : application
> automatique du CNI qui échoue silencieusement, coupure de connectivité pendant la reprise par Cilium, machine classes
> effacées lors d'une réinitialisation). Chaque entrée dit ce qui se passe, pourquoi et le contournement — omettre
> entièrement la section pour une procédure courte à but unique.

### {Titre du problème}

{Ce qui se passe, la cause racine et le contournement.}

## Historique

> Du plus récent au plus ancien.

- _{AAAA-MM-JJ}_ : {Ce qui a changé dans cette procédure et pourquoi — pas ce qui a changé dans le système qu'elle
  opère}

## Pour aller plus loin

> Deux à cinq liens relatifs vers des fichiers `.md`, chacun avec une phrase d'introduction. Cette section est la
> dernière section `##` de la page.

- [{Page liée}]({../chemin/Page.md}) : {Documentation officielle, RFC ou guide éditeur sur lesquels s'appuient les
  étapes}
- [{ADR}]({../decisions/ADR-NNN-Titre.md}) : {La décision de conception que cette procédure met en œuvre, si elle est
  documentée ailleurs}
- [{Post-mortem}]({../incidents/Incident-AAAA-MM-JJ-Titre.md}) : {L'incident de `docs/incidents/` à l'origine de cette
  procédure, le cas échéant}
