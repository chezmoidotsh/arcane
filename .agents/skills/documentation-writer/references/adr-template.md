---
status: "{proposed | accepted | implemented | rejected | deprecated | superseded by ADR-0123}"
date: { YYYY-MM-DD when the decision was last updated }
implementation-completed: { YYYY-MM-DD when the implementation was finalized (optional) }
decision-makers: ["Alexandre"]
assisted-by: ["<model-name>"]
informed: []
template-version: "2.0.0"
---

<!--
  GABARIT D'ADR v2.0.0 — voir la section "Template Versioning" de
  .agents/skills/documentation-writer/references/adr.md pour l'historique et les règles de ce fichier.
  Conserver le champ `template-version` du front matter : il enregistre la révision du gabarit qui a produit l'ADR.
  La version 2.0.0 traduit le gabarit en français (sections renommées). Les clés du front matter et les valeurs de
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
> - **Question stratégique** : la question centrale à laquelle cet ADR répond.

{Écrire ici un contexte complet...}

## Hors périmètre [Facultatif]

> Lister ce que cet ADR ne décide délibérément PAS et ne couvre pas. Les points hors périmètre évitent la dérive du
> champ et empêchent un lecteur de prendre une omission pour un oubli. Inclure cette section quand l'un des cas suivants
> s'applique :
>
> - Une décision liée est déjà actée ailleurs et constitue une _prémisse_ ici, pas une option (l'énoncer, pour que les
>   options ne soient pas lues comme la rouvrant).
> - La décision exclut délibérément un domaine voisin tentant (dire pourquoi — sinon un futur lecteur le proposera à
>   nouveau).
> - Une capacité de l'approche remplacée est abandonnée volontairement.
>
> Garder chaque point à une ou deux phrases, avec sa raison. Omettre entièrement la section quand le périmètre de la
> décision va de soi — ne pas la remplir de truismes.

- {Point hors périmètre 1 — et pourquoi il est écarté}
- {Point hors périmètre 2 — et pourquoi il est écarté}

## Facteurs de décision

> Lister les forces, préoccupations et exigences qui orientent la décision. Les classer pour ne rien omettre :
>
> - **Exigences fonctionnelles** : ce que la solution doit faire.
> - **Exigences non fonctionnelles** : les qualités attendues (fiabilité, sécurité, maintenabilité, etc.).
> - **Contraintes** : les limites avec lesquelles composer (écosystème, infrastructure existante, budget, etc.).

- {Facteur de décision 1}
- {Facteur de décision 2}

## Options envisagées

> Détailler les options envisagées. Pour une décision complexe, on peut les regrouper par catégorie. Fournir un
> paragraphe substantiel et détaillé pour chaque option avant de lister ses avantages et inconvénients. Marquer le
> statut de chaque option par une étiquette en gras : ACCEPTÉE, REJETÉE ou PROPOSÉE.

### Option 1 : {Titre de l'option 1}

> **Statut : PROPOSÉE**

> Écrire une description complète et concise du fonctionnement de l'option, de son impact architectural et de la façon
> dont elle répond aux facteurs de décision.

- `+` {Avantage 1}
- `+` {Avantage 2}
- `-` {Inconvénient 1}

### Option 2 : {Titre de l'option 2}

> **Statut : PROPOSÉE**

> Écrire une description complète et concise du fonctionnement de l'option, de son impact architectural et de la façon
> dont elle répond aux facteurs de décision.

- `+` {Avantage 1}
- `-` {Inconvénient 1}

## Décision retenue

**Option retenue : « {titre de l'option retenue} »**, parce que {Fournir une justification détaillée et complète, sous
forme de paragraphe. Expliquer comment elle répond de façon unique aux facteurs de décision critiques, résout les forces
en jeu ou atténue les contraintes principales. Ne pas lésiner sur l'argumentation}.

---

## Conséquences [Facultatif]

> Détailler les effets en cascade de cette décision. Être explicite sur les mesures d'atténuation nécessaires.

### Positives

- (+) {Bonne conséquence, par exemple l'amélioration d'une ou plusieurs qualités recherchées}

### Négatives

- (-) {Mauvaise conséquence, par exemple le compromis sur une ou plusieurs qualités recherchées}

### Neutres

- (\~) {Conséquence neutre ou mesure d'atténuation nécessaire}

---

## Détails de mise en œuvre et état [Facultatif]

> Documenter l'architecture de haut niveau qui résulte de cette décision (par exemple avec des diagrammes Mermaid ou
> ASCII).

> [!CAUTION]\
> **ANTI-MODÈLE** : NE PAS inclure dans ce document de plan de migration pas à pas, de tutoriel, de runbook ni de
> configuration de bas niveau (valeurs Helm précises, noms de comptes RBAC, chemins de fichiers exacts).
>
> - Les **plans de migration et runbooks** vont dans les issues GitHub, les PR ou `docs/procedures/`.
> - Les **configurations de bas niveau** vont dans le code, seule source de vérité.
>
> Garder cette section centrée sur l'architecture _conceptuelle_ et sur l'_état_ de la mise en œuvre.

- **Composants terminés** : {Ce qui a été déployé, sur le plan conceptuel}
- **Composants restants** : {Ce qui reste à faire, sur le plan conceptuel}
- **Architecture** : {Diagrammes (par exemple Mermaid) ou description technique de haut niveau}
- **Spécification des standards** : {Les nouvelles conventions, étiquettes ou règles de nommage introduites par cet ADR}

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

> Liens relatifs vers des fichiers `.md` (autres ADR, documentation d'architecture) et références externes
> indispensables pour comprendre cet ADR, chacun avec une phrase d'introduction. Cette section est la dernière section
> `##` de la page.

- [{ADR lié}]({ADR-NNN-Titre-En-Francais.md}) : {Par exemple la gestion centralisée des secrets}
- [{Documentation d'architecture}]({../reference/Page.md}) : {Guide d'architecture interne ou externe}
- [{Référence externe}]({https://exemple.org}) : {Bonnes pratiques de sécurité ou documentation de l'outil}
