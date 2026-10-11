# Restaurer Rhodes

Ce guide reconstruit `rhodes.akn` de bout en bout après la perte du cluster qui l'héberge : de l'environnement Proxmox
vide jusqu'à un cluster synchronisé et géré par ArgoCD. Il enchaîne le provisionnement du cluster (Omni) et les deux
guides propres aux composants, [Restaurer OpenBao](Restaurer-OpenBao.md) et
[Restaurer Pocket-Id](Restaurer-Pocket-Id.md), dans l'ordre imposé par leurs dépendances.

> [!WARNING]\
> Brouillon traduit, non validé : la refonte du plan de reprise est suivie dans
> [l'issue 1109](https://github.com/chezmoidotsh/arcane/issues/1109). Vérifié contre le dépôt le 2026-10-11 ; les
> commandes n'ont pas été rejouées sur les clusters pour cette migration. Ce guide a été écrit avant la panne
> d'`amiya.akn` ; les étapes 2 à 4 ont été jouées sur un cluster `rhodes.akn` réel lors de deux exercices (2026-07-27 et
> 2026-07-28), et l'ensemble a été validé à la migration d'`amiya.akn` vers `rhodes.akn` (voir
> l'[historique](#historique)).

## Avant de commencer

Outils : `omnictl`, `kubectl`, `s3cmd`, `kustomize`, `ksops`, `cilium` et `pulumi`. `mise install`, lancé dans
`projects/rhodes.akn/`, installe ceux que `mise` gère. Les tâches `dr:openbao:*` et `dr:pocket-id:*` utilisées par les
deux guides de composants sont définies dans
[`.mise.toml`](../../../projects/rhodes.akn/docs/disaster-recovery/.mise.toml) de
`projects/rhodes.akn/docs/disaster-recovery/` : elles ne sont disponibles que depuis ce dossier.

Accès et états requis :

| Prérequis                                    | Utilisé pour                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accès à Omni (`omnictl config new` ou `add`) | Provisionner le cluster à l'étape 1.                                                                                                                  |
| `SOPS_AGE_KEY_FILE` valide                   | Déchiffrer chaque secret `sops/` appliqué dans la chaîne (`external-dns/sops`, `vault/sops`, `pocket-id/sops`, `argocd/sops`).                        |
| Accès à la stack Pulumi `rhodes-akn-infra`   | `pulumi login` fait et stack sélectionnée, pour les `pulumi up` des étapes 3 et 7. Il faut aussi l'accès à la stack Pulumi de `chezmoi.sh` (étape 3). |
| Token root d'OpenBao                         | Récupéré à l'avance dans le gestionnaire de secrets personnel : il sert aux étapes 5 et 7. Il n'est consigné nulle part dans le dépôt.                |

Entrée requise : `CLUSTER_CONTEXT`, le contexte `kubectl` du nouveau cluster (par exemple `admin@rhodes.akn`), écrit
`<CLUSTER_CONTEXT>` dans les commandes.

Le détail du token root et de la reprise d'accès à OpenBao est dans [Restaurer OpenBao](Restaurer-OpenBao.md).

## Étapes

### Étape 1 — Provisionner le cluster

Cilium s'installe en deux temps. Talos pose sa base (DaemonSet, opérateur) automatiquement ici, via les `extraManifests`
du template de cluster. Le reste de sa configuration (annonces L2, pool d'IP du LoadBalancer, `GatewayClass`,
`NetworkPolicy`) est appliqué à la main à l'étape 2.

Appliquer `projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml` avec `omnictl`, en suivant la
[procédure OMNI-20260721-00](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) jusqu'à l'étape
8 (kubeconfig et vérification du CNI). Les étapes 9 et 10 de cette procédure (identité Proxmox, CSI et CCM)
correspondent aux étapes 2 et 3 du présent guide, et sa
[liste de validation](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#liste-de-validation)
est passée à l'étape 4. S'arrêter avant son étape 11 (enregistrement GitOps) : ArgoCD s'amorce en dernier.

### Étape 2 — Déployer `dist/infrastructure/kubernetes/`

Rien de cette étape ne dépend de Vault, d'ESO ou d'ArgoCD : Pulumi écrit directement les secrets dont ces applications
ont besoin (étape 3), sans passer par ESO. Tout n'est pourtant pas sain immédiatement : `cert-manager`, `cloudnative-pg`
et `external-secrets` livrent chacun au moins une ressource derrière un webhook de validation, qui ne démarre qu'une
fois les identifiants du Proxmox CCM/CSI arrivés à l'étape 3 (voir les erreurs attendues plus bas).

Créer d'abord les namespaces que ces applications ne créent pas elles-mêmes. Contrairement à `cilium` (dont le chart
crée `cilium-secrets`), aucune ne livre d'objet `Namespace` : elles s'appuient d'ordinaire sur `CreateNamespace=true`
d'ArgoCD, qui n'existe pas encore à ce stade.

```sh
for ns in proxmox-system cert-manager-system cloudnative-pg-system external-secrets-system external-dns-system; do
  kubectl --context <CLUSTER_CONTEXT> create namespace "$ns" --dry-run=client -o yaml \
    | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -
done

kubectl --context <CLUSTER_CONTEXT> label namespace proxmox-system pod-security.kubernetes.io/enforce=privileged pod-security.kubernetes.io/enforce-version=v1.33
```

> [!WARNING]\
> Utiliser `kubectl label`, pas `kubectl annotate` : Pod Security Admission lit les **labels** du namespace, pas ses
> annotations. `annotate` ne fait rien sans le signaler (le namespace garde la politique `baseline` par défaut du
> cluster) et le DaemonSet `proxmox-csi-plugin-node` échoue pour chaque Pod avec
> `violates PodSecurity "baseline:latest"`, sans jamais obtenir un seul Pod CSI de nœud sur les 3. Ce cas s'est produit
> lors d'un exercice réel (2026-07-28) ; le `describe daemonset` de la validation CSI/CCM (étape 4) le fait apparaître
> s'il se reproduit.

Appliquer ensuite chaque application, une à la fois :

```sh
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cilium/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/proxmox/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cert-manager/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cloudnative-pg/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-secrets/
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/external-dns/

kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/infrastructure/kubernetes/external-dns/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
kubectl --context <CLUSTER_CONTEXT> apply --server-side --force-conflicts -f projects/rhodes.akn/dist/infrastructure/kubernetes/cilium/
```

Notes sur ce bloc :

- **Ligne `external-dns/sops`.** Elle est séparée parce que `dist:render` n'écrit jamais dans `dist/` les secrets issus
  de ksops (voir son contrôle `_has_ksops`). Chaque dossier `sops/` de la chaîne demande ce même
  `kustomize build ... | kubectl apply`, comme le font déjà l'étape 1 de [Restaurer OpenBao](Restaurer-OpenBao.md) et
  celle de [Restaurer Pocket-Id](Restaurer-Pocket-Id.md) pour leurs propres dossiers `sops/`. Celle-ci livre
  l'identifiant BIND RFC2136/TSIG dont la release `external-dns-bind` (appliquée par la ligne `dist/` qui la précède) a
  besoin.
- **`cilium/` appliqué deux fois.** La première passe fait démarrer le CNI, la seconde, en fin de bloc, applique ce qui
  a échoué la première fois. Les `Gateway` et le `Certificate` wildcard vivent dans ce même dossier (la Gateway API de
  Cilium n'a pas de Pod dédié par Gateway : le plan de données est l'Envoy embarqué dans `cilium-agent`, bloqué dans le
  namespace `kube-system` de cette release Helm sans valeur de chart pour le déplacer ; voir
  `projects/rhodes.akn/src/infrastructure/kubernetes/README.md`). Or le `Certificate` a besoin de la CRD de
  cert-manager, absente à la première passe. La seconde passe ne change rien à ce qui est déjà réconcilié (même field
  manager, contenu inchangé). Avec `--server-side --force-conflicts`, elle ne répète pas la micro-coupure de mise à jour
  progressive de la première passe : celle-ci était un transfert unique de propriété de field manager depuis les
  `extraManifests` d'amorçage de Talos, déjà réglé.
- **Une application à la fois.** Confirmer le succès de chaque commande avant la suivante : la liste n'enchaîne pas avec
  `&&`, donc coller le bloc entier ne s'arrête pas sur un échec. `cert-manager` doit précéder `cloudnative-pg` (son
  `Issuer` et ses `Certificate` ont besoin des CRD de cert-manager déjà enregistrées) et la seconde application de
  `cilium` (même raison, pour son `Certificate` wildcard).
