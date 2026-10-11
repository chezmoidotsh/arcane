# MIGR-20260729-00 Migrer Amiya Vers Rhodes

Cette fiche migrait le rôle de plateforme centrale (OpenBao, Pocket-Id, hub ArgoCD) de `amiya.akn` vers `rhodes.akn`.
Elle suivait presque à l'identique la chaîne du guide de reprise
[Restaurer Rhodes](../plan-de-reprise/brouillon/Restaurer-Rhodes.md) : les mêmes 9 étapes, dans le même ordre, avec les
mêmes outils, parce que la procédure de reprise de `rhodes.akn` avait été écrite pour cette migration. Du point de vue
du nouveau cluster, l'indisponibilité d'`amiya.akn` et son déclassement au profit de `rhodes.akn` sont le même
événement. La fiche ne décrivait que les points où la migration s'écartait d'un véritable exercice de reprise. Créée le
2026-07-29.

Migré le 2026-10-11 ; les commandes et les valeurs de cette page n'ont pas été revérifiées.

> [!NOTE]\
> **Archivée le 2026-10-11.** Le répertoire `projects/amiya.akn/` n'existe plus (`ls projects/` ne liste que
> `chezmoi.sh`, `hass`, `kazimierz.akn`, `lungmen.akn`, `rhodes.akn`, `rimbilliton.akn` et `shodan.akn`) et le guide
> [Restaurer Rhodes](../plan-de-reprise/brouillon/Restaurer-Rhodes.md) indique que la reprise « a été validée à la
> migration d'`amiya.akn` vers `rhodes.akn` ». Les références à `amiya-akn` encore présentes dans
> `projects/rhodes.akn/src/apps/{vault,pocket-id}/` (`cnpg.objectstore.amiya-akn.yaml`, `barmanObjectName: amiya-akn`)
> sont volontaires : elles pointent vers l'ancien stockage de sauvegarde. Les étapes de bascule DNS et de
> reprovisionnement de Vault pour `lungmen.akn` n'ont pas été revérifiées.

## Étape 1 : un premier déploiement réel, pas une recréation

