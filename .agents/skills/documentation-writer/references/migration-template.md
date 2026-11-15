<!--
  GABARIT DE MIGRATION — une migration fait passer le dépôt ou l'infrastructure d'un état à un autre, une seule fois.
  C'est un document vivant : il est tenu à jour tant que la migration dure, puis archivé. Supprimer ce commentaire HTML
  et tous les blocs `>` d'instructions à la rédaction.
  Le fichier est `docs/migrations/MIGR-AAAAMMJJ-NN-Verbe-Complement.md` : la date est celle de la création du document,
  `NN` départage deux migrations créées le même jour. Le titre `#` reprend le nom du fichier, sans tirets entre les
  mots. Une migration qui demande plusieurs pages prend un sous-dossier `docs/migrations/<sujet>/`.
  Une migration ne justifie pas un choix : elle renvoie à l'ADR qui la motive. Elle ne décrit pas non plus l'état cible
  en détail : elle renvoie à la page de référence.
  Quand la migration est terminée, la page est remplacée par une archive (`docs/archives/`, même identifiant), voir
  archive-template.md.
-->

# MIGR-{AAAAMMJJ}-{NN} {Verbe et complément}

> Version courte : d'où l'on part, où l'on arrive, en une ou deux phrases.

{Faire passer X de A à B...}

> [!NOTE]\
> **État au {AAAA-MM-JJ} : {non commencée | en cours, étape N sur M | terminée}.** {Ce qui a été rejoué et ce qui ne l'a
> pas été. Une commande ou un comportement non vérifié est marqué « à confirmer ».}

## Contexte

> Pourquoi cette migration existe, en quelques phrases : ce qui ne tient plus dans l'état de départ et ce que l'état
> d'arrivée apporte. Ne pas refaire l'argumentation : elle est dans l'ADR.
>
> Dire explicitement d'où vient la migration :
>
> - **Décision d'origine** : l'ADR qui la motive, en lien relatif, avec son statut. S'il n'y en a pas, l'écrire et dire
>   ce qui la motive à la place (une issue, un incident, une fin de support).
> - **État cible** : la page de référence qui le décrit, s'il y en a une.

{Contexte.}

| Élément            | Lien                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Décision d'origine | [{ADR-NNN Titre}]({../decisions/ADR-NNN-Titre.md}) (`{status}`), ou « aucun ADR : {raison} » |
| État cible         | [{Page de référence}]({../reference/Page-Reference.md})                                      |
| Suivi              | {issue ou pull request, s'il y en a}                                                         |

## Avancement

> Une ligne par étape, tenue à jour à chaque étape terminée. C'est ce tableau qui fait de la page un document vivant.

| Étape | Contenu   | État                                           |
| ----- | --------- | ---------------------------------------------- |
| 1     | {Contenu} | {à faire \| en cours \| terminée (AAAA-MM-JJ)} |

## Avant de commencer

> Prérequis en tableau : accès, outils, sauvegardes, gels. Renvoyer vers les pages, ne pas les recopier.

## Ce qui change [Facultatif]

> Correspondance entre l'état de départ et l'état d'arrivée (chemins, noms, ressources), en tableau. Supprimer la
> section si les étapes suffisent.

## Étapes

> Les étapes sont ordonnées et chacune laisse le système dans un état qui fonctionne. Pour chaque étape, dire :
>
> - **ce qui change** ;
> - **la nature du changement** : simple déplacement ou copie, migration manuelle (état Pulumi, secrets, DNS), ou
>   reconstruction ;
> - **les commandes**, la commande d'abord, puis le résultat attendu ;
> - **la vérification** qui prouve que l'étape a réussi ;
> - **le retour arrière**.

### 1. {Verbe et complément}

| Ce qui change | Nature                                                | Vérification | Retour arrière |
| ------------- | ----------------------------------------------------- | ------------ | -------------- |
| {…}           | {déplacement \| migration manuelle \| reconstruction} | {…}          | {…}            |

```sh
{commande}
```

## Critère de fin

> Le constat vérifiable qui dit que la migration est terminée (un dossier qui n'existe plus, une ressource retirée),
> avec la commande qui le prouve. Une fois atteint : archiver la page.

## Pour aller plus loin

> Deux à cinq liens relatifs, chacun avec une phrase d'introduction : l'ADR d'origine, la page de référence de l'état
> cible, les procédures utilisées. Cette section est la dernière section `##` de la page.

- [{ADR-NNN Titre}]({../decisions/ADR-NNN-Titre.md}) : {pourquoi cette migration}
- [{Page de référence}]({../reference/Page-Reference.md}) : {l'état cible}