- **`--server-side` est obligatoire.** L'application côté client rejette la CRD `httproutes` de la Gateway API
  (`metadata.annotations: Too long: may not be more than 262144 bytes` : son schéma dépasse la taille de l'annotation
  `last-applied-configuration`).

> [!WARNING]\
> L'application de `cilium` échoue au premier essai avec plusieurs erreurs `Apply failed with N conflicts`. Les
> `extraManifests` d'amorçage de Talos (le CNI de l'étape 1, appliqué sous le field manager `cilium` géré par Omni)
> possèdent déjà les objets DaemonSet, Deployment et ConfigMap, et le field manager de `kubectl` entre en conflit avec
> lui en SSA. Relancer avec `--force-conflicts` (déjà présent dans les commandes ci-dessus) : cela transfère la
> propriété du manifeste d'amorçage vers celui rendu dans `dist/` (même mécanisme que l'adoption des ressources
> appliquées à la main par ArgoCD à l'étape 9) et déclenche une courte mise à jour progressive du DaemonSet Cilium.
> Cette coupure d'environ 2 minutes est attendue ; voir
> [Coupure de connectivité de 2 minutes pendant la reprise de kube-proxy par Cilium](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#coupure-de-connectivité-de-2-minutes-pendant-la-reprise-de-kube-proxy-par-cilium).

Deux familles d'erreurs sans gravité, qui se résolvent d'elles-mêmes, sont attendues à la première passe. Aucune ne
signifie que l'étape 2 a échoué.

- **`no matches for kind "X" ... ensure CRDs are installed first`** sur une ressource dont la CRD a été créée plus tôt
  dans la _même_ commande `apply -f <dossier>` (vu sur la `GatewayClass` de `cilium`). `kubectl` résout la surface d'API
  une fois au début de chaque invocation : une CRD qu'il vient de créer n'est pas encore visible pour une ressource
  suivante du même lot. Relancer exactement la même commande une seconde fois : la CRD est enregistrée et tout passe. La
  première application de `cilium` échoue aussi sur son `Certificate` wildcard avec une erreur semblable, mais pour une
  autre raison : la CRD de `cert-manager.io` n'existe pas du tout à ce moment (`cert-manager` n'est pas encore
  appliqué), donc relancer `cilium/` immédiatement n'y change rien. Seule la seconde application de `cilium`, en fin de
  bloc, la résout.