L'étape 1 de la reprise suppose que le cluster template et les machine classes existaient déjà et qu'ils sont
réappliqués après une perte. Ici, `projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml` était
appliqué pour la première fois : il avait été rédigé de manière anticipée le 2026-07-23, avant la migration (voir
l'[historique du guide](../plan-de-reprise/brouillon/Restaurer-Rhodes.md#historique)).

> [!NOTE]\
> L'action est identique à celle de l'étape 1 de la reprise : appliquer le cluster template avec `omnictl`, en suivant
> la procédure [OMNI-20260721-00](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) jusqu'à sa
> liste de validation CNI/CSI/CCM. `rhodes.akn` s'était déjà vu attribuer l'identifiant de cluster 1 et le CIDR de pods
> `172.30.0.0/19` dans le [plan d'adressage IP](../reference/IPAM-Reference.md) ; cette décision précédait la migration
> et n'était pas à rouvrir.

## Étape 2 (openbao.md et pocket-id.md) : la restauration CNPG pointait déjà vers les sauvegardes d'amiya

Étape informative : rien à faire au-delà de suivre les procédures liées telles qu'écrites.

Les fichiers `projects/rhodes.akn/src/apps/vault/cnpg.cluster.yaml` et
`projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml` avaient déjà `spec.bootstrap.recovery.source` et
`spec.externalClusters[].plugin.parameters.barmanObjectName` positionnés sur `amiya-akn` et non sur `selfhosted`. Cet
`ObjectStore` (`cnpg.objectstore.amiya-akn.yaml` dans le répertoire de chaque application) ciblait
`s3://cnpg-amiya-akn/{openbao,pocket-id}`, soit les sauvegardes S3 Garage propres à `amiya.akn`, et non celles de
`rhodes.akn` (`cnpg.objectstore.yaml`, `selfhosted`).

En suivant l'étape 2 de `openbao.md` et `pocket-id.md` via la procédure
[BKP-20260723-00](../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md), les manifestes se
résolvaient donc déjà vers la bonne source. Rien n'était à modifier ; il fallait vérifier la restauration contre
l'entrée `externalClusters` `amiya-akn`, au lieu de supposer le stockage objet de `rhodes.akn` comme le fait la
procédure BKP-20260723-00 de façon générique.

## Entre les étapes 5/6 et 9 : valider en HTTPS réel via /etc/hosts

La fiche renvoyait à la section
[Entre les étapes 6 et 9](../plan-de-reprise/brouillon/Restaurer-Rhodes.md#entre-les-étapes-6-et-9--valider-en-https-réel-via-etchosts-optionnel)
du guide de reprise, avec les mêmes entrées et la même adresse IP.

> [!IMPORTANT]\
> Cette validation est optionnelle dans une reprise, puisque le DNS de production vise déjà `rhodes.akn` (c'est le même
> cluster qui est restauré). Ici, elle était obligatoire : le DNS des deux noms d'hôte résolvait encore vers `amiya.akn`
> jusqu'à la bascule décrite ci-dessous. C'était le seul moyen d'atteindre les instances de `rhodes.akn` avant ce
> moment, et pas un simple confort.

Ces entrées ne devaient être retirées qu'une fois la bascule DNS réelle confirmée, sans être laissées en place
indéfiniment.

## Bascule DNS : passer vault.chezmoi.sh et auth.chezmoi.sh d'amiya à rhodes

`amiya.akn` publiait les deux noms d'hôte de deux façons : `external-dns-unifi` (LAN uniquement,
`txtOwnerId: external-dns.amiyaakn`, `policy: sync`) et `cloudflare-operator` avec `cloudflare-public-gateway` (DNS
public Cloudflare, réellement joignable depuis Internet). `rhodes.akn` n'avait que `external-dns-unifi`
(`txtOwnerId: external-dns.rhodesakn`, `policy: sync`) et `external-dns-bind` (split-horizon interne à `talosnet`
uniquement) ; aucun composant `cloudflare-operator` ou `cloudflare-public-gateway` n'existait sur `rhodes.akn`.

> [!IMPORTANT]\
> Il s'agissait d'un changement de comportement voulu, pas d'un manque à combler plus tard : après la migration,
> `vault.chezmoi.sh` et `auth.chezmoi.sh` devenaient accessibles uniquement depuis le LAN (VLAN 5) ou Tailscale, et plus
> depuis Internet. Rétablir un point d'entrée public serait un chantier séparé, hors périmètre.

Les instances `external-dns-unifi` d'`amiya` et de `rhodes` utilisant des valeurs de `txtOwnerId` différentes, aucune
des deux ne supprimait un enregistrement qu'elle ne possédait pas : le modèle de propriété du
[registre TXT](https://kubernetes-sigs.github.io/external-dns/latest/docs/registry/txt/) écarte toute suppression
accidentelle. Le risque réel était autre : les deux instances sont en `policy: sync`, donc tant que les `HTTPRoute` des
deux clusters existaient pour le même nom d'hôte, chaque instance réaffirmait l'IP de son propre cluster à chaque boucle
de réconciliation, d'où une course où le dernier qui écrit gagne, sans suppression. L'option `--migrate-from-txt-owner`
est signalée comme dangereuse par le projet amont pour ce cas précis de deux propriétaires dans une même zone ; la
bascule sûre consistait donc à retirer la revendication d'amiya sur le nom d'hôte avant celle de rhodes, ou en même
temps :

1. Confirmer que les `HTTPRoute` de rhodes pour `vault.chezmoi.sh` et `auth.chezmoi.sh` étaient appliquées et saines, ce
   qui est le cas dès l'étape 9 de la reprise (ArgoCD adopte `dist/apps/{vault,pocket-id}/`).
2. Supprimer ou mettre à l'échelle zéro les Applications `vault` et `pocket-id` d'amiya (ou à défaut leurs `HTTPRoute`),
   pour que l'`external-dns-unifi` d'amiya retire les enregistrements A et TXT qu'il possède pour les deux noms d'hôte.
3. Confirmer que l'`external-dns-unifi` de rhodes affirmait alors l'enregistrement vers l'IP du Gateway de rhodes ; il
   le tentait probablement déjà par intermittence depuis l'étape 9, la bascule mettait fin à cette concurrence.
4. Côté Cloudflare public, rien à créer pour rhodes : la suppression des enregistrements gérés par `cloudflare-operator`
   pour ces deux noms d'hôte (dans le cadre du déclassement d'amiya) retirait l'accès public, conformément à l'état
   final voulu (LAN et VPN uniquement).
5. Vérifier la résolution depuis plusieurs points de vue (un client LAN via le DNS UniFi, et `dig` ou `curl` vers
   `ns.chezmoi.sh` pour la zone interne en split-horizon) : elle devait renvoyer l'IP de rhodes avant de poursuivre.

## Après la bascule : retirer les surcharges hosts et reprovisionner le backend Vault de lungmen

Les entrées temporaires de `/etc/hosts` ajoutées plus haut étaient retirées.

`lungmen.akn` dépendait de l'OpenBao d'`amiya.akn` pour son backend d'authentification ESO et son montage KV, via
`projects/lungmen.akn/src/infrastructure/pulumi/stack/vault.ts` (`new ClusterVaultComponent("lungmen.akn", {...})`),
provisionné contre l'instance Vault que le fournisseur Pulumi Vault ciblait à ce moment. Une fois `vault.chezmoi.sh`
résolu vers rhodes (section précédente), il fallait rejouer la stack Pulumi de lungmen pour qu'elle (re)crée le montage,
les politiques, le backend d'authentification Kubernetes et le rôle ESO de lungmen sur l'OpenBao de rhodes au lieu de
celui d'amiya :

```sh
cd projects/lungmen.akn/src/infrastructure/pulumi
pulumi up --refresh --parallel 15
```

La vérification se faisait avec `kubectl get externalsecret -A` dans le contexte de `lungmen.akn` : tous les
`ExternalSecret` devaient ensuite être en `SecretSynced`.

## Historique de la fiche

- 2026-07-29 : création initiale.
- 2026-07-30 : l'étape de validation HTTPS réelle via `/etc/hosts` s'est révélée non spécifique à la migration ; son
  contenu a été déplacé dans le guide de reprise (Entre les étapes 6 et 9), et la fiche n'expliquait plus que la raison
  pour laquelle elle était obligatoire ici (le DNS pointait encore vers `amiya.akn`), au lieu d'être seulement
  optionnelle comme dans une vraie reprise.

## Pour aller plus loin

- [Restaurer Rhodes](../plan-de-reprise/brouillon/Restaurer-Rhodes.md) : la chaîne de 9 étapes suivie par cette
  migration.
- [Plan de reprise après sinistre](../plan-de-reprise/brouillon/Plan-de-Reprise-apres-Sinistre.md) : vue d'ensemble de
  la reprise.
- [Restaurer OpenBao](../plan-de-reprise/brouillon/Restaurer-OpenBao.md) et
  [Restaurer Pocket-Id](../plan-de-reprise/brouillon/Restaurer-Pocket-Id.md) : étapes de restauration propres à chaque
  composant.
- [OMNI-20260721-00](../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : provisionnement du
  cluster (étape 1).
- [BKP-20260723-00](../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : restauration
  CNPG depuis le stockage objet, utilisée à l'étape 2.
- [ADR-014 Network Topology](../decisions/ADR-014-Separer-le-Trafic-des-Noeuds-Talos-du-VLAN-Homelab.md) : allocation
  des CIDR de pods.
- [Plan d'adressage IP](../reference/IPAM-Reference.md) : CIDR de pods et pools LoadBalancer Cilium.
- [Registre TXT d'external-dns](https://kubernetes-sigs.github.io/external-dns/latest/docs/registry/txt/) : modèle de
  propriété derrière la bascule DNS.
