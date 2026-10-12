---
title: "[Nom de l'événement]"
date: YYYY-MM-DD
author: "Nom"                             # humain : Nom · agent IA : [fournisseur:modèle]
participants:
  - "Nom"                                 # humain : Nom · agent IA : [fournisseur:modèle] · système : [system:nom]
  - "[anthropic:claude-sonnet-4-6]"
severity: "Critical | High | Medium | Low"   # voir SKILL.md §"Severity grid" — calibrée pour le homelab
status: "Draft | Open | Verified | Closed"   # Draft : en cours · Open : fusionné, suivi en attente
                                              # Verified : toutes les actions confirmées · Closed : archivé
detection-method: "Alert | User report | Manual discovery | External report | AI anomaly detection"
duration: ""                              # libre : "~45min" / "5h20m" / "3 jours, 8 tentatives"
services-affected: []
users-affected: ""                        # qualitatif : "famille — NAS indisponible" / "moi seul" / "aucun impact"
root-cause-family:                        # une ou plusieurs familles (utilisées par Index-des-Incidents.md + revue de Pareto)
  - ""                                    # ex. observability-gap, dependency-cycle, merge-vs-replace,
                                          #     policy-scope-too-broad, missing-pre-deploy-check,
                                          #     state-drift, network-policy-incomplete, …
error_signatures: []                      # chaînes exactes relevées (événements, journaux, conditions) : clé de recherche par grep
procedures: []                            # chemins des procédures de docs/procedures/ qui corrigent cette classe d'incident
related-incidents:                        # liste avec la relation explicite
  - path: "docs/incidents/Incident-AAAA-MM-JJ-Autre-Titre.md"
    relation: "Même chaîne d'authentification" | "Même cycle de dépendances" | "Récurrent sur le même composant" | …
related-adrs: []                          # ex. ADR-005 (envoy-gateway-oidc)
related-issues: []                        # liens d'issues GitHub
---

> **Instructions de rédaction :** remplir chaque section. Supprimer toutes les lignes qui commencent par `>` (ce sont
> des instructions, pas du contenu), ainsi que les commentaires HTML sauf `skew`. Enregistrer dans
> `docs/incidents/Incident-AAAA-MM-JJ-Titre-En-Francais.md`. Le titre `#` reprend le nom du fichier, sans tirets. Le
> post-mortem est rédigé en français ; les clés du front matter, leurs valeurs et la syntaxe des actions ne sont pas
> traduites (des scripts les lisent).
>
> **Pour les incidents de moins de 2 h, sans perte de données et sans leçon systémique :** utiliser le **format allégé**
> (voir SKILL.md §"Lite format"). Le gabarit complet ci-dessous est réservé aux incidents Critical/High ou à tout
> incident qui révèle une leçon structurelle.

# Incident AAAA-MM-JJ Titre

> Un ou deux paragraphes : ce qui s'est passé et ce que la page contient. Le résumé détaillé suit dans la section
> suivante.

## Résumé exécutif

> 3 à 5 phrases pour un lecteur non technique. Pas de jargon ni d'acronymes. Ce qui a échoué, l'impact, pourquoi cela
> s'est produit au plus haut niveau, et le correctif principal.

\[Résumé de 3 à 5 phrases en langage courant]

## Résumé de l'événement

**Résultat attendu :** \[Ce qui devait se passer — précis, chiffré]