- **Appels de webhook en échec avec `dial tcp ...: connect: operation not permitted`** (l'erreur complète nomme
  `webhook.cert-manager.io` ou `....external-secrets.io`) sur le `ClusterIssuer` de `cert-manager`, les deux
  `Certificate` de `cloudnative-pg` (`barman-cloud-client` et `barman-cloud-server`), le `ClusterSecretStore`
  d'`external-secrets`, un `ExternalSecret` d'`external-dns` et le `Certificate` wildcard de la seconde application de
  `cilium`. Cause : les Pods `cert-manager-webhook` et `external-secrets-webhook` restent `Pending` (les nœuds portent
  encore le taint `node.cloudprovider.kubernetes.io/uninitialized`) tant que le Pod du Proxmox CCM ne tourne pas, et
  celui-ci ne peut pas démarrer avant de monter son `Secret` d'identifiants `proxmox-cloud-provider`, que le `pulumi up`
  de l'étape 3 livre, pas cette étape. C'est attendu à ce point de la chaîne et il n'y a rien à corriger ici :
  réappliquer ces six ressources une fois l'étape 3 passée (ou intégrer ce nouvel essai à la validation de l'étape 4).

L'application `external-dns` exécute deux releases (`external-dns-unifi`, `external-dns-bind`) dans le même namespace.
Le `endpointSelector` de `security/network-policy.allow-external-dns-to-kubernetes-api.yaml` doit cibler les deux, avec
`app.kubernetes.io/name: external-dns` seul (pas un label `app.kubernetes.io/instance` par instance), et sa règle
d'egress doit viser l'entité Cilium réservée `kube-apiserver`, pas `toEndpoints` sur les labels du Pod de l'apiserver ni
`toEntities: host`. `kube-apiserver` tourne en `hostNetwork: true` sur un nœud de plan de contrôle, différent des
workers où tourne external-dns : Cilium résout ce trafic avec l'identité `remote-node`, pas `host`, donc une règle
`toEntities: host` ne correspond jamais. Même schéma que
`catalog/kubernetes/cloudnative-pg/kustomize/cnpg.cluster-policy.allow-to-kubernetes-api.yaml`.

### Étape 3 — Passer Pulumi en mode recovery

> [!IMPORTANT]\
> `recovery` doit valoir `true` ici, et non sa valeur normale (non définie ou `false`). `stack/vault.ts` place chaque
> ressource côté Vault derrière `if (!config.getBoolean("recovery"))` : sans cela, ce `pulumi up` tenterait aussi de
> réconcilier ces ressources avec un OpenBao qui n'existe pas encore sur le nouveau cluster, et échouerait avant même la
> restauration d'OpenBao.

