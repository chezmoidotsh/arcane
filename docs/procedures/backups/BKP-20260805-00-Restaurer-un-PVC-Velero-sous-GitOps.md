# BKP-20260805-00 Restaurer un PVC Velero sous GitOps

Cette procédure restaure un `PersistentVolumeClaim` depuis une sauvegarde Velero (fs-backup Kopia), sur un cluster où un
contrôleur (`StatefulSet`, ou ArgoCD/Kustomize pour un `Deployment`) possède déjà le `Pod` cible et le réconcilie. Cette
propriété casse le flux de restauration par défaut de Velero, et aucune combinaison des options documentées de Velero ne
la contourne : la solution est une séquence d'opérations, pas une option. Elle a été découverte et validée de bout en
bout le 2026-08-05 sur l'application `jellyfin` de `lungmen.akn` (voir l'exemple complet). À utiliser quand le PVC d'une
application est perdu ou corrompu ; la durée dépend surtout du volume à recopier (environ 1,1 Go dans l'exemple).

> [!WARNING]\
> Procédure vérifiée contre le dépôt le 2026-10-11 ; ses commandes n'ont pas été rejouées sur le cluster depuis la
> validation du 2026-08-05.

## Cadre technique et conventions

- **Le contrôleur `PodVolumeRestore` n'injecte son init container `restore-wait` que dans un Pod qu'il crée lui-même.**
  Cet init container bloque le conteneur applicatif tant que les données du volume ne sont pas écrites. Un Pod déjà géré
  par un contrôleur actif casse ce mécanisme : le contrôleur recrée le Pod avant que la restauration Velero ne
  s'exécute, l'injection n'a jamais lieu et le `PodVolumeRestore` reste bloqué en phase `New` ou vide, sans erreur. Seul
  `status.progress` figé à zéro signale le blocage. C'est
  [velero-io/velero#9461](https://github.com/velero-io/velero/issues/9461), clos en amont comme « by design » : Velero
  attend un environnement stable, où rien d'autre ne réconcilie les ressources cibles pendant une restauration.
- **Supprimer le contrôleur et le PVC lié avant de restaurer, pour que Velero les _crée_ au lieu de les modifier.** Une
  création n'est pas soumise aux restrictions de champs immuables qui font échouer le contournement documenté
  `existingResourcePolicy: update`, et sans contrôleur, rien ne supprime le Pod créé par Velero. Quand le Backup
  contient le contrôleur, il est restauré dans la même opération : une fois le `PodVolumeRestore` terminé et le Pod
  `Ready`, le contrôleur restauré reprend la réconciliation, l'état réel et l'état désiré concordant déjà. Deux
  contournements plausibles qui ne fonctionnent pas (`existingResourcePolicy: update`, mise à l'échelle à 0 au
  préalable) sont décrits dans les problèmes connus.
- **Toutes les applications de ce dépôt sont gérées par ArgoCD.** `selfHeal` sur l'`Application` doit être absent
  pendant la procédure : sinon ArgoCD voit la suppression de l'étape 3 comme une dérive et recrée le contrôleur avant
  que Velero n'intervienne, ce qui reproduit le `PodVolumeRestore` bloqué. Une `Application` n'a pas de mode maintenance
  distinct ; désactiver sa politique de synchronisation (`argocd app set <app> --sync-policy none`) en tient lieu, pour
  toute procédure qui supprime ou modifie à la main une ressource réconciliée par ArgoCD. L'`ApplicationSet` ignore les
  écarts sur `.spec.syncPolicy.automated` (`projects/rhodes.akn/src/argocd/shoot.apps/applications.applicationset.yaml`)
  : la désactivation manuelle n'est donc pas écrasée. L'étape 3 la désactive, l'étape 7 la rétablit.
- **Les Schedules versionnés ne sauvegardent que `pods`, `persistentvolumeclaims` et `persistentvolumes`.** C'est le cas
  de `jellyfin`, `actual-budget` et `paperless-ngx` dans `projects/lungmen.akn/src/infrastructure/kubernetes/velero/`.
  Un Backup issu de ces Schedules ne contient donc pas le StatefulSet. La validation du 2026-08-05 portait sur un Backup
  qui le contenait (11 éléments restaurés) ; le comportement avec un Backup « PVC seul » n'a pas été vérifié.

> [!WARNING]\
> Cette procédure supprime le PVC cible. Vérifier `persistentVolumeReclaimPolicy` du PV lié avant de commencer (étape 1)
> : avec `Delete` plutôt que `Retain`, le volume sous-jacent est détruit immédiatement et sans retour possible hors de
> cette voie de restauration. Une politique `Retain` appliquée à l'échelle du cluster ne vaut pas rétroactivement pour
> un PV provisionné avant elle : vérifier le PV concerné.

## Prérequis

Avant de commencer, vérifier que `kubectl`, la CLI `velero` et la CLI `argocd` sont installées et configurées en local :
la procédure exécute `velero` directement, pas par `kubectl exec` dans le Deployment `velero` du cluster.

Les accès suivants sont également nécessaires :

- Accès `kubectl` au cluster cible, avec le droit de supprimer le workload propriétaire (StatefulSet ou Deployment) et
  son PVC, et de créer des objets `Restore` Velero dans le namespace de Velero.
- Accès à la CLI `argocd`, avec le droit de modifier la politique de synchronisation de l'`Application` ArgoCD qui gère
  `$APP_NAMESPACE`.
- Un `Backup` Velero terminé qui couvre le PVC et le PV sous-jacent, et le workload si la reprise du contrôleur doit
  venir de la restauration (voir le cadre technique). Un Backup limité au namespace convient s'il inclut ces ressources.
- Un `BackupRepository` sain : `kubectl get backuprepositories.velero.io -n $VELERO_NAMESPACE` doit afficher `Ready`.

Utiliser toujours les noms complets `backups.velero.io`, `restores.velero.io`, `podvolumerestores.velero.io` et
`backuprepositories.velero.io` : `kubectl get backups` ou `restores` (sans suffixe `.velero.io`) peut résoudre vers la
mauvaise CRD quand un autre opérateur enregistre aussi un kind court `Backup` ou `Restore`, ce que fait CloudNativePG.

## Entrées requises

Exporter ces variables une fois ; toutes les commandes suivantes se copient ensuite telles quelles.

```sh
export VELERO_NAMESPACE=<namespace de Velero>                       # ex. velero-system
export APP_NAMESPACE=<namespace de l'application cible>             # ex. jellyfin
export ARGOCD_APP_NAME=<Application ArgoCD qui gère APP_NAMESPACE>  # ex. jellyfin
export WORKLOAD_KIND=<statefulset|deployment>                       # contrôleur propriétaire du Pod cible
export WORKLOAD_NAME=<nom de ce workload>                           # ex. jellyfin
export PVC_NAME=<PVC à restaurer>                                   # ex. persistent-jellyfin-0
export BACKUP_NAME=<Backup Velero source>                           # voir ci-dessous
export RESTORE_NAME=<nom du nouvel objet Restore>                   # ex. ${WORKLOAD_NAME}-restore-$(date +%Y%m%d%H%M%S)
```

Choisir `BACKUP_NAME` parmi les sauvegardes saines les plus récentes de `APP_NAMESPACE`. Velero recrée dans le cluster
les objets `Backup` présents dans le bucket de sauvegarde (synchronisation périodique de la zone de stockage) : après
une reprise après sinistre, une fois Velero réinstallé et la zone de stockage `Available`, les sauvegardes d'avant le
sinistre apparaissent donc sans action de plus.

```sh
# La zone de stockage doit être Available : c'est elle qui synchronise les Backup du bucket vers le cluster
velero backup-location get --namespace $VELERO_NAMESPACE

# Les sauvegardes de l'application, par date de création (les Backup portent le nom du Schedule suivi de l'horodatage)
velero backup get --namespace $VELERO_NAMESPACE | grep "^$APP_NAMESPACE-"
```

`scripts/velero:backup backups <app>` donne la même liste, triée de la plus ancienne à la plus récente.

## Étape 1 — Confirmer la politique de rétention du PVC avant toute action

> [!CAUTION]\
> Le PVC est supprimé à l'étape 3 dans tous les cas : cette vérification ne change aucune étape suivante. Elle sert à
> savoir si cette suppression détruit aussi le volume (`Delete`) ; dans ce cas, il faut être certain que le Backup
> choisi est sain et assez récent avant de continuer.

```sh
PV_NAME=$(kubectl get pvc -n $APP_NAMESPACE $PVC_NAME -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PV_NAME" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}{"\n"}'
# → Delete : supprimer le PVC à l'étape 3 détruit le volume sous-jacent, immédiatement. Poursuivre seulement si le
#   Backup des entrées requises est confirmé sain et assez récent pour accepter ce risque.
# → Retain : le PV survit à la suppression du PVC en tant qu'orphelin. Risque plus faible, mais l'étape 3 reste
#   identique.
```

## Étape 2 — Vérifier que la sauvegarde contient de vraies données

```sh
kubectl get backups.velero.io -n $VELERO_NAMESPACE $BACKUP_NAME \
  -o jsonpath='{.status.phase}{"\t"}errors={.status.errors}{"\t"}warnings={.status.warnings}{"\n"}'
# → Completed	errors=	warnings=

kubectl get podvolumebackups.velero.io -n $VELERO_NAMESPACE \
  -l velero.io/backup-name=$BACKUP_NAME \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\t"}bytes={.status.progress.bytesDone}/{.status.progress.totalBytes}{"\n"}{end}'
# → une ligne par volume sauvegardé, phase=Completed, bytesDone == totalBytes et > 0
```

## Étape 3 — Désactiver la synchronisation ArgoCD, puis supprimer le workload et le PVC

```sh
# Capturer la politique de synchronisation actuelle pour que l'étape 7 sache s'il faut la rétablir.
SYNC_POLICY_BEFORE=$(argocd app get $ARGOCD_APP_NAME -o json | jq -r '.spec.syncPolicy.automated // empty')
# → non vide (ex. {"prune":true,"selfHeal":true}) si la synchronisation automatique était active ; vide si elle était
#   déjà manuelle.

argocd app set $ARGOCD_APP_NAME --sync-policy none
# → confirme que la politique de synchronisation est passée en manuel

# Supprime aussi le Pod en cascade : c'est voulu, pas un effet de bord à contourner.
kubectl delete $WORKLOAD_KIND -n $APP_NAMESPACE $WORKLOAD_NAME

# Détruit le volume immédiatement si l'étape 1 a montré reclaimPolicy=Delete.
kubectl delete pvc -n $APP_NAMESPACE $PVC_NAME

kubectl get pod,pvc,$WORKLOAD_KIND -n $APP_NAMESPACE
# → plus rien qui corresponde à WORKLOAD_NAME ni à PVC_NAME (les autres PVC du namespace, par exemple des partages
#   externes en lecture seule, ne sont pas touchés : la procédure ne cible que le PVC nommé)
```

## Étape 4 — Déclencher la restauration

```sh
velero restore create $RESTORE_NAME --from-backup $BACKUP_NAME
# → Restore request "<RESTORE_NAME>" submitted successfully.
```

Ne pas ajouter `--existing-resource-policy=update` ici : le workload et le PVC étant déjà supprimés (étape 3), plus rien
n'entre en conflit, et cette option ne concerne que le chemin cassé, fondé sur des patchs, que la procédure évite.

`scripts/velero:backup` enveloppe les étapes 2 et 4 (et les sauvegardes à la demande) par application : sans argument,
il ouvre un sélecteur ; `velero:backup restore <app> [<backup>]` affiche un plan à blanc (la restauration elle-même
demande `--apply` et la saisie du nom de l'application). Il restaure dans le namespace de l'application avec
`--existing-resource-policy none` et refuse de s'exécuter tant que des PVC y existent. L'étape 3 (synchronisation
ArgoCD, suppression du workload et du PVC) et les étapes 5 à 7 restent manuelles.

## Étape 5 — Suivre séparément la restauration et la progression au niveau du volume

Le compteur `itemsRestored` du `Restore` parent compte des ressources Kubernetes (workload, PVC, Pod, ...), pas des
octets de volume : un `Restore` peut afficher `Completed` avec tous les éléments restaurés alors que la restauration des
données est encore en cours, ou n'a jamais démarré. Le vrai signal est le `PodVolumeRestore`.

```sh
kubectl get restore.velero.io -n $VELERO_NAMESPACE $RESTORE_NAME \
  -o jsonpath='{.status.phase}{" items="}{.status.progress.itemsRestored}/{.status.progress.totalItems}{"\n"}'
# → InProgress items=11/11   (restauration des ressources terminée ; les données du volume peuvent encore être copiées)
# → Completed items=11/11    (état final)

kubectl get podvolumerestores.velero.io -n $VELERO_NAMESPACE \
  -l velero.io/restore-name=$RESTORE_NAME \
  -o jsonpath='{range .items[*]}{.status.phase}{" "}{.status.progress.bytesDone}/{.status.progress.totalBytes}{"\n"}{end}'
# → InProgress 566097972/1113847811   (progression en octets : le vrai signal « est-ce bloqué »)
# → Completed 1113847811/1113847811   (état final, bytesDone == totalBytes)
```

Si la phase du `PodVolumeRestore` reste vide ou non définie plus d'une à deux minutes avec zéro octet de progression, la
restauration est tombée dans le mode d'échec décrit dans le cadre technique : le `StatefulSet` ou le `Deployment`
propriétaire du `Pod` cible l'a recréé avant que Velero n'injecte son init container `restore-wait`. Revenir à l'étape
3, confirmer que le workload a bien été supprimé (et pas seulement mis à l'échelle), et vérifier que rien d'autre dans
le cluster n'a recréé entre-temps un Pod portant le nom cible.

## Étape 6 — Vérifier au niveau applicatif, pas seulement l'état du Pod

Un Pod `Ready` prouve que le conteneur a démarré, pas que les données _restaurées_ sont bien celles qu'il utilise : un
PVC ancien ou vide, lié par erreur, atteindrait aussi `Ready`. Chercher une preuve applicative.

```sh
# Les Pods d'un StatefulSet portent un nom déterministe `$WORKLOAD_NAME-0` ; pour un Deployment, trouver d'abord le nom
# du Pod courant : kubectl get pod -n $APP_NAMESPACE -l app=$WORKLOAD_NAME
kubectl get pod -n $APP_NAMESPACE $WORKLOAD_NAME-0
# → 1/1 Running

kubectl logs -n $APP_NAMESPACE $WORKLOAD_NAME-0 --tail=30
# → chercher une preuve d'état restauré propre à l'application (comptes utilisateurs existants, valeurs de
#   configuration connues, noms de bibliothèques ou de collections : tout ce qui ne peut être présent que si les
#   données d'avant la perte sont revenues, et pas seulement l'état par défaut ou vide du premier démarrage)
```

## Étape 7 — Réactiver la synchronisation ArgoCD

Rétablir la synchronisation seulement si `SYNC_POLICY_BEFORE` (étape 3) n'était pas vide : une application déjà en
synchronisation manuelle avant la procédure le reste, cette décision n'étant pas du ressort de la procédure.

```sh
if [ -n "$SYNC_POLICY_BEFORE" ]; then
  argocd app set $ARGOCD_APP_NAME --sync-policy automated --auto-prune --self-heal
  # → confirme que la politique est revenue en automatique. Adapter --auto-prune / --self-heal si
  #   $SYNC_POLICY_BEFORE montrait des valeurs de prune / selfHeal différentes du défaut habituel de ce dépôt (les deux
  #   à true).
else
  echo "Synchronisation déjà manuelle avant la procédure : laissée en l'état."
fi
```

## Exemple complet : `jellyfin` sur `lungmen.akn`

Les valeurs ci-dessous sont celles de la validation du 2026-08-05.

> [!NOTE]\
> Depuis, le `volumeClaimTemplates` de `jellyfin` utilise la `StorageClass` `proxmox-lvmthin-ext4-retain`
> (`projects/lungmen.akn/src/apps/jellyfin/jellyfin.statefulset.yaml`) : un PVC provisionné aujourd'hui aurait une
> politique `Retain`, alors que le PV de la validation était en `Delete`.

```sh
export VELERO_NAMESPACE=velero-system
export APP_NAMESPACE=jellyfin
export ARGOCD_APP_NAME=jellyfin
export WORKLOAD_KIND=statefulset
export WORKLOAD_NAME=jellyfin
export PVC_NAME=persistent-jellyfin-0
export BACKUP_NAME=jellyfin-20260805150447
export RESTORE_NAME=jellyfin-corruption-test3-20260805190312

# Étape 1
PV_NAME=$(kubectl get pvc -n jellyfin persistent-jellyfin-0 -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PV_NAME" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}{"\n"}'
# → Delete (confirmé en direct : contredit une hypothèse antérieure selon laquelle ce PV était déjà passé en Retain ;
#   un changement de StorageClass en Retain à l'échelle du cluster ne s'applique pas rétroactivement aux PV
#   provisionnés avant lui)

# Étape 3
SYNC_POLICY_BEFORE=$(argocd app get jellyfin -o json | jq -r '.spec.syncPolicy.automated // empty')
argocd app set jellyfin --sync-policy none
kubectl delete statefulset -n jellyfin jellyfin
kubectl delete pvc -n jellyfin persistent-jellyfin-0

# Étape 4
velero restore create jellyfin-corruption-test3-20260805190312 \
  --from-backup jellyfin-20260805150447 --namespace velero-system

# Étape 5 (état final atteint)
# restore.velero.io: Completed items=11/11
# podvolumerestores.velero.io: Completed 1113847811/1113847811

# Étape 6
kubectl logs -n jellyfin jellyfin-0 --tail=30
# → vrais comptes utilisateurs restaurés présents : "Alexandre NICOLAIE", "François NICOLAIE",
#   "Estelle SCHWEICHLER", "FireStick 4K - Salon" : la vraie configuration SQLite d'avant la perte est revenue, pas une
#   base neuve ou vide

# Étape 7
if [ -n "$SYNC_POLICY_BEFORE" ]; then
  argocd app set jellyfin --sync-policy automated --auto-prune --self-heal
fi
```

## Vérifications rapides

- **Phase du Restore** : `kubectl get restore.velero.io -n $VELERO_NAMESPACE $RESTORE_NAME` — `Completed`
- **Données du volume entièrement écrites** :
  `kubectl get podvolumerestores.velero.io -n $VELERO_NAMESPACE -l velero.io/restore-name=$RESTORE_NAME -o jsonpath='{.items[0].status.progress}'`
  — `bytesDone == totalBytes`, les deux non nuls
- **Aucun échec de patch silencieux** :
  `velero restore logs $RESTORE_NAME --namespace $VELERO_NAMESPACE | grep -i "patch attempt failed"` — aucune sortie
- **Pod sain** : `kubectl get pod -n $APP_NAMESPACE $WORKLOAD_NAME-0` — `1/1 Running`
- **Données applicatives présentes** : contrôle propre à l'application dans les logs ou l'API (étape 6) ; ne jamais
  l'omettre
- **Synchronisation ArgoCD rétablie** : `argocd app get $ARGOCD_APP_NAME -o json | jq '.spec.syncPolicy.automated'` —
  correspond à `$SYNC_POLICY_BEFORE` de l'étape 3

## Problèmes connus

### `existingResourcePolicy: update` ne résout pas l'échec de la restauration naïve

Ce contournement documenté de Velero applique un JSON merge PATCH sur les ressources existantes, au lieu de les
supprimer puis de les recréer. Kubernetes rejette lui-même le patch sur les champs que Velero doit modifier :
`spec.initContainers: Forbidden: pod updates may not add or remove containers` pour le Pod, et
`spec: Forbidden: spec is immutable after creation except resources.requests...` pour un PVC déjà lié. L'objet `Restore`
affiche tout de même `Completed`, avec des avertissements : la seule phase ne dit pas que les données n'ont jamais été
touchées.

### Mettre le workload à l'échelle 0 au préalable ne fonctionne pas non plus

Avec un nombre de réplicas désiré à 0, le contrôleur supprime _tout_ Pod correspondant à son motif de nom dès qu'il
apparaît, y compris celui que crée la restauration Velero. Confirmé par un événement `SuccessfulDelete` du contrôleur,
quelques secondes après la création du `PodVolumeRestore` ; ce dernier reste alors orphelin, sans erreur visible : c'est
le même échec silencieux que lors d'une restauration naïve, sans la séquence de cette procédure.

### Une restauration précédente a laissé un `PodVolumeRestore` orphelin qui bloque `kubectl delete`

Si une tentative antérieure a utilisé la mise à l'échelle à 0 (ou a été interrompue pendant le remplacement de son Pod
cible), le `PodVolumeRestore` restant porte le finalizer `velero.io/pod-volume-finalizer`. Son chemin de nettoyage
dépend de la même recherche de Pod qui est déjà cassée pour lui : il ne peut jamais retirer son propre finalizer, et un
`kubectl delete` ordinaire reste bloqué indéfiniment.

```sh
kubectl patch podvolumerestores.velero.io -n $VELERO_NAMESPACE <STUCK_PVR_NAME> \
  --type=merge -p '{"metadata":{"finalizers":[]}}'
kubectl delete podvolumerestores.velero.io -n $VELERO_NAMESPACE <STUCK_PVR_NAME>
kubectl delete restore.velero.io -n $VELERO_NAMESPACE <STUCK_RESTORE_NAME>
```

Remettre aussi le nombre de réplicas du workload à la valeur attendue par le Backup avant de réessayer avec cette
procédure : un nombre désiré incohérent est ce qui a causé l'orphelinage.

## Historique

- _2026-10-17_ : Reprise après revue : la liste des sauvegardes passe par la CLI `velero` et la synchronisation de la
  zone de stockage (utile après un sinistre), l'avertissement de l'étape 1 devient un callout `CAUTION`, les ressources
  Kubernetes sont en code, et l'état de vérification de la procédure est un callout `WARNING`.
- _2026-10-11_ : Migration vers le standard de documentation en français (#1257). Vérification contre le dépôt : le
  `volumeClaimTemplates` de `jellyfin` utilise désormais `proxmox-lvmthin-ext4-retain` (la valeur `Delete` de l'exemple
  est celle de la validation du 2026-08-05) ; les Schedules Velero versionnés ne sauvegardent que pods, PVC et PV, et
  non le workload, ce qui est ajouté au cadre technique ; ajout de la référence à l'`ApplicationSet` qui ignore
  `.spec.syncPolicy.automated`. Le lien vers `scripts/velero:backup` et ses comportements (`--apply`,
  `--existing-resource-policy none`, refus si des PVC existent) sont confirmés par le script. Les commandes n'ont pas
  été rejouées.
- _2026-08-06_ : Ajout de la désactivation de la synchronisation ArgoCD à l'étape 3 et d'une étape 7 pour la rétablir :
  toutes les applications de ce dépôt sont gérées par GitOps, et `selfHeal` en concurrence avec la suppression de
  l'étape 3 peut reproduire l'échec du `PodVolumeRestore` bloqué que la procédure évite. Documentation de ce point comme
  convention du dépôt (cadre technique), et plus comme simple note isolée. Simplification de l'étape 1 d'une décision à
  deux branches vers un seul contrôle de risque, la politique de rétention ne changeant pas l'étape 3. Suppression du
  vocabulaire « correctif » : c'est une procédure, pas un récit de bug.
- _2026-08-06_ : Généralisation du StatefulSet seul à tout type de workload (`WORKLOAD_KIND` / `WORKLOAD_NAME`), passage
  à la CLI `velero` directe au lieu de `kubectl exec` dans le Deployment du cluster, déplacement de la note sur les noms
  de CRD complets dans les prérequis, et passage de toutes les commandes à des variables shell exportées pour les
  copier-coller.
- _2026-08-05_ : Création initiale, après validation en direct sur l'application `jellyfin` de `lungmen.akn` (voir
  l'exemple complet).

## Pour aller plus loin

- [Expérience EXP-2026-007, sauvegarde de PVC avec Velero](../../experiments/20260803-velero-pvc-backup/README.md) :
  l'expérience locale qui a précédé l'adoption de Velero pour les PVC.
- [Restaurer CNPG depuis le stockage objet](../databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md) : la
  procédure équivalente pour une base CloudNative-PG, qui ne passe pas par Velero.
- [velero-io/velero#9461](https://github.com/velero-io/velero/issues/9461) : le ticket amont qui correspond à ce mode
  d'échec (`PodVolumeRestore` bloqué quand son Pod cible n'existe plus), clos « by design » ; aucun changement amont à
  attendre.
- [Velero : Restore Reference](https://velero.io/docs/main/restore-reference/) : documentation de
  `existingResourcePolicy`, avec ses limites sur les champs immuables.
- [chezmoidotsh/arcane#1208](https://github.com/chezmoidotsh/arcane/issues/1208) : l'expérience que la découverte de
  cette procédure a remplacée ; elle documente les contournements ratés (`existingResourcePolicy: update`, redémarrages
  du contrôleur, attente du délai de réconciliation) qui ont conduit à évaluer k8up avant de trouver cette procédure.
  [chezmoidotsh/arcane#1188](https://github.com/chezmoidotsh/arcane/issues/1188) est la recréation de `lungmen.akn`, où
  l'échec de restauration d'origine a été rencontré.