**Résultat obtenu :** \[Ce qui s'est passé — avec le même niveau de précision]

**Impact :** \[Opérationnel, données, sécurité, famille — qualitatif pour un homelab]

**Durée :** \[Du début de l'incident à la résolution complète, avec les horodatages]

**Premier signal :** \[Quand l'écart est-il devenu visible pour la première fois ?]

## Chronologie

> Suite chronologique du premier signal à la résolution complète. Format de l'acteur : `Nom` (humain) ·
> `[fournisseur:modèle]` (IA) · `[system:nom]` (alertes, ArgoCD, CI…).
>
> Format d'horodatage (UTC, ISO 8601) : `AAAA-MM-JJTHH:mm[:ss]`. Préfixer par `±Xm` quand le décalage d'horloge est
> connu, par `±?` quand l'heure est approximative sans pouvoir la quantifier. Toujours ajouter un commentaire
> `<!-- skew: ... -->` avant le tableau.
>
> **N'INVENTE PAS d'horodatages.** Chaque ligne doit venir d'une vraie source : une ligne de journal, l'historique du
> shell, l'heure d'un commit, l'âge d'un pod ou un souvenir explicite d'un humain. Interpoler « +5 min » entre deux
> points connus pour remplir la chronologie est de la fabrication. Sans source pour une étape, omettre la colonne
> d'heure ou écrire `±? — sans source`. Voir SKILL.md §"Timestamp sourcing".
>
> Pour mesurer le décalage d'horloge sur Talos : `talosctl time --nodes <ip-du-nœud>` puis
> `date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"` pour la référence UTC locale.
>
> **Facultatif — omettre le tableau quand les horodatages ne sont pas fiables.** Sans journaux structurés, si l'incident
> n'a été observé qu'après coup, ou si chaque heure serait `±?` avec un décalage inconnu, **omettre toute la
> chronologie** plutôt que d'inclure des données inexactes. Signaler l'omission dans le résumé de l'événement : «
> Chronologie omise : horodatages non reconstituables de façon fiable. » Cohérent avec la règle anti-fabrication de
> SKILL.md.

<!-- skew: ±? — [source de l'incertitude] -->

| Heure (UTC)          | Acteur                      | Événement ou décision    |
| -------------------- | --------------------------- | ------------------------ |
| AAAA-MM-JJTHH:mm     | Nom / \[fournisseur:modèle] | \[Ce qui s'est passé]    |
| ±5m AAAA-MM-JJTHH:mm | Nom / \[fournisseur:modèle] | \[Ce qui a été décidé]   |
| ±? AAAA-MM-JJTHH:mm  | \[system:nom]               | \[Événement automatique] |

## Ce qui a bien fonctionné

> Les contrôles qui ont réellement joué leur rôle. Pas de la décoration : cela identifie les comportements et les
> contrôles à conserver quand le système évolue.

- \[Ce qui a fonctionné et pourquoi cela a compté]

## Analyse des causes racines

**Technique :** \[5 Whys | Ishikawa | Swiss Cheese | Fault Tree | Pareto] **Pourquoi cette technique :** \[Une phrase de
justification — voir SKILL.md §"Choosing a technique"]

> **Règle d'escalade :** si les 5 Whys bloquent sur un « pourquoi » (aucune réponse honnête) ou se divisent en plus
> d'une chaîne indépendante, **changer** pour Ishikawa ou Swiss Cheese — ne pas conclure « pas de cause racine ».

### Analyse

> Appliquer la technique choisie (voir `references/` pour les guides pas à pas). Montrer le raisonnement, pas seulement
> la conclusion.

1. **Pourquoi \[symptôme] ?** → Parce que \[cause]
2. **Pourquoi \[cause] ?** → Parce que \[cause plus profonde]
3. **Pourquoi \[cause plus profonde] ?** → Parce que \[encore plus profonde]
4. **Pourquoi \[encore plus profonde] ?** → Parce que \[proche de la racine]
5. **Pourquoi \[proche de la racine] ?** → Parce que **\[CAUSE RACINE]**

### Causes racines

> **Tester chaque candidate :** « Si je corrige ceci, cette _classe_ de problème cesse-t-elle de se reproduire ? » Si
> non, la déplacer dans les facteurs contributifs.

- **\[Cause racine]** — \[Une phrase expliquant pourquoi cette condition rendait l'échec probable]

### Facteurs contributifs

- **\[Facteur]** — \[Comment il a aggravé la situation, et pourquoi ce n'est pas une cause racine]

## Signaux d'alerte manqués

> Signaux visibles avec le recul. Pour chacun : quand il était visible, pourquoi on n'a pas agi. « Nous n'avions pas de
> visibilité » → manque de supervision. « Il avait été signalé mais écarté » → priorisation.

| Signal                     | Quand il était visible | Pourquoi on n'a pas agi                                            |
| -------------------------- | ---------------------- | ------------------------------------------------------------------ |
| \[Ce qui était observable] | \[Date ou phase]       | \[Écarté / sans responsable / sans visibilité / biais d'optimisme] |

## Analyse du contrôle

### Sous contrôle (ce que nous aurions pu changer)

- \[Décision interne, manque de processus, choix d'outillage]

### Hors de contrôle (facteurs externes)

| Facteur externe | Qu'est-ce qui réduirait l'exposition ? |
| --------------- | -------------------------------------- |
| \[Facteur]      | \[Mesure de résilience précise]        |

## Leçons systémiques

> Le constat plus large au-delà de cet incident : une condition structurelle qui produira des défaillances similaires
> tant qu'elle ne sera pas traitée. Lier les ADR ou incidents liés qui partagent le même motif.

- **\[Leçon]** — \[Pourquoi elle est systémique et non propre à l'incident. Référencer l'ADR ou l'incident lié.]

## De la leçon au contrôle

> **Section obligatoire.** Chaque leçon systémique ci-dessus doit correspondre à un artefact concret qui la fera
> appliquer ou la rendra visible à l'avenir. Si une leçon ne peut pas être convertie (aucun type d'artefact ne
> convient), le dire explicitement — mais l'attente par défaut est que les leçons deviennent des contrôles.
>
> **Types d'artefact :** ADR · règle OPA · étape de procédure · règle d'alerte · test CI · vérification avant
> déploiement · commentaire dans le code · fichier de connaissances dans `.agents/knowledge/`

| Leçon                      | Type d'artefact | Artefact lié (chemin / lien / « À définir »)                          |
| -------------------------- | --------------- | --------------------------------------------------------------------- |
| \[Titre court de la leçon] | \[Type]         | \[Chemin ou « À définir, échéance dans le registre des changements »] |

## Registre des changements

> Chaque action : ce qui change, qui en est responsable, l'échéance, ce qui prouve que cela a fonctionné.
>
> **Format** (lu par `.github/workflows/schedule.postmortem-followup.yaml`, les mots-clés ne sont pas traduits) :
> `- [ ] [due:: AAAA-MM-JJ] [priority:: high|medium|low] [size:: S|M|L] [owner:: Nom] Action`
>
> **Sens des priorités (homelab) :**
>
> - `high` = sans cette action, la même classe d'incident se reproduit probablement dans le mois
> - `medium` = atténuation ou durcissement ; récidive possible mais pas immédiate
> - `low` = amélioration, nettoyage ou confort
>
> **Taille :** S = moins de 2 h · M = une demi-journée à une journée · L = plusieurs jours ou demande de la recherche
>
> **Vérification = résultat observable du système, pas une production (pas de « commit fait »).**

- [ ] [due:: AAAA-MM-JJ] [priority:: high] [size:: S] [owner:: Nom] \[Action précise]
  - **Vérification :** \[Comportement observable du système, pas « fichier présent dans git »]
  - **Sinon :** \[Conséquence concrète — ce qui casse ou se reproduit]

- [ ] [due:: AAAA-MM-JJ] [priority:: medium] [size:: M] [owner:: Nom] \[Action précise]
  - **Vérification :** \[Observable]
  - **Sinon :** \[Conséquence]

## Connaissances pour les agents

> **Obligatoire si une vérité opérationnelle non évidente a été découverte.** Distiller 1 à 5 puces que les futurs
> agents IA (ou toi dans six mois) doivent connaître avant de toucher ce composant. Ces puces sont extraites vers
> `.agents/knowledge/<sujet>.md` et chargées par les skills concernés.
>
> Format : faits déclaratifs, pas de récit. Chaque puce se comprend seule, sans le contexte du post-mortem. Chaque puce
> commence par `[Composant] :` (l'extraction par sujet en dépend).

- \[Composant ou commande] : \[Comportement ou piège en une phrase]
- \[Composant] : \[Heuristique à appliquer à l'avenir]

## Suivi de résolution

> **À écrire :** une liste vivante de ce qui est fait et de ce qui reste. Contrairement au registre des changements
> (artefact de planification avec responsables et dates), cette section suit l'état réel d'exécution avec des liens vers
> les issues et PR GitHub. La mettre à jour au fil de l'eau. Regrouper selon les dépendances naturelles (par exemple «
> en attente de fusion », « en attente d'alerting »). Chaque élément qui a une issue ou une PR la référence.

<!-- trunk-ignore-begin(markdown-link-check): URL is a placeholder, not a real link -->

### Fait

- [x] \[Ce qui est terminé] — [PR #N](URL) / [Issue #N](URL)

### En attente — \[libellé du groupe, par exemple « après la fusion de la PR #N »]

- [ ] \[Ce qui reste] — [Issue #N](URL) le cas échéant — \[note brève sur le blocage éventuel]

<!-- trunk-ignore-end(markdown-link-check) -->

## Calendrier de vérification

> **À ne pas sauter.** Un registre des changements sans suivi est du théâtre. L'action GitHub
> `.github/workflows/schedule.postmortem-followup.yaml` ouvre des issues quand une date `[due::]` passe sans issue
> existante, mais cette revue finale est le point de contrôle humain.

| Point de contrôle | Date       | Ce que nous vérifierons                                        | Instance      |
| ----------------- | ---------- | -------------------------------------------------------------- | ------------- |
| 1 semaine         | AAAA-MM-JJ | \[Actions prioritaires terminées ? Régression ?]               | Revue en solo |
| 1 mois            | AAAA-MM-JJ | \[Actions medium terminées ? L'indicateur s'est-il amélioré ?] | Revue en solo |
| 3 mois            | AAAA-MM-JJ | \[Cette classe d'incident s'est-elle reproduite ?]             | Revue en solo |

## Pour aller plus loin

> Deux à cinq liens relatifs vers des fichiers `.md`, chacun avec une phrase d'introduction. Cette section est la
> dernière section `##` de la page.

- [{Procédure}]({../procedures/XXX-AAAAMMJJ-NN-Titre.md}) : {La procédure suivie ou créée à la suite de l'incident}
- [{ADR}]({../decisions/ADR-NNN-Titre.md}) : {La décision liée ou issue de la leçon systémique}
