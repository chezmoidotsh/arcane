---
status: "{proposed | accepted | implemented | rejected | deprecated | superseded by ADR-0123}"
date: { YYYY-MM-DD when the decision was last updated }
implementation-completed: { YYYY-MM-DD when the implementation was finalized (optional) }
decision-makers: ["Alexandre"]
assisted-by: ["<model-name>"]
informed: []
template-version: "3.0.0"
---

<!--
  GABARIT D'ADR v3.0.0 — voir la section "Template Versioning" de
  .agents/skills/documentation-writer/references/adr.md pour l'historique et les règles de ce fichier.
  Conserver le champ `template-version` du front matter : il enregistre la révision du gabarit qui a produit l'ADR.
  La version 3.0.0 supprime la grille d'options : un ADR donne le contexte du problème, la réponse, puis explique
  pourquoi cette réponse et pas une autre. Les clés du front matter et les valeurs de
  `status` restent en anglais : des scripts et la convention des ADR les lisent. Supprimer ce commentaire HTML à la
  rédaction. Le titre `#` reprend le nom du fichier (ADR-NNN-Titre-En-Francais.md), sans tirets entre les mots.
-->

# ADR-{NNN} {Titre court, représentatif du problème résolu et de la solution retenue}

## Contexte et problème

> Décrire le contexte et le problème en paragraphes clairs et complets, pas seulement en puces. Expliquer précisément
> pourquoi cette décision est nécessaire maintenant, sans omettre de détail technique.
>
> Couvrir explicitement :
>
> - **Vue d'ensemble de l'architecture actuelle** : comment les choses fonctionnent aujourd'hui.
> - **Problèmes critiques identifiés** : ce qui est cassé, limitant ou manquant dans l'approche actuelle.
> - **Question stratégique** : la question centrale à laquelle cet ADR répond, écrite en gras.
>
> C'est aussi ici que l'on dit pourquoi l'état actuel ne tient plus : le statu quo ne revient pas plus bas comme une
> alternative.

{Écrire ici un contexte complet...}

## Hors périmètre [Facultatif]

> Lister ce que cet ADR ne décide délibérément PAS et ne couvre pas. Les points hors périmètre évitent la dérive du
> champ et empêchent un lecteur de prendre une omission pour un oubli. Inclure cette section quand l'un des cas suivants
> s'applique :
>
> - Une décision liée est déjà actée ailleurs et constitue une _prémisse_ ici (l'énoncer, pour que cet ADR ne soit pas
>   lu comme la rouvrant).
> - La décision exclut délibérément un domaine voisin tentant (dire pourquoi — sinon un futur lecteur le proposera à
>   nouveau).
> - Une capacité de l'approche remplacée est abandonnée volontairement.
>
> Garder chaque point à une ou deux phrases, avec sa raison. Omettre entièrement la section quand le périmètre de la
> décision va de soi — ne pas la remplir de truismes.

- {Point hors périmètre 1 — et pourquoi il est écarté}
- {Point hors périmètre 2 — et pourquoi il est écarté}

## Décision

> Donner la réponse, au présent, avant toute justification : un lecteur qui s'arrête ici sait ce qui est décidé. C'est
> un choix (« les bases sont regroupées dans deux clusters partagés ») ou une vision, quand la décision est un
> changement de cap : décrire alors le modèle cible par ses principes et ses règles, pas par son inventaire.
>
> Rester court. La description détaillée et durable du résultat (conventions complètes, inventaires, arborescences) va
> dans une page de référence ; les étapes pour y arriver vont dans une page de migration (`docs/migrations/`), une
> procédure ou une issue. L'ADR renvoie vers ces pages et ne les répète pas. Un diagramme (Mermaid ou ASCII) est
> bienvenu s'il montre l'architecture qui en résulte.

{Énoncer la décision ou la vision...}

## Pourquoi ce choix

> Argumenter, en paragraphes : ce que la réponse devait satisfaire (les exigences et contraintes qui ont réellement
> pesé, pas une liste exhaustive), comment elle y répond, quels compromis sont acceptés et pourquoi ils sont
> acceptables, et ce qui devrait changer pour que la réponse soit différente. L'argument central est énoncé une fois,
> ici.

{Écrire ici l'argumentation...}

### Alternatives écartées [Facultatif]

> Uniquement les alternatives réellement envisagées : celles sur lesquelles on a hésité, que l'on a essayées, ou qu'un
> lecteur raisonnable proposerait. Un court paragraphe chacune : ce que c'est, et la raison précise pour laquelle elle a
> perdu. Pas de statut, pas de numéro, pas de liste symétrique d'avantages et d'inconvénients. Ne pas inventer
> d'alternative pour étoffer la page ; zéro est un nombre légitime, et la sous-section disparaît alors.

**{Alternative réellement envisagée}.** {Ce que c'est, et pourquoi elle a été écartée.}

---

## Conséquences [Facultatif]

> Détailler les effets en cascade de cette décision, y compris ce qu'elle coûte. Être explicite sur les mesures
> d'atténuation nécessaires. Le coût d'une migration se résume ici en quelques lignes ; son plan vit ailleurs.

### Positives

- (+) {Bonne conséquence, par exemple l'amélioration d'une ou plusieurs qualités recherchées}

### Négatives

- (-) {Mauvaise conséquence, par exemple le compromis sur une ou plusieurs qualités recherchées}

### Neutres

- (\~) {Conséquence neutre ou mesure d'atténuation nécessaire}

---

## Questions ouvertes [Facultatif]

> Seulement tant que l'ADR est `proposed`, et seulement les questions qui bloquent encore la _décision_. Une question de
> mise en œuvre va dans le plan ; un sujet hors périmètre n'est pas une question ouverte.

- {Question qui reste à trancher avant d'accepter la décision}

---

## Évolution de la décision [Facultatif]

> Si la décision change pendant la mise en œuvre ou avec le temps, documenter l'historique et les raisons techniques
> exactes du changement de cap.

- **AAAA-MM-JJ** : Décision initiale — {Option}
- **AAAA-MM-JJ** : Décision révisée — {Option}, parce que {Raison détaillée}

---

## Historique des modifications

> Consigner toute modification significative apportée à cet ADR après sa création. Utiliser les préfixes sémantiques
> (FEATURE, FIX, SECURITY, DEPRECATION, CLARIFICATION, CHORE). Un changement de `status` y figure toujours. Du plus
> récent au plus ancien.

- **AAAA-MM-JJ** : **PRÉFIXE** : {Description complète de la modification et de son impact}

---

## Pour aller plus loin

> Liens relatifs vers des fichiers `.md` (la page de référence qui décrit le résultat, la migration ou la procédure de
> mise en œuvre, les autres ADR) et références externes indispensables pour comprendre cet ADR, chacun avec une phrase
> d'introduction. Cette section est la dernière section `##` de la page.

- [{ADR lié}]({ADR-NNN-Titre-En-Francais.md}) : {Par exemple la gestion centralisée des secrets}
- [{Page de référence}]({../reference/Page-Reference.md}) : {La description détaillée et vivante du résultat}
- [{Migration}]({../migrations/MIGR-AAAAMMJJ-NN-Titre.md}) : {Le plan de mise en œuvre, étape par étape}
- [{Référence externe}]({https://exemple.org}) : {Bonnes pratiques de sécurité ou documentation de l'outil}
