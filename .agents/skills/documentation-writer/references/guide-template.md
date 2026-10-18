# Initialiser Lungmen

<!-- Version courte : ce que le lecteur aura à la fin, en une ou deux phrases. -->

Monter le cluster `lungmen.akn` depuis un hôte Proxmox vide jusqu'à un ArgoCD synchronisé. Environ 45 minutes.

## Avant de commencer

<!-- Prérequis en liste ou en tableau : accès, outils, état. Renvoyer vers les pages, ne pas les recopier. -->

## Entrées requises

<!-- Variables dont les commandes ont besoin, déclarées dans un seul bloc `export` : un marqueur `<…>` pour la valeur attendue, un exemple en commentaire de fin de ligne. Supprimer la section si le guide n'a aucune entrée. -->

Exporter ces variables une fois ; les commandes suivantes se copient ensuite telles quelles.

```sh
export {VAR_1}=<{Ce que c'est}>   # ex. {valeur d'exemple}
```

## Étapes

### 1. Créer le cluster dans Omni

<!-- La commande d'abord, puis le résultat attendu, puis quoi faire si le résultat diffère. -->

```sh
omnictl cluster template sync -f projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml
```

## Vérifier le résultat

<!-- Une commande dont la sortie prouve que le guide a fonctionné. -->

## Pour aller plus loin

- [Exploiter le cluster](Exploiter-Lungmen.md) : les tâches courantes après l'installation.
- [IPAM](../reference/IPAM-Reference.md) : le plan d'adressage utilisé ci-dessus.