Lancer le `pulumi up` de `chezmoi.sh` **avant** celui de `rhodes.akn`, au moins une fois. `stack/proxmox.ts` de
`rhodes.akn` authentifie son provider Proxmox avec l'identifiant `rhodes-akn-bootstrap@pve`, que la stack de
`chezmoi.sh` (`stack/proxmox/access/rhodes-akn-bootstrap.ts`) livre dans ce cluster sous la forme d'un `Secret`
Kubernetes direct (`kube-system/rhodes-akn-bootstrap-pve`), volontairement pas par un `StackReference` Pulumi : une
lecture inter-projets d'une sortie secrète exige la passphrase de la stack _exportatrice_, que ce dépôt ne partage pas
entre projets (voir les commentaires de ce fichier). Si ce `Secret` n'existe pas, le `pulumi up` de `rhodes.akn` échoue
dès qu'il tente de le lire.

Le `pulumi up` de `rhodes.akn` écrit aussi `cnpg-backup-credentials` dans trois namespaces (`vault`, `pocket-id` et
`o11y-system`) et ne crée pas ces namespaces : il faut les créer avant.

```sh
cd projects/chezmoi.sh/src/infrastructure/pulumi
pulumi up --refresh --parallel 15

kubectl --context <CLUSTER_CONTEXT> create namespace vault --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -
kubectl --context <CLUSTER_CONTEXT> create namespace pocket-id --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -
kubectl --context <CLUSTER_CONTEXT> create namespace o11y-system --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -

cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi config set recovery true
pulumi up --refresh --parallel 15
```

Ce `pulumi up` crée `cnpg-backup-credentials` dans les namespaces `vault`, `pocket-id` et `o11y-system`
(`stack/cloudnative-pg.ts`, une écriture directe par le provider Kubernetes, non conditionnée par `recovery`) : les
identifiants S3 dont les restaurations CNPG des étapes 5 et 6 ont besoin pour que l'opérateur CNPG déployé à l'étape 2
ait de quoi restaurer. À faire une seule fois, ici ; les guides de composants ne le répètent plus. Le même `pulumi up`
écrit aussi le jeton Cloudflare DNS-01 de cert-manager en `Secret` Kubernetes direct dans `cert-manager-system`
(`stack/cert-manager.ts`, non conditionné par `recovery`) : cert-manager est donc fonctionnel dès l'étape 2, sans
attendre l'étape 7.

