<!--
  GABARIT D'ARCHIVE — une archive garde la trace d'un document terminé ou obsolète : ce qu'il couvrait, pourquoi il est
  archivé et où retrouver son texte complet. Supprimer ce commentaire HTML à la rédaction.
  Le fichier est `docs/archives/<ID>-<Titre>.md` quand le document archivé avait un identifiant (procédure, rapport),
  `docs/archives/<Titre>.md` sinon. Le préfixe `Archive-` est inutile : le dossier le dit. Le titre `#` reprend le nom du
  fichier, sans tirets entre les mots.
  Une archive se rédige en phrases : ni liste numérotée, ni tableau, ni bloc de commandes. Le détail se retrouve dans le
  texte intégral, qui est un lien.
-->

# {ID} {Titre}

> Une ou deux phrases : ce que couvrait le document et pourquoi il est archivé (opération terminée, mécanisme remplacé
> ou supprimé).

{Écrire l'introduction ici...}

> [!NOTE]\
> **Archivée le {AAAA-MM-JJ}.** {Ce qui est terminé ou remplacé} ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

> Résumé court, en phrases : objectif, grandes étapes, résultat. Ne pas recopier les commandes ni transformer les étapes
> en liste : le texte complet est dans l'historique Git (voir plus bas).

{Résumé.}

## Pourquoi il est archivé

> Le mécanisme remplacé ou l'opération terminée, avec ce qui le remplace et un lien vers ce remplaçant ; si rien ne le
> remplace, le dire. Les constats qui justifient l'archivage se vérifient dans le dépôt : les citer avec la commande ou
> le fichier, dans des phrases et non dans un tableau.

{Raison et remplaçant.}

## Texte intégral

> Lien vers le fichier d'origine tel qu'il était au dernier commit avant l'archivage, en URL absolue :
> `https://github.com/{propriétaire}/{dépôt}/blob/{sha}/{chemin du fichier}`. Un lien commençant par `/` ne convient pas
> : GitHub le lit à partir de la racine du dépôt, à la branche courante, et non à partir de la racine du site. Un lien
> sur un commit reste valable après la suppression du fichier d'origine.
> `scripts/archive-link.sh {chemin du fichier d'origine}`, dans le dossier du skill, affiche ce lien avec le dernier
> commit de `origin/main` qui contient le fichier.

{Lien vers le commit.}

## Pour aller plus loin

> Deux à cinq liens relatifs vers des fichiers `.md`, chacun avec une phrase d'introduction. Cette section est la
> dernière section `##` de la page.

- [{Page liée}]({../chemin/Page.md}) : {la décision ou la page qui remplace le document archivé}
