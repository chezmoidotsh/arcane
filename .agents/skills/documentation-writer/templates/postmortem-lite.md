---
title: "[Nom de l'événement]"
date: YYYY-MM-DD
author: "Nom" # humain : Nom · agent IA : [fournisseur:modèle]
participants: ["Nom", "[anthropic:claude-sonnet-4-6]"]
severity: "Medium | Low" # le format allégé ne vaut que pour Medium/Low — passer au complet si plus grave
status: "Draft | Open | Verified | Closed"
detection-method: "Alert | User report | Manual discovery"
duration: "" # ex. "~45min"
services-affected: []
users-affected: ""
root-cause-family: [""] # obligatoire même en format allégé
error_signatures: [] # chaînes exactes relevées : clé de recherche par grep
procedures: [] # procédures de docs/procedures/ qui corrigent cette classe d'incident
related-incidents: []
---

> **Quand utiliser le format allégé :** incident de moins de 2 h, sans perte de données, sans exposition de sécurité,
> sans leçon systémique, gravité Medium ou moins. Si l'une de ces conditions n'est pas remplie, utiliser le gabarit
> complet.
>
> Enregistrer dans `docs/incidents/Incident-AAAA-MM-JJ-Titre-En-Francais.md`. Supprimer toutes les lignes `>` avant de
> committer. Les clés du front matter, leurs valeurs et la syntaxe des actions ne sont pas traduites.

# Incident AAAA-MM-JJ Titre

> Une ou deux phrases : ce qui s'est passé et ce que la page contient.

## Événement

**Attendu :** \[Ce qui devait se passer] **Obtenu :** \[Ce qui s'est passé — chiffré] **Impact :** \[Périmètre, durée,
qui a été touché] **Résolution :** \[Ce qui a corrigé le problème]

> Si cette section contient des horodatages, ils doivent avoir une vraie source (journal, historique du shell, heure
> d'un commit). Voir SKILL.md §"Timestamp sourcing". Ne pas combler les trous avec des intervalles `+5min` : incomplet
> et honnête vaut mieux que complet et fabriqué.

## Cause racine

**Technique :** \[5 Whys] _(le format allégé utilise les 5 Whys par défaut ; sinon passer au gabarit complet)_

\[Analyse compacte — 3 à 5 lignes maximum. Énoncer la cause racine en gras.]

**Cause racine :** **\[Une phrase décrivant la condition structurelle]**

## Registre des changements

- [ ] \[due:: AAAA-MM-JJ] \[priority:: high|medium|low] \[size:: S|M|L] \[owner:: Nom] \[Action]
  - **Vérification :** \[Résultat observable]
  - **Sinon :** \[Conséquence]

## Connaissances pour les agents [Facultatif]

- \[Composant] : \[Piège ou heuristique, en une ligne]

## Pour aller plus loin

> Un à trois liens relatifs vers des fichiers `.md`, chacun avec une phrase d'introduction. Cette section est la
> dernière section `##` de la page.

- [{Procédure}]({../procedures/Procedure-XXX-AAAAMMJJ-NN-Titre.md}) : {La procédure suivie ou créée à la suite de
  l'incident}
