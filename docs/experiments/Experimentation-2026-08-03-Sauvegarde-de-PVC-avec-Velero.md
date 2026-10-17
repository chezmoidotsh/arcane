# Expérimentation 2026-08-03 Sauvegarde De PVC Avec Velero

Cette expérience (EXP-2026-007, issue [#1054](https://github.com/chezmoidotsh/arcane/issues/1054)) vérifie en local que
le chemin fs-backup Kopia de Velero préserve les données d'un PVC à travers un cycle sauvegarde, perte de données,
restauration. Conclusion : le cycle fonctionne sur un Postgres réel, à condition de sélectionner les volumes par
annotation de Pod.

Migré le 2026-10-11 ; les résultats décrits sont ceux de l'époque et n'ont pas été rejoués.

| Élément       | Valeur                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| Statut        | OK                                                                         |
| Date          | 2026-08-03                                                                 |
| Velero        | v1.18.1 (chart 12.1.0), plugin AWS v1.13.1                                 |
| Portée exclue | Le chemin CSI-snapshotter (sauvegarde incrémentale), non testable en local |

## Question

L'issue #1054 demande, avant de toucher un cluster réel, si le fs-backup Kopia de Velero conserve réellement les données
d'un PVC. « Fonctionne » désigne ici une affirmation vérifiable : l'application restaurée relit exactement les données
qu'elle avait écrites avant la suppression.

Contraintes retenues :

- reproductible depuis un dépôt propre avec une commande (`mise run poc:bootstrap`) ;
- cible S3-compatible proche des candidats réels (MinIO ou Backblaze B2), pour que la configuration
  `backupStorageLocation` soit représentative ;
- application réelle avec PVC, pas un fichier synthétique : la vérification doit prouver qu'une _application_ relit ses
  données ;
- aucun accès à `lungmen.akn`, `rhodes.akn` ni à des identifiants OpenBao, Cloudflare ou S3 réels.

Hors périmètre : les sauvegardes par snapshot CSI (il faut le vrai `proxmox-csi-plugin` et sa `VolumeSnapshotClass`),
Backblaze B2 en particulier (l'API S3 de MinIO suffit à valider la liaison Velero et S3), et le packaging multi-cluster
(point 5 des critères d'acceptation de l'issue).

## Montage

Tout tourne dans un cluster kind jetable, avec MinIO comme cible S3 et un StatefulSet Postgres jetable comme
application. Le code est dans [`20260803-velero-pvc-backup/`](20260803-velero-pvc-backup/README.md).

```text
kind cluster "velero-poc"
├── namespace velero-poc
│     └── MinIO (nœud unique, API S3), bucket "velero-backups"
├── namespace velero
│     ├── Deployment Velero (backend Kopia, sans VolumeSnapshotLocation CSI)
│     └── DaemonSet node-agent (chemin de données Kopia, sauvegarde et restauration)
└── namespace velero-poc-app
      └── StatefulSet test-app (Postgres 17), PVC "data-test-app-0"
            lié à un PV statique de type `local`
```

MinIO remplace Garage (utilisé par
l'[expérience Pulumi/Crossplane](Experimentation-2026-07-02-Evaluation-Pulumi-contre-Crossplane.md)) parce que la cible
réelle de #1054 est « MinIO existant ou Backblaze B2 » : garder le même backend garde `s3ForcePathStyle` et la région
représentatifs.

| Composant           | Valeur                                            |
| ------------------- | ------------------------------------------------- |
| kind                | v0.32.0, image de nœud `kindest/node:v1.36.1`     |
| Velero              | chart 12.1.0, application v1.18.1, uploader Kopia |
| Plugin AWS          | `velero/velero-plugin-for-aws:v1.13.1`            |
| MinIO               | `minio/minio:RELEASE.2025-09-07T16-13-09Z`        |
| Application de test | `postgres:17-alpine`, PV statique `local` de 1Gi  |

| Fichier                                                                                           | Rôle                                                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`manifests/minio.yaml`](20260803-velero-pvc-backup/manifests/minio.yaml)                         | MinIO à nœud unique et Job de création du bucket                     |
| [`manifests/velero-helmvalues.yaml`](20260803-velero-pvc-backup/manifests/velero-helmvalues.yaml) | Values Helm de Velero : backend Kopia, `backupStorageLocation` MinIO |
| [`manifests/test-app.yaml`](20260803-velero-pvc-backup/manifests/test-app.yaml)                   | StorageClass `manual`, PV `local` statique, StatefulSet Postgres     |
| [`scripts/bootstrap.sh`](20260803-velero-pvc-backup/scripts/bootstrap.sh)                         | Création du bac à sable                                              |
| [`scripts/validate.sh`](20260803-velero-pvc-backup/scripts/validate.sh)                           | Scénario de validation                                               |
| [`scripts/teardown.sh`](20260803-velero-pvc-backup/scripts/teardown.sh)                           | Suppression du cluster                                               |

Le bootstrap est idempotent : il crée le cluster kind s'il manque (avec le répertoire `/mnt/velero-poc-data` dont le PV
statique a besoin sur le nœud), le réutilise sinon, puis déploie MinIO, Velero (chart officiel, backend Kopia) et
l'application Postgres.

```sh
mise run poc:bootstrap
mise run poc:validate
mise run poc:teardown   # supprime le cluster kind et tout son contenu
```

`poc:validate` écrit une ligne marqueur horodatée dans Postgres, lance une sauvegarde Kopia
(`velero backup create --wait`), supprime tout le namespace `velero-poc-app` (perte de données simulée), efface le
`claimRef` périmé du PV statique, restaure (`velero restore create --wait`) et vérifie que la ligne marqueur est
revenue.

| ID    | Critère                                                      |
| ----- | ------------------------------------------------------------ |
| V-001 | La phase du Backup est `Completed`                           |
| V-002 | Le namespace a disparu après suppression                     |
| V-003 | La phase du Restore est `Completed`                          |
| V-004 | Le namespace est restauré                                    |
| V-005 | Le PVC est restauré et `Bound`                               |
| V-006 | Postgres est prêt après restauration                         |
| V-007 | La ligne marqueur a survécu au cycle sauvegarde/restauration |

## Résultats

`mise run poc:bootstrap` suivi de `mise run poc:validate` passe les 7 vérifications sur une exécution propre :

```text
=== Results: 7 passed, 0 failed ===
```

Trois problèmes rencontrés en chemin, chacun avec son contournement.

### Le flag global `defaultVolumesToFsBackup` ignore le PVC

`configuration.defaultVolumesToFsBackup: true` (le flag global d'opt-out de Velero) a été essayé en premier. Velero
l'accepte sans erreur, mais le volume PVC `data` n'est jamais sauvegardé : seuls les deux volumes `emptyDir` du Pod le
sont. La cause racine n'a pas été cherchée (il faudrait tracer `volumeHelperImpl.ShouldPerformFSBackup` dans le code de
Velero, hors budget d'un POC rapide). Contournement : le mécanisme explicite et documenté, une annotation sur le Pod
(`manifests/test-app.yaml`), qui a fonctionné.

```yaml
metadata:
  annotations:
    backup.velero.io/backup-volumes: data
```

`configuration.defaultVolumesToFsBackup` reste donc non défini dans `manifests/velero-helmvalues.yaml`.

### La StorageClass par défaut de kind est incompatible avec le fs-backup

La StorageClass `standard` de kind (`rancher.io/local-path`) provisionne des PV de type `hostPath`, que le fs-backup de
Velero refuse explicitement :

```text
level=warning msg="Volume data in pod velero-poc-app/test-app-0 is a hostPath volume which is not supported for
pod volume backup, skipping" logSource="pkg/podvolume/backupper.go:347"
```

C'est une limite documentée de Velero, pas une erreur de configuration. La suite e2e de Velero la contourne avec le
driver CSI communautaire `csi-driver-host-path`, qui produit des PV typés CSI, mais son installation est lourde
(external-provisioner, external-attacher, external-resizer, node-driver-registrar, plugin). Un PV statique de type
`local` dans une StorageClass `manual` donne le même résultat pour une fraction de la mise en place : kubelet monte le
volume de la même façon, et `local` n'est pas `hostPath` du point de vue du contrôle de Velero.

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: velero-poc-data
spec:
  local:
    path: /mnt/velero-poc-data # pré-créé sur le nœud kind, voir scripts/bootstrap.sh
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions: [{ key: kubernetes.io/hostname, operator: In, values: [velero-poc-control-plane] }]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
```

`manual` a pour provisioner `kubernetes.io/no-provisioner` : pas de provisionnement dynamique, donc `Retain` (et non
`Delete`) est obligatoire, car rien n'exécuterait la suppression. Après la suppression du PVC par l'étape de perte de
données, le PV reste `Released` avec un `claimRef` périmé ; `scripts/validate.sh` l'efface pour que le PVC restauré
(même nom, nouvel UID) s'y lie normalement :

```sh
kubectl patch pv ... --type json -p '[{"op": "remove", "path": "/spec/claimRef"}]'
```

Sur l'infrastructure réelle, ce contournement ne s'applique pas : les PV provisionnés par `proxmox-csi-plugin` sont
typés CSI (confirmé par l'[expérience CSI/CCM](Experimentation-2026-06-17-Proxmox-CSI-et-CCM.md)), donc l'exclusion
`hostPath` ne se déclenche jamais. C'est un artefact du bac à sable kind.

### Postgres exige la propriété des fichiers, pas seulement l'accès par groupe

`fsGroup` seul (accès en écriture par groupe, via le chown récursif du kubelet au montage) ne suffit pas à l'entrypoint
de Postgres : il appelle `chmod` sur `PGDATA`, ce qui exige la _propriété_ des fichiers (ou `CAP_FOWNER`), pas
l'appartenance au groupe. Un `initContainer` root qui exécute `chown -R 70:70` sur le PVC et sur l'emptyDir `run` avant
le démarrage de Postgres en non-root règle le problème. Cet init container ne doit pas hériter du
`capabilities.drop: [ALL]` du conteneur principal : sans `CAP_CHOWN`/`CAP_FOWNER`, même l'UID 0 ne peut pas changer le
propriétaire d'un chemin qu'il ne possède pas déjà.

## Conclusion

Adoptée. Le fs-backup Kopia fonctionne : les données d'un PVC Postgres réel survivent intactes à un cycle suppression,
restauration, avec la forme de cible (S3-compatible, MinIO ou B2) et le motif StatefulSet que les charges réelles de
#1054 (CNPG, Paperless, Immich) utilisent. L'expérience clôt deux critères d'acceptation de #1054 : « Velero est déployé
et sain » et « au moins une sauvegarde réussit, le test de restauration passe ».

Le silence du flag `defaultVolumesToFsBackup` est à retenir pour tout déploiement réel : annoter chaque charge avec
`backup.velero.io/backup-volumes`, car le flag global a exclu un volume PVC sans erreur ni avertissement, ce qui donne
un faux sentiment de couverture. Les contournements kind (exclusion `hostPath`, PV `local` statique) ne se reproduisent
pas sur `lungmen.akn`.

Non couvert par l'expérience :

- **Sauvegardes incrémentales par snapshot CSI** (l'autre critère d'acceptation de #1054) : il faut la
  `VolumeSnapshotClass` du vrai driver Proxmox CSI, qu'aucun substitut local ne reproduit assez fidèlement. À valider
  directement sur `lungmen.akn`.
- **Restauration vers un autre cluster ou namespace** : le POC restaure dans le cluster d'origine, et #1054 n'exige pas
  de restauration inter-cluster.
- **Sauvegarde d'un vrai cluster CNPG** (et non d'un StatefulSet Postgres simple) : la mécanique de sauvegarde et
  d'archivage WAL de CNPG peut interagir autrement avec un snapshot Kopia concurrent (pré/post hooks fsfreeze, par
  exemple). À vérifier avant de s'y fier pour les clusters CNPG de `lungmen.akn`.

Suites prévues à l'époque : déployer la même configuration sur `lungmen.akn` contre une vraie cible S3 avec le motif
d'annotation, puis répéter la validation sur le PVC d'une application réelle ; valider séparément le chemin CSI-snapshot
; packager le tout en `Application` ArgoCD réutilisable (point 5 de #1054), avec un overlay `velero.helmvalues/` par
cluster. Le MinIO du POC est jetable : le déploiement réel exige un bucket externe persistant.

> [!NOTE]\
> **Mise à jour du 2026-10-11.** Velero est déployé sur `lungmen.akn`, sous
> `projects/lungmen.akn/src/infrastructure/kubernetes/velero/` : un overlay `velero.helmvalues/default.yaml` et des
> Schedules `jellyfin`, `actual-budget` et `paperless-ngx` (`*.pvc-backup.schedule.yaml`) qui ne sauvegardent que
> `pods`, `persistentvolumeclaims` et `persistentvolumes`. Le commentaire de `velero.helmvalues/default.yaml` reprend la
> conclusion de l'expérience (annotation `backup.velero.io/backup-volumes` plutôt que `defaultVolumesToFsBackup`). La
> restauration sous GitOps, que l'expérience ne couvrait pas, est décrite dans la procédure ci-dessous. Aucun Velero
> n'est présent dans `projects/rhodes.akn/src/infrastructure/kubernetes/`.

Références amont : [documentation fs-backup de Velero](https://velero.io/docs/main/file-system-backup/), et la limite
`hostPath` dans `pkg/podvolume/backupper.go` (vmware-tanzu/velero, tag v1.18.1). Issues liées :
[#1051](https://github.com/chezmoidotsh/arcane/issues/1051) (EXP-2026-005, le snapshotter Proxmox CSI exige `root@pam`,
raison d'être de ce POC), [#1028](https://github.com/chezmoidotsh/arcane/issues/1028) (déploiement de
proxmox-csi-plugin) et [#1188](https://github.com/chezmoidotsh/arcane/issues/1188) (recréation de `lungmen.akn`, cible
réelle de la stratégie).

## Pour aller plus loin

- [Procedure BKP-20260805-00 Restaurer un PVC Velero sous GitOps](../procedures/backups/BKP-20260805-00-Restaurer-un-PVC-Velero-sous-GitOps.md)
  : la restauration en production, née de cette expérience.
- [Code de l'expérience](20260803-velero-pvc-backup/README.md) : manifests et scripts du bac à sable.
- [Expérience CSI/CCM Proxmox](Experimentation-2026-06-17-Proxmox-CSI-et-CCM.md) : précédent sur le typage CSI des PV.
