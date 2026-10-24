---
status: "implemented"
date: 2026-10-11
decision-makers: ["Alexandre"]
assisted-by: ["github-copilot:claude-sonnet-4.6"]
informed: []
template-version: "2.0.0"
---

# ADR-010 Remplacer Gitmoji par des symboles de type de commit

> [!NOTE]\
> Cette convention a depuis été extraite dans un dépôt dédié, [axnic/gitsym](https://github.com/axnic/gitsym), qui en
> porte la spécification et la configuration commitlint réutilisable.

## Contexte et problème

Depuis le début du projet, les commits suivent la convention [Gitmoji](https://gitmoji.dev/) : chaque sujet de commit
est préfixé d'un code Gitmoji (par exemple `:sparkles:`, `:bug:`, `:arrow_up:`), suivi d'un scope obligatoire entre
parenthèses et de deux-points. Le format est imposé par `commitlint` via `.commitlintrc.js` et validé en local par le
hook Trunk `commitlint`.

Trois problèmes ressortent de cette pratique.

**Les emojis ne s'affichent jamais vraiment.** L'avantage affiché de Gitmoji, encoder un type de changement dans un seul
caractère visuel, n'existe que si l'emoji est rendu. Dans tous les contextes où les commits sont le plus souvent lus
(`git log` dans un terminal, sortie de CI, correctifs par e-mail, diffs en texte brut), le code `:sparkles:` s'affiche
tel quel. Le jeton est plus long que le mot qu'il remplace (`feat`) et n'apporte rien visuellement.

**Le lexique est surdimensionné par rapport à l'usage réel.** `.commitlintrc.js` définit 48 types autorisés. L'analyse
de tout l'historique git montre que 18 seulement ont déjà été utilisés, et 12 seulement plus de cinq fois. Les 30 autres
types existent, mais alourdissent la charge cognitive à chaque choix de type.

**Le lexique dessert l'expressivité au lieu de la servir.** Avec 48 types, choisir le bon type impose de consulter la
table, et le code s'affiche ensuite en texte brut dans le terminal. L'expressivité promise par Gitmoji n'apparaît que
lorsque l'emoji est rendu ; en pratique, elle ajoute une étape de décision sans ajouter de signal. C'est le contraire de
ce qu'une convention de types de commit doit apporter.

La question stratégique à laquelle cet ADR répond est la suivante : **comment simplifier le format de commit au point que
chaque type soit reconnaissable d'emblée dans un `git log` d'une ligne, que tout le vocabulaire tienne sur un écran et
que le format reste non ambigu quel que soit l'environnement d'affichage ?**

## Facteurs de décision

- **Exigences fonctionnelles** :
  - Chaque commit porte un type, un scope obligatoire et un sujet.
  - Les changements incompatibles s'expriment dans l'en-tête, sans dépendre du corps du commit.
  - Le format passe la validation `commitlint` lors du commit local et en CI.
- **Exigences non fonctionnelles** :
  - Les types sont repérables d'un coup d'œil dans un `git log --oneline` en terminal.
  - Les types sont non ambigus : impossible de les confondre avec le début d'un sujet.
  - Le vocabulaire est assez petit pour tenir en mémoire de travail (environ 12 types).
  - Les caractères se saisissent sans touche modificatrice ni méthode de saisie dédiée (IME).
- **Contraintes** :
  - Les commits générés par Renovate utilisent le scope `deps` ; le type doit s'accommoder de l'automatisation.
  - La convention remplace Gitmoji de bout en bout : `commitlintrc.js`, le skill git-commit, `AGENTS.md` et le skill
    `create-pr` doivent être mis à jour de façon atomique.
  - Les commits historiques n'ont pas à être réécrits.

## Options envisagées

### Option 1 : conserver Gitmoji

> **Statut : REJETÉE**

Continuer avec le format actuel `:nom_emoji:(scope): Sujet`. Aucun changement d'outillage ni de documentation.

- `+` Aucun coût de migration.
- `+` Outillage déjà en place et validé.
- `-` Les emojis ne s'affichent jamais là où les commits sont le plus lus (terminal, CI, e-mail).
- `-` Vocabulaire de 48 types pour un dépôt où 12 types couvrent 95 % des commits.

### Option 2 : Conventional Commits

> **Statut : REJETÉE**

Adopter le format standard de l'industrie `type(scope): Sujet` avec le vocabulaire de Conventional Commits (`feat`,
`fix`, `docs`, `chore`, `refactor`, `ci`, `perf`, `revert`, `deps`).

Conventional Commits est largement compris et pris en charge nativement par semantic-release, les générateurs de
changelog et la plupart des outils de commit. Son vocabulaire est bien défini et réduit.

- `+` Standard de l'industrie : tout développeur le connaît déjà.
- `+` Prise en charge native dans semantic-release, commitizen et les outils de changelog.
- `+` `feat`, `fix` et `docs` sont non ambigus.
- `-` `chore` est un fourre-tout sans précision sémantique : tout ce qui n'est ni une fonctionnalité ni un correctif
  tend à y tomber, ce qui dégrade le signal avec le temps.
- `-` Le délimiteur de scope `(scope)` est la même parenthèse que dans de nombreux autres contextes ; il ne ressort pas
  visuellement dans une ligne de log.
- `-` Pour un dépôt personnel et solo, l'argument du standard de l'industrie pèse peu : aucune équipe à accueillir,
  aucun outil externe ne consomme les types de commit et aucun versionnement sémantique ne dépend de `feat` face à
  `fix`.
- `-` `ci` relève du scope, pas du type : un changement de pipeline CI est un ajout, un correctif ou un refactoring ;
  confondre type et scope réduit la précision.

### Option 3 : types symboliques avec scope entre crochets

> **Statut : ACCEPTÉE**

Remplacer les codes Gitmoji par des symboles ASCII uniques. Remplacer le délimiteur de scope entre parenthèses par des
crochets, notation naturelle d'une liste dans tous les langages de programmation, ce qui rend les commits à scopes
multiples (`[scope1,scope2]`) intuitifs plutôt que bricolés sur un champ à valeur unique.

Le format complet devient `type[scope]: Sujet`.

Chaque type tient en un caractère (deux pour les changements incompatibles, voir plus bas). L'ensemble des types valides
est choisi pour couvrir les 12 usages réels extraits de l'historique git, avec un joker (`*`) pour tout ce qui n'entre
pas dans une catégorie. Les changements incompatibles ajoutent `!` au type (`+!`, `~!`, `-!`), lisible comme « plus-bang
» ou « change-bang », ce qui signale l'urgence visuellement sans jeton séparé. `#` a été délibérément écarté comme type,
car git traite les lignes qui commencent par `#` comme des commentaires dans les messages de commit.

- `+` Types d'un seul caractère : densité d'information maximale dans `git log --oneline`.
- `+` Les crochets distinguent visuellement le scope du texte environnant, même quand le nom du scope contient des
  deux-points (`project:amiya.akn`).
- `+` Un vocabulaire de 12 types tient en mémoire ; aucune table de consultation n'est nécessaire après une semaine.
- `+` Le marqueur de changement incompatible est dans l'en-tête et lisible par machine sans inspecter le corps.
- `+` `!` comme type (correctif) a une sémantique intuitive : le point d'exclamation signale que « quelque chose
  n'allait pas ».
- `-` Les symboles demandent un apprentissage de la correspondance ; le sens de `~` ou de `=` n'est pas évident pour un
  lecteur extérieur qui ne connaît pas la convention.
- `-` Incompatible avec l'outillage existant en l'état ; `commitlintrc.js` doit être entièrement réécrit.

## Décision retenue

**Option retenue : « types symboliques avec scope entre crochets »**, parce que c'est la seule option qui satisfait
simultanément tous les facteurs de décision. Conventional Commits serait le bon choix pour une équipe ou un projet avec
versionnement sémantique, ce qui n'est pas le cas ici. La verbosité de Gitmoji et son problème d'affichage sont
structurels : aucun changement de configuration ne les corrige. Le vocabulaire symbolique est déroutant à la première
rencontre, mais devient plus rapide que tout système à base de mots une fois assimilé, puisque chaque type demande
exactement une frappe.

Le suffixe `!` pour les changements incompatibles sacrifie un symbole (`!` pour le correctif) afin d'obtenir
l'expression des ruptures dans l'en-tête. Ce compromis est acceptable pour deux raisons : (a) les correctifs sont rares
dans un dépôt d'infrastructure où la plupart des changements sont des ajouts ou des montées de version délibérés, et (b)
un changement incompatible dans un dépôt d'infrastructure de homelab exige de toute façon une documentation dans le
corps du commit : le marqueur dans l'en-tête aide au balayage visuel, il ne remplace pas l'explication.

---

## Détails de mise en œuvre et état

### Vocabulaire des types

| Type | Signification                                                                     | Remplace                                                      |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `+`  | Ajout : nouvelle fonctionnalité, service, ressource, déploiement initial          | `:sparkles:` `:rocket:` `:tada:` `:bricks:`                   |
| `-`  | Suppression : service, fichier, code mort                                         | `:fire:` `:wastebasket:` `:coffin:`                           |
| `~`  | Amélioration : performance, mise à jour de configuration, comportement (hors bug) | `:wrench:` `:zap:` `:technologist:`                           |
| `!`  | Correctif : réparation d'un bug ou d'un comportement cassé                        | `:bug:` `:ambulance:` `:adhesive_bandage:` `:rotating_light:` |
| `=`  | Sans changement de comportement : refactoring, style, tests, DX                   | `:recycle:` `:art:` `:green_heart:` `:building_construction:` |
| `^`  | Montée de version : mise à jour d'une dépendance                                  | `:arrow_up:` `:arrow_down:` `:pushpin:`                       |
| `>`  | Déplacement : renommage ou déplacement de ressources                              | `:truck:`                                                     |
| `<`  | Annulation : retour sur un commit précédent                                       | `:rewind:`                                                    |
| `@`  | Documentation : ADR, README, procédures, commentaires                             | `:memo:` `:bulb:`                                             |
| `$`  | Sécurité : correctif, politique, gestion des secrets                              | `:lock:` `:closed_lock_with_key:` `:passport_control:`        |
| `?`  | Expérience : POC, investigation, recherche                                        | `:alembic:` `:test_tube:`                                     |
| `*`  | Joker : ne correspond à aucun autre type                                          | —                                                             |

### Spécification complète du format

```text
type[!][scope[,scope2]]: Sujet commençant par une majuscule

Corps expliquant POURQUOI, 80 caractères par ligne au maximum. Obligatoire pour les changements non triviaux.
Pour les changements incompatibles, le corps DOIT contenir un paragraphe BREAKING CHANGE:.

Assisted-by: <provider>:<model-id>
```

Exemples :

```text
+[project:lungmen.akn]: Add Forgejo Git hosting service
^[deps]: cert-manager to v1.16.0
![project:amiya.akn]: Fix OIDC redirect loop after Pocket-Id migration
~[project:amiya.akn,catalog:kustomize]: Tune cert-manager renewal window
=[gh]: Extract base overlays from catalog kustomize
@[gh]: Add ADR-010 documenting commit type convention
```

### Changements incompatibles

Seuls l'ajout, l'amélioration et la suppression peuvent introduire un changement incompatible. Un correctif qui casse
quelque chose est par définition un changement structurel, pas un correctif.

| Valides        | Invalides                          | Justification                                                                                                                                                                    |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+!` `~!` `-!` | `!!` `=!` `@!` `?!` `*!` `^!` `>!` | Correctif, documentation, absence de changement de comportement, expérience, sécurité, montée de version, déplacement et annulation ne peuvent pas être incompatibles par nature |

Les commits à changement incompatible **doivent** inclure dans le corps un paragraphe `BREAKING CHANGE:` qui explique ce
qui casse et comment migrer.

```text
~![project:amiya.akn]: Drop Authelia in favor of Pocket-Id native OIDC

Authelia introduced operational overhead with its LDAP dependency.
Pocket-Id covers the same OIDC use cases natively.

BREAKING CHANGE: All services relying on Authelia OIDC endpoints must
update their client_id and redirect URIs before this commit is deployed.

Assisted-by: github-copilot:claude-sonnet-4.6
```

### Spécification des standards

- **Délimiteur de scope** : `[` `]` (crochets).
- **Scopes multiples** : séparés par des virgules à l'intérieur des crochets, sans espace : `[scope1,scope2]`.
- **Marqueur de changement incompatible** : `!` immédiatement après le type, avant `[` : `+![scope]:`.
- **Sujet** : casse de phrase (première lettre en majuscule), mode impératif, sans point final, 100 caractères au
  maximum.
- **Corps** : obligatoire pour tous les changements non triviaux ; explique POURQUOI, pas QUOI ; 80 caractères par
  ligne.
- **Corps d'un changement incompatible** : paragraphe `BREAKING CHANGE:` obligatoire quand `!` est utilisé.
- **Trailer** : `Assisted-by: <provider>:<model-id>` quand une assistance par IA a été utilisée.
- **Signature** : commits signés GPG (`-S`) ; `Signed-off-by` (`-s`) relève de la responsabilité du committer humain,
  les agents ne doivent pas l'ajouter.

---

## Historique des modifications

- **2026-10-11** : **CHORE** : Migration vers le gabarit d'ADR 2.0.0 (version française) : traduction, sections
  renommées, sommaire manuel supprimé, titre aligné sur le nom de fichier, section `Pour aller plus loin`,
  `template-version` ajouté. Décision, options, chronologie et dates d'origine inchangées.
- **2026-10-11** : **FEATURE** : Passage de `status` de `accepted` à `implemented`, sans `implementation-completed`
  (aucune date de fin n'est établie par le texte de l'ADR). Le dépôt prouve l'application : `.commitlintrc.js` définit
  les 12 types symboliques, les variantes `+!` `~!` `-!`, le motif d'en-tête `type[scope]: Subject` et le scope
  obligatoire ; `.agents/skills/git-commit/SKILL.md` documente le format ; le hook `commitlint` est activé dans
  `.rtunk/rtunk.yaml`. L'écart du preset `:gitmoji` de `renovate.json5` est suivi par
  [#1326](https://github.com/chezmoidotsh/arcane/issues/1326) ; `date` mise à jour.
- **2026-05-24** : **FEATURE** : Création initiale de l'ADR, qui documente le remplacement de Gitmoji par une convention
  de types de commit symboliques.

---

## Pour aller plus loin

- [axnic/gitsym](https://github.com/axnic/gitsym) : la convention extraite de cet ADR, avec sa spécification.
- [Renovate](../reference/Renovate-Reference.md) : la configuration Renovate et l'écart du preset `:gitmoji`.
- [Configuration de commitlint](../../.commitlintrc.js) : la liste faisant foi des types et des scopes.
- [Skill git-commit](../../.agents/skills/git-commit/SKILL.md) : le processus de rédaction des commits pour les agents.
- [Gitmoji](https://gitmoji.dev/) : la convention précédente.
- [Conventional Commits](https://www.conventionalcommits.org/) : l'alternative envisagée et écartée.
- [Analyse de l'usage des emojis dans git log](https://github.com/chezmoidotsh/arcane) : mesure d'origine, par
  `git log --oneline --no-merges | grep -oE ':[a-z_]+:' | sort | uniq -c | sort -rn`.
