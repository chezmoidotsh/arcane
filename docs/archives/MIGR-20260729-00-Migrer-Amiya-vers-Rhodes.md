# MIGR-20260729-00 Migrer Amiya Vers Rhodes

Cette fiche migrait le rôle de plateforme centrale (OpenBao, Pocket-Id, hub ArgoCD) de `amiya.akn` vers `rhodes.akn`, en
suivant la chaîne du guide [Restaurer Rhodes](../guides/Restaurer-Rhodes.md) et en ne décrivant que les écarts avec une
vraie reprise. Elle est archivée parce que la migration est terminée et que `projects/amiya.akn/` n'existe plus.

> [!NOTE]\
> **Archivée le 2026-10-11.** La migration est terminée ; ce document n'est plus tenu à jour. Les commandes et les
> valeurs résumées ci-dessous n'ont pas été revérifiées.

## Ce que couvrait le document

La fiche, créée le 2026-07-29, reprenait les 9 étapes de la reprise de `rhodes.akn` dans le même ordre : la procédure de
reprise avait été écrite pour cette migration, et du point de vue du nouveau cluster, l'indisponibilité d'`amiya.akn` et
son déclassement sont le même événement. Elle relevait les écarts suivants.

| Moment                  | Écart avec une reprise                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Étape 1                 | Premier déploiement réel de `rhodes.clustertemplate.yaml` (rédigé le 2026-07-23), par la procédure [OMNI-20260721-00](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md). L'identifiant de cluster 1 et le CIDR de pods `172.30.0.0/19` étaient déjà attribués dans le [plan d'adressage IP](../reference/IPAM-Reference.md).                                            |
| Étape 2                 | Les `cnpg.cluster.yaml` de `vault` et de `pocket-id` s'amorçaient déjà depuis l'`ObjectStore` `amiya-akn` (`s3://cnpg-amiya-akn/{openbao,pocket-id}`), et non depuis `selfhosted` : rien à modifier, mais la restauration de [BKP-20260723-00](../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) se vérifiait contre l'entrée `externalClusters` `amiya-akn`. |
| Entre les étapes 6 et 9 | La [validation HTTPS via `/etc/hosts`](../guides/Restaurer-Rhodes.md#entre-les-étapes-6-et-9--valider-en-https-réel-via-etchosts-optionnel), optionnelle dans une reprise, était obligatoire : le DNS de `vault.chezmoi.sh` et `auth.chezmoi.sh` visait encore `amiya.akn`. Les entrées étaient retirées après la bascule DNS.                                                                 |
| Bascule DNS             | `amiya.akn` publiait les deux noms par `external-dns-unifi` et par `cloudflare-operator` (DNS public) ; `rhodes.akn` n'avait que `external-dns-unifi` et `external-dns-bind`. Les deux noms devenaient donc accessibles depuis le LAN et Tailscale seulement, par choix.                                                                                                                       |
| Après la bascule        | Rejouer `pulumi up --refresh` dans `projects/lungmen.akn/src/infrastructure/pulumi` pour recréer sur l'OpenBao de `rhodes.akn` le montage, les politiques, le backend Kubernetes et le rôle ESO de `lungmen.akn` (`stack/vault.ts`), puis vérifier que chaque `ExternalSecret` est en `SecretSynced`.                                                                                          |

La bascule DNS suivait un ordre précis. Les deux `external-dns-unifi` avaient des `txtOwnerId` différents
(`external-dns.amiyaakn`, `external-dns.rhodesakn`), donc aucun ne supprimait l'enregistrement de l'autre ; mais en
`policy: sync`, tant que les deux clusters portaient une `HTTPRoute` pour le même nom, chacun réaffirmait son IP. La
fiche retirait donc la revendication d'`amiya.akn` (Applications `vault` et `pocket-id`, ou leurs `HTTPRoute`) avant ou
en même temps que celle de `rhodes.akn`, sans `--migrate-from-txt-owner`, que le projet amont déconseille dans ce cas.
Le 2026-07-30, la validation via `/etc/hosts` a été déplacée dans le guide de reprise.

## Pourquoi il est archivé

La migration est faite : `projects/` ne contient plus `amiya.akn`, et [Restaurer Rhodes](../guides/Restaurer-Rhodes.md)
indique que la reprise « a été validée à la migration d'`amiya.akn` vers `rhodes.akn` ».

Les références à `amiya-akn` restées dans `projects/rhodes.akn/` (`cnpg.objectstore.amiya-akn.yaml` et
`barmanObjectName: amiya-akn` dans `src/apps/{vault,pocket-id}/`, `StackReference` `amiya.akn` dans
`src/infrastructure/pulumi/stack/cloudnative-pg.ts`) étaient volontaires pour cette migration : elles pointent vers
l'ancien stockage de sauvegarde. Pour une reprise future, le
[plan de reprise après sinistre](../guides/Plan-de-Reprise-apres-Sinistre.md#lacunes) les classe parmi les lacunes : si
la stack d'`amiya.akn` n'existe plus dans le backend Pulumi, l'étape 3 de Restaurer Rhodes échoue.

## Texte intégral

Le texte d'origine, en anglais, est figé à
[`docs/migrations/amiya.akn->rhodes.akn.md`](https://github.com/chezmoidotsh/arcane/blob/2dfcef713c857e4e10ee06a1f086972b6a898ee2/docs/migrations/amiya.akn->rhodes.akn.md)
(commit `2dfcef71`, dernière version sur `main` avant la migration de la documentation, issue #1257). Le lien pointe sur
un commit : il reste valable après la suppression du fichier.

## Pour aller plus loin

- [Restaurer Rhodes](../guides/Restaurer-Rhodes.md) : la chaîne de 9 étapes suivie par cette migration.
- [Plan de reprise après sinistre](../guides/Plan-de-Reprise-apres-Sinistre.md) : vue d'ensemble de la reprise et de ses
  lacunes.
- [Restaurer OpenBao](../guides/Restaurer-OpenBao.md) et [Restaurer Pocket-Id](../guides/Restaurer-Pocket-Id.md) :
  étapes de restauration propres à chaque composant.
- [ADR-014 Topologie réseau](../decisions/ADR-014-Topologie-Reseau.md) : allocation des CIDR de pods.
- [Registre TXT d'external-dns](https://kubernetes-sigs.github.io/external-dns/latest/docs/registry/txt/) : modèle de
  propriété derrière la bascule DNS.