Ce même `pulumi up` crée aussi l'identité Proxmox `kubernetes-cloud-provider@pve` et livre le `Secret`
`proxmox-cloud-provider` (namespace `proxmox-system`) dont les Pods du CCM et du CSI (déployés à l'étape 2) ont besoin
pour démarrer : c'est la résolution directe des Pods bloqués par le taint, signalés dans la seconde famille d'erreurs de
l'étape 2. Laisser une minute au Pod du CCM pour prendre le `Secret` en compte et retirer le taint des 3 nœuds avant de
passer à l'étape 4.

### Étape 4 — Valider que le cluster est opérationnel

Confirmer CNI, CSI et CCM avant de restaurer un cluster CNPG par-dessus :

```sh
cilium status --wait
```

Parcourir ensuite la
[liste de validation](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#liste-de-validation) de
la procédure OMNI-20260721-00 (critères V-001 à V-010). Il n'existe pas encore de script prêt à l'emploi dédié :
`docs/experiments/20260617-proxmox-csi-ccm/scripts/validate.sh` couvre les mêmes critères mais utilise en dur les noms
de `StorageClass` et de `StatefulSet` de cette expérience, pas ceux de `rhodes.akn` ; le prendre comme référence de ce
qu'il faut contrôler à la main, pas comme un outil à lancer tel quel.

Confirmer aussi qu'ESO et l'opérateur CNPG sont démarrés, car les étapes 5 et 6 dépendent des deux :

```sh
kubectl --context <CLUSTER_CONTEXT> get pods -n external-secrets-system
kubectl --context <CLUSTER_CONTEXT> get pods -n cloudnative-pg-system
# → les deux en Running (le ClusterSecretStore vault.chezmoi.sh reste lui-même en échec jusqu'à l'étape 5 : attendu)
# → external-dns-unifi peut aussi passer en CrashLoopBackOff/CreateContainerConfigError ici : son
#   ExternalSecret (external-dns-unifi-secret, issu de vault.chezmoi.sh) ne peut pas se synchroniser avant
#   la restauration d'OpenBao à l'étape 5, même cause que le ClusterSecretStore, également attendu.
#   external-dns-bind n'est pas touché : son identifiant vient de l'application sops/ ci-dessus, pas de Vault.
```

### Étape 5 — Restaurer OpenBao

Suivre [Restaurer OpenBao](Restaurer-OpenBao.md) en entier. Ce guide restaure le cluster CNPG `openbao-database` depuis
sa sauvegarde S3 Garage et rétablit l'accès administrateur à l'instance déjà configurée. Revenir ici une fois ses
propres vérifications rapides passées.

### Étape 6 — Restaurer Pocket-Id

Suivre [Restaurer Pocket-Id](Restaurer-Pocket-Id.md) en entier. Ce guide restaure la base CNPG de Pocket-Id et le secret
de l'application, indépendamment d'OpenBao et de Vault. La connexion HTTPS/passkey n'est pas encore vérifiable à ce
stade, car le certificat de la Gateway n'est valide qu'après l'étape 7 : l'étape 4 de ce guide décrit la solution de
repli par port-forward. L'aller-retour OIDC vers OpenBao est validé plus tard, à l'étape 8.

### Entre les étapes 6 et 9 — valider en HTTPS réel via `/etc/hosts` (optionnel)

Une fois OpenBao (étape 5) et Pocket-Id (étape 6) démarrés, les `HTTPRoute` et `Certificate` de leurs applications
existent déjà (étape 3 de [Restaurer Pocket-Id](Restaurer-Pocket-Id.md) et son équivalent dans
[Restaurer OpenBao](Restaurer-OpenBao.md)) et sont valides, que le poste de l'opérateur ait ou non pris en compte les
nouveaux enregistrements DNS. Ajouter des entrées temporaires sur le poste de l'opérateur pour valider contre les vrais
noms d'hôte, sur un vrai certificat TLS déjà valide, au lieu de s'en remettre aux seules solutions de repli par
port-forward :

```text
<IP de la Gateway externe de rhodes>  vault.chezmoi.sh
<IP de la Gateway externe de rhodes>  auth.chezmoi.sh
```

L'IP provient du pool LoadBalancer Cilium `external` de rhodes, `10.0.0.64/29` (voir l'[IPAM](../../network/ipam.md)).

Cela compte surtout pour Pocket-Id : la connexion passkey/WebAuthn exige un contexte sécurisé (HTTPS et nom d'hôte
correct) et ne fonctionne pas sur un simple port-forward (voir l'encart `[!IMPORTANT]` de
[Restaurer Pocket-Id](Restaurer-Pocket-Id.md)). Le contournement par fichier hosts permet de valider de bout en bout la
connexion passkey (étape 6) et l'aller-retour SSO Pocket-Id vers OpenBao (étape 8) sans attendre la propagation ni le
cache des résolveurs DNS.

Retirer ces entrées dès que la résolution DNS normale vers `rhodes.akn` est confirmée correcte, sans les laisser en
place indéfiniment.

### Étape 7 — Repasser le drapeau `recovery` de Pulumi à `false`

Qu'OpenBao soit joignable et descellé (étape 5) est le signal pour sortir Pulumi du mode recovery. Ce `pulumi up` parle
directement à Vault (création du backend d'authentification d'ESO, du montage KV, du rôle, et du backend
d'authentification SSO de Pocket-Id) : son provider Vault doit donc s'authentifier. Exporter le même token root que
celui de l'étape 5 :

```sh
export VAULT_ADDR=http://localhost:8200   # ou https://vault.chezmoi.sh si la Gateway et le certificat sont déjà en place
export VAULT_TOKEN="<token root issu du gestionnaire de secrets>"

cd projects/rhodes.akn/src/infrastructure/pulumi
pulumi config set recovery false
pulumi up --refresh --parallel 15
```

C'est cette étape qui crée réellement le backend d'authentification Vault d'ESO, le montage KV et le rôle, ainsi que le
backend d'authentification SSO de Pocket-Id et ses politiques. L'`ExternalSecret` OIDC d'ArgoCD (étape 9) dépend de sa
réussite.

### Étape 8 — Valider que tout est en ordre

Parcourir la liste des [vérifications rapides](#vérifications-rapides) pour les étapes 1 à 7. L'étape 7 passée,
confirmer aussi ce qui ne pouvait pas l'être plus tôt : **le SSO de Pocket-Id vers OpenBao**. Se connecter à
`https://vault.chezmoi.sh/ui` par OIDC Pocket-Id avec un utilisateur du groupe `admin` (utiliser le contournement
`/etc/hosts` ci-dessus si le DNS local n'a pas suivi). Cela confirme de bout en bout l'aller-retour OIDC de Pocket-Id
vers Vault, maintenant que les deux fonctionnent : l'accès administrateur courant n'a plus besoin du token root passé ce
point.

### Étape 9 — Amorcer ArgoCD et valider

Le namespace `argocd` n'est livré par aucun fichier de `dist/argocd/` (l'`Application` `argocd` s'appuie sur
`CreateNamespace=true`) : le créer avant l'application.

```sh
kubectl --context <CLUSTER_CONTEXT> create namespace argocd --dry-run=client -o yaml | kubectl --context <CLUSTER_CONTEXT> apply --server-side -f -
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/dist/argocd/
kustomize build --enable-alpha-plugins --enable-exec projects/rhodes.akn/src/argocd/sops \
  | kubectl --context <CLUSTER_CONTEXT> apply -f -
kubectl --context <CLUSTER_CONTEXT> apply -f projects/rhodes.akn/src/bootstrap.applications.yaml
```

ArgoCD s'auto-héberge sur `rhodes.akn` (modèle hub, voir la
[topologie GitOps hub et spoke](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md#topologie-gitops-hub-et-spoke))
et s'amorce en dernier, volontairement : il **adopte** chaque ressource déjà appliquée à la main aux étapes 2 à 8 au
lieu d'en être une dépendance, et son propre `ExternalSecret` OIDC a besoin que l'étape 7 soit faite.

Une fois l'`Application` `seed` en `Synced`/`Healthy`, les ApplicationSets `applications` et `system` d'ArgoCD prennent
le relais : `applications` découvre chaque dossier de `dist/apps/*`, `system` chaque dossier de
`src/infrastructure/kubernetes/*` (voir `projects/rhodes.akn/src/argocd/shoot.apps/`), y compris tout ce qui vient
d'être appliqué à la main, et les réconcilient par GitOps à partir de là. Aucun `kubectl apply` manuel supplémentaire ne
devrait être nécessaire.

## Vérifications rapides

| Vérification                        | Commande ou critère                                                                                                                                                                  | Étape                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| CNI, CSI, CCM                       | `cilium status --wait` et la liste de validation de la procédure OMNI-20260721-00 passent                                                                                            | 1 et 2, contrôlées à l'étape 4 |
| ESO et opérateur CNPG démarrés      | `kubectl get pods -n external-secrets-system` et `-n cloudnative-pg-system` montrent `Running` (le `ClusterSecretStore vault.chezmoi.sh` reste en échec jusqu'à l'étape 5 : attendu) | 2, contrôlées à l'étape 4      |
| Pulumi en mode recovery             | `pulumi config get recovery` renvoie `true` ; `cnpg-backup-credentials` existe dans les namespaces `vault`, `pocket-id` et `o11y-system`                                             | 3                              |
| OpenBao                             | vérifications rapides de [Restaurer OpenBao](Restaurer-OpenBao.md)                                                                                                                   | 5                              |
| Pocket-Id                           | vérifications rapides de [Restaurer Pocket-Id](Restaurer-Pocket-Id.md)                                                                                                               | 6                              |
| ESO entièrement synchronisé         | `kubectl get externalsecret -A` montre `SecretSynced`, pas `SecretSyncedError`                                                                                                       | 7                              |
| cert-manager, external-dns, Gateway | Un `Certificate` est émis ; les enregistrements DNS internes sont publiés par external-dns (UniFi et BIND)                                                                           | 2, fonctionnels immédiatement  |
| `external-dns/sops` appliqué        | `kubectl --context <CLUSTER_CONTEXT> get secret external-dns-bind-secret -n external-dns-system` existe                                                                              | 2                              |
| ArgoCD                              | L'`Application` `seed` et chaque `Application` adoptée sont en `Synced`/`Healthy`                                                                                                    | 9                              |

## Historique

- _2026-10-11_ : Migration vers le standard de documentation (#1257), traduction en français et vérification contre le
  dépôt. Corrections : (1) l'étape 3 écrit `cnpg-backup-credentials` dans trois namespaces, `vault`, `pocket-id` et
  `o11y-system` (boucle de `stack/cloudnative-pg.ts`), pas deux, et `o11y-system` n'est créé par aucun fichier de
  `dist/` : sa création est ajoutée à l'étape 3, sinon le `pulumi up` échoue faute de namespace. (2) L'étape 9 n'avait
  pas de création du namespace `argocd`, absent des fichiers de `dist/argocd/` (aucun `Namespace`) : elle est ajoutée.
  (3) Les prérequis disaient que cert-manager attend le jeton Cloudflare d'ESO une fois l'étape 7 faite ;
  `stack/cert-manager.ts` l'écrit directement en `Secret` dans `cert-manager-system` à l'étape 3 (cohérent avec l'entrée
  du 2026-07-26). (4) Les vérifications rapides annonçaient des enregistrements DNS dans Cloudflare ; le dépôt ne gère
  aucun enregistrement DNS public (external-dns publie en interne via UniFi et BIND, Cloudflare ne sert qu'au DNS-01
  d'ACME). (5) L'étape 9 disait que `system` découvre `dist/infrastructure/kubernetes/*` ; l'ApplicationSet `system`
  découvre `src/infrastructure/kubernetes/*` (`applications` découvre bien `dist/apps/*`). (6) Le bundle de CRD de la
  Gateway API de `cilium/kustomization.yaml` est en `v1.6.1` (l'entrée du 2026-07-27 citait `v1.5.1`, valeur d'alors ;
  ce guide ne cite plus la version). (7) L'étape 1 demandait de suivre OMNI-20260721-00 « jusqu'à sa liste de validation
  CNI/CSI/CCM » alors que le CSI et le CCM sont déployés aux étapes 2 et 3 de ce guide : l'étape 1 s'arrête à l'étape 8
  de la procédure, et la liste de validation est passée à l'étape 4. (8) Le lien vers la documentation réseau pointe
  vers `docs/network/ipam.md`, qui existe ; le pool `external` de rhodes (`10.0.0.64/29`) y est confirmé. Les chemins
  `projects/rhodes.akn/dist/...`, `src/...` et `.mise.toml` du dossier `disaster-recovery/` ont été contrôlés ; les
  commandes n'ont pas été rejouées.
- _2026-07-30_ : Le composant `ingress-gateway/` est replié dans `cilium/` : la Gateway API de Cilium n'a pas de Pod
  dédié par Gateway, donc les objets `Gateway`, `HTTPRoute` et `Certificate` gardés dans leur propre namespace
  `ingress-gateway-system` avaient de toute façon leur plan de données Envoy dans le namespace `kube-system` de `cilium`
  ; le namespace séparé n'isolait que les objets du plan de contrôle, pas le chemin du trafic. L'application de
  `ingress-gateway/` et la création de son namespace disparaissent de l'étape 2 ; `cilium/` est maintenant appliqué deux
  fois (le CNI d'abord, puis à nouveau en fin d'étape 2 une fois la CRD et le webhook de cert-manager disponibles pour
  le `Certificate` wildcard). Les trois `CiliumNetworkPolicy` de `ingress-gateway/` sont retirées comme redondantes,
  leurs Pods vivant dans `kube-system`, déjà couvert par `cilium/security/network-policy.allow-kube-system-full.yaml`.
- _2026-07-30_ : Correction du `endpointSelector` de `allow-external-dns-to-kubernetes-api`, qui ne ciblait que
  `external-dns-unifi` et laissait `external-dns-bind` sans chemin d'egress vers l'apiserver sous la politique de refus
  par défaut du namespace (constaté en direct par un CrashLoopBackOff de `external-dns-bind` :
  `failed to determine if *v1alpha1.DNSEndpoint is namespaced`). Le sélecteur cible maintenant les deux instances ; la
  règle d'egress passe de `toEndpoints`/`toEntities: host` à l'entité réservée `kube-apiserver`, car l'apiserver tourne
  en `hostNetwork` sur un autre nœud que external-dns, ce que Cilium résout en `remote-node` et non en `host`. L'encart
  de l'étape 4 attribue le CrashLoop lié à Vault à `external-dns-unifi` seul, pas aux deux releases. L'étape de
  validation HTTPS réelle via `/etc/hosts` quitte le document de migration `amiya.akn->rhodes.akn` pour devenir une
  section ici (Entre les étapes 6 et 9) : elle n'est pas propre à la migration, seulement optionnelle dans une vraie
  reprise puisque le DNS de production vise déjà ce même cluster.
- _2026-07-29_ : Ajout à l'étape 2 de l'application `external-dns/sops` manquante : `dist:render` n'écrit jamais dans
  `dist/` les secrets issus de ksops, donc celui-ci demandait le même traitement explicite kustomize + ksops que les
  dossiers `sops/` de `openbao.md` et `pocket-id.md`.
- _2026-07-29_ : Suppression complète du token d'administration d'urgence d'OpenBao géré par Pulumi : le token root et
  ses parts de clé de reprise Shamir sont conservés dans le gestionnaire de secrets personnel de l'opérateur, ce qui le
  rend inutile. L'étape 5 n'a plus de séparation option A/B ni de dépendance à la disponibilité de Pocket-Id ; l'étape 7
  demande d'exporter le même token root pour que son `pulumi up` authentifie son provider Vault. Raisonnement complet
  dans l'historique de [Restaurer OpenBao](Restaurer-OpenBao.md).
- _2026-07-28_ : Second exercice complet, étapes 1 à 4. Correction de la création des namespaces de l'étape 2, qui
  utilisait `kubectl annotate` au lieu de `kubectl label` : Pod Security Admission lit les labels du namespace, pas ses
  annotations, donc la dérogation PSA de `proxmox-system` ne faisait rien et bloquait tout le DaemonSet
  `proxmox-csi-plugin-node` (0/3 Pods). Ajout d'un encart sur le `--force-conflicts` nécessaire à l'application de
  `cilium` (conflit de propriété SSA entre le manifeste appliqué par Talos à l'amorçage et celui rendu dans `dist/`).
  `-n cnpg-system` est corrigé en `-n cloudnative-pg-system` à l'étape 4 et dans les vérifications rapides, et il est
  noté que les Pods external-dns se bloquent aussi sur l'étape 5 (leurs `ExternalSecret` ne peuvent pas se synchroniser
  avant la restauration d'OpenBao).
- _2026-07-27_ (étape 3) : Ajout de l'obligation de lancer le `pulumi up` de `chezmoi.sh` avant celui de `rhodes.akn`,
  nouvelle dépendance forte introduite par la correction du même exercice qui fait passer l'identifiant
  `rhodes-akn-bootstrap@pve` d'un `StackReference` Pulumi à un `Secret` Kubernetes direct (voir
  `stack/proxmox/access/rhodes-akn-bootstrap.ts`). Note aussi que le `pulumi up` de cette étape résout les Pods CCM/CSI
  bloqués par le taint signalés à l'étape 2.
- _2026-07-27_ : Premier exercice réel de l'étape 2 sur un cluster `rhodes.akn` en production. Chaque `kubectl apply` de
  l'étape passe en `--server-side` (l'application côté client rejette la CRD `httproutes` de la Gateway API à cause de
  la taille de l'annotation). Ajout de la sous-étape de création des namespaces (`proxmox-system`,
  `cert-manager-system`, `cloudnative-pg-system`, `external-secrets-system`, `external-dns-system`,
  `ingress-gateway-system` : aucune de ces applications ne livre son propre objet `Namespace`). Ajout de l'encart sur
  les deux erreurs : le nouvel essai du cache de découverte, sans gravité, et la chaîne de dépendance identifiants du
  CCM / webhook qui bloque six ressources précises jusqu'à l'étape 3. Correction d'un manque réel trouvé pendant ce même
  exercice : `rhodes.akn` n'avait aucune source pour les CRD de base de la Gateway API en amont
  (`cilium/kustomization.yaml` tire désormais le bundle du canal expérimental épinglé), suivi dans la source de
  l'application `cilium`, pas dans ce document.
- _2026-07-26_ (suite de revue) : `stack/cert-manager.ts` écrit le jeton Cloudflare en `Secret` Kubernetes direct au
  lieu de passer par Vault : cert-manager est fonctionnel dès la fin de l'étape 2, sans dépendre de l'étape 7. Les
  tâches `mise` redondantes `dr:*:secrets` et `dr:pulumi:recovery-mode` sont retirées et les introductions allégées.
- _2026-07-26_ : Correction de `recovery` jamais passé à `true` avant le premier `pulumi up` de la chaîne (le mode
  non-recovery par défaut aurait échoué face à un OpenBao pas encore restauré) : ajout d'une étape explicite de mode
  recovery et d'une étape de validation du cluster. cert-manager et ExternalDNS rejoignent le premier passage de
  `kubectl apply` ; la restauration de Pocket-Id passe avant la bascule de `recovery` à `false`. Ajout à l'étape 2 de
  l'opérateur CNPG, de la configuration restante de Cilium et de la Gateway interne (aucun n'était appliqué nulle part),
  et correction des chemins `proxmox-*` erronés. La section initiale « Ordre de reprise et pourquoi » est remplacée par
  des encarts par étape.
- _2026-07-25_ : L'amorçage d'ESO passe avant la restauration d'OpenBao, car son `Generator` lit désormais les mots de
  passe de rôle CNPG des deux applications : ses CRD et son contrôleur doivent exister d'abord. L'ancienne étape « ESO +
  bascule de `recovery` » est scindée en deux.
- _2026-07-24_ : Création initiale : la chaîne de reprise du cluster est extraite du `README.md` du projet dans son
  propre document, qui relie `openbao.md` et `pocket-id.md` aux étapes de niveau cluster.

## Pour aller plus loin

- [Plan de reprise après sinistre](Plan-de-Reprise-apres-Sinistre.md) : le plan global dont ce guide traite le cluster
  `rhodes.akn`.
- [Restaurer OpenBao](Restaurer-OpenBao.md) : l'étape 5, restauration d'OpenBao et reprise d'accès administrateur.
- [Restaurer Pocket-Id](Restaurer-Pocket-Id.md) : l'étape 6, restauration de Pocket-Id.
- [Créer un cluster Talos avec Omni](../../procedures/omni/OMNI-20260721-00-Creer-un-Cluster-Talos-avec-Omni.md) : le
  provisionnement du cluster et la liste de validation CNI/CSI/CCM.
- [Restaurer CNPG depuis le stockage objet](../../procedures/databases/DB-20260723-00-Restaurer-CNPG-depuis-le-Stockage-Objet.md)
  : la restauration d'un cluster CNPG depuis la sauvegarde S3.
