# Expérimentation 2025-03-12 ArgoCD Zero Trust Avec Tailscale

Cette expérience vérifie qu'un cluster de management qui héberge [ArgoCD](https://argo-cd.readthedocs.io/en/stable/)
peut piloter un cluster d'applications dans un environnement Zero Trust bâti sur [Tailscale](https://tailscale.com/).
Les deux clusters sont des clusters `k3d` locaux joignables uniquement par Tailscale, et les droits Kubernetes dérivent
des groupes Tailscale. L'objectif est atteint ; le dépôt applique aujourd'hui le même principe (voir
[Conclusion](#conclusion)).

## Question

Est-il possible de réaliser, avec Tailscale seul comme couche d'accès, les points suivants :

- chaque cluster Kubernetes est joignable via Tailscale ;
- les utilisateurs du groupe `kubernetes:admins` ont un accès complet aux API Kubernetes de tous les clusters, en
  usurpant le groupe `system:masters` ;
- les utilisateurs du groupe `kubernetes:read-only` accèdent à l'API du cluster d'applications, en usurpant le groupe
  `system:view` ;
- ArgoCD, installé sur le cluster de management et joignable via Tailscale, déploie des applications sur le cluster
  d'applications au moyen d'`ApplicationSets`.

## Montage

Le code de l'expérience reste dans [`tailscale-argocd-zero-trust/`](tailscale-argocd-zero-trust/README.md) :
environnement `devenv` (`devenv.nix`, `devenv.yaml`),
[`.devcontainer.json`](tailscale-argocd-zero-trust/.devcontainer.json) et manifestes numérotés dans
[`manifests/`](tailscale-argocd-zero-trust/manifests/00.k3d-management.yaml).

Prérequis :

- un compte Tailscale avec accès administrateur et **HTTPS activé** pour l'accès sécurisé aux API ;
- [devenv](https://devenv.sh/) (ou le devcontainer fourni) pour disposer des outils ;
- une connaissance de base de Kubernetes, Helm et de la ligne de commande.

Les blocs de commandes du README d'origine sont exécutables avec `runme`.

### Préparer les ACL Tailscale

Les groupes et les tags suivants sont ajoutés à la configuration d'ACL de la
[console d'administration](https://login.tailscale.com/admin/settings/acls) :

```json
"groups": {
    "group:kubernetes:admins": [...],
    "group:kubernetes:read-only": [...],
},
"tagOwners": {
    "tag:kubernetes-argocd":   [],
    "tag:kubernetes-operator": [],
    "tag:kubernetes-seed":     [],
    "tag:kubernetes-apps":     ["tag:kubernetes-seed", "tag:kubernetes-operator"],
},
```

Deux clients OAuth sont créés dans la page [OAuth clients](https://login.tailscale.com/admin/settings/oauth), avec les
scopes d'écriture `Devices Core` et `Auth Keys` :

| Client OAuth | Tag                       | Usage                                                         |
| ------------ | ------------------------- | ------------------------------------------------------------- |
| Management   | `tag:kubernetes-seed`     | Authentifie l'opérateur Tailscale du cluster `k3d-management` |
| Applications | `tag:kubernetes-operator` | Authentifie l'opérateur Tailscale du cluster `k3d-apps`       |

Un client par cluster permet de révoquer l'accès à l'un sans toucher à l'autre.

### Créer les clusters et installer l'opérateur Tailscale

Les deux clusters sont créés avec `k3d` à partir de
[`00.k3d-management.yaml`](tailscale-argocd-zero-trust/manifests/00.k3d-management.yaml) et
[`00.k3d-apps.yaml`](tailscale-argocd-zero-trust/manifests/00.k3d-apps.yaml) :

```sh
k3d cluster create management --config manifests/00.k3d-management.yaml
k3d cluster create apps --config manifests/00.k3d-apps.yaml
```

L'opérateur Tailscale est ensuite installé par Helm sur chaque cluster, avec le client OAuth correspondant (ici le
cluster de management ; le cluster d'applications utilise `tag:kubernetes-operator` et le hostname `k3d-apps`) :

```sh
helm repo add tailscale https://pkgs.tailscale.com/helmcharts

helm upgrade \
  --kube-context "k3d-management" \
  --install \
  tailscale-operator \
  tailscale/tailscale-operator \
  --namespace=tailscale \
  --create-namespace \
  --set oauth.clientId="$TS_MANAGEMENT_OAUTH_CLIENT_ID" \
  --set oauth.clientSecret="$TS_MANAGEMENT_OAUTH_CLIENT_SECRET" \
  --set operatorConfig.defaultTags[0]="tag:kubernetes-seed" \
  --set-string apiServerProxyConfig.mode="true" \
  --set operatorConfig.hostname="k3d-management" \
  --set proxyConfig.defaultTags="tag:kubernetes-apps"
```

Les deux clusters apparaissent ensuite dans la [console Tailscale](https://login.tailscale.com/admin/devices) avec leurs
tags.

### Contrôler l'accès aux API Kubernetes

Les ACL limitent l'accès réseau aux API (port 443) : `kubernetes:admins` atteint les deux clusters,
`kubernetes:read-only` seulement le cluster d'applications.

```json
"acls": [
    {
        "action": "accept",
        "src": ["group:kubernetes:admins"],
        "dst": ["tag:kubernetes-seed:443"]
    },
    {
        "action": "accept",
        "src": ["group:kubernetes:admins", "group:kubernetes:read-only"],
        "dst": ["tag:kubernetes-operator:443"]
    }
]
```

Les `grant` associent chaque groupe Tailscale à un groupe Kubernetes usurpé (`impersonate`) :

```json
"grant": [
    {
        "src": ["group:kubernetes:admins"],
        "dst": ["tag:kubernetes-operator", "tag:kubernetes-seed"],
        "app": {
            "tailscale.com/cap/kubernetes": [{
                "impersonate": { "groups": ["system:masters"] }
            }]
        }
    },
    {
        "src": ["group:kubernetes:read-only"],
        "dst": ["tag:kubernetes-operator"],
        "app": {
            "tailscale.com/cap/kubernetes": [{
                "impersonate": { "groups": ["system:view"] }
            }]
        }
    }
]
```

> [!NOTE]\
> `system:masters` existe d'office, mais `system:view` doit être créé sur le cluster d'applications :
> `kubectl --context k3d-apps create clusterrolebinding tailscale:system:view --clusterrole=view --group=system:view`.

Les kubeconfig sont ensuite générés par Tailscale :

```sh
tailscale configure kubeconfig k3d-management
tailscale configure kubeconfig k3d-apps
```

### Installer ArgoCD avec un sidecar Tailscale

Un troisième client OAuth est créé avec le seul scope d'écriture `Auth Keys` et le tag `tag:kubernetes-argocd`. Une clé
d'authentification générée avec ce client est stockée dans un `Secret` :

```sh
kubectl --context k3d-management --namespace argocd-system create secret generic tailscale-argocd-authkey \
    --from-literal=TS_AUTHKEY="$TS_ARGOCD_AUTH_KEY"
```

Un `grant` supplémentaire autorise ArgoCD à usurper `system:masters` sur le cluster d'applications.

> [!WARNING]\
> Ce droit complet sert à simplifier l'expérience. En production, les permissions doivent suivre le principe du moindre
> privilège.

```json
{
  "src": ["tag:kubernetes-argocd"],
  "dst": ["tag:kubernetes-operator"],
  "app": {
    "tailscale.com/cap/kubernetes": [
      {
        "impersonate": { "groups": ["system:masters"] }
      }
    ]
  }
}
```

ArgoCD est déployé avec un sidecar Tailscale, qui établit la connectivité vers les clusters distants. Le chart Helm
officiel ne gère pas l'Ingress Tailscale (paramètre `defaultBackend`) : la ressource Ingress est donc appliquée
séparément, après le chart ([`60.ts-sidecar-rbac.yaml`](tailscale-argocd-zero-trust/manifests/60.ts-sidecar-rbac.yaml),
[`60.argocd-values.yaml`](tailscale-argocd-zero-trust/manifests/60.argocd-values.yaml),
[`60.argocd-ingress.yaml`](tailscale-argocd-zero-trust/manifests/60.argocd-ingress.yaml)).

```sh
kubectl --context k3d-management apply -f manifests/60.ts-sidecar-rbac.yaml

helm repo add argo https://argoproj.github.io/argo-helm
helm upgrade \
  --kube-context "k3d-management" \
  --install \
  argocd \
  argo/argo-cd \
  --namespace argocd-system \
  --create-namespace \
  --values manifests/60.argocd-values.yaml

kubectl --context k3d-management apply -f manifests/60.argocd-ingress.yaml
```

### Déclarer le cluster d'applications dans ArgoCD

Le cluster d'applications est déclaré par un `Secret` portant le label `argocd.argoproj.io/secret-type: cluster`, avec
l'adresse Tailscale du cluster comme `server` :

```sh
argocd login argocd.$TS_NETWORK_NAME \
    --username admin \
    --password "$(kubectl --context k3d-management -n argocd-system get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)"

cat <<EOF | kubectl --context k3d-management --namespace argocd-system apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: k3d-apps
  labels:
    argocd.argoproj.io/secret-type: cluster
stringData:
  name: k3d-apps
  server: "https://k3d-apps.$TS_NETWORK_NAME"
type: Opaque
EOF
```

`argocd cluster add` est volontairement évité : la commande crée des comptes de service et des rôles dans le cluster
cible, alors que le `Secret` suffit ici.

Le résultat se contrôle avec `argocd cluster list`. Un `ApplicationSet` de démonstration,
[`80.applicationset-demo.yaml`](tailscale-argocd-zero-trust/manifests/80.applicationset-demo.yaml), déploie
l'application [`guestbook`](https://github.com/argoproj/argocd-example-apps/tree/master/guestbook) sur tous les clusters
distants :

```sh
kubectl --context k3d-management apply -f manifests/80.applicationset-demo.yaml
```

## Résultats

Tous les objectifs de départ ont été atteints :

| Objectif                                                                            | Résultat |
| ----------------------------------------------------------------------------------- | -------- |
| Chaque cluster accessible via Tailscale                                             | Atteint  |
| `kubernetes:admins` : accès complet aux API de tous les clusters (`system:masters`) | Atteint  |
| `kubernetes:read-only` : accès à l'API du cluster d'applications (`system:view`)    | Atteint  |
| ArgoCD installé sur le cluster de management et joignable via Tailscale             | Atteint  |
| Déploiement d'applications sur le cluster d'applications via des `ApplicationSets`  | Atteint  |

### Sidecar ou service Egress

Le service Egress de Tailscale a été évalué pour la connectivité d'ArgoCD, puis écarté au profit du sidecar.

| Critère            | Service Egress                                                                                           | Sidecar                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Mise en place      | Gérée par l'opérateur                                                                                    | Clé d'authentification et RBAC du sidecar à gérer (un seul sidecar pour tous les clusters) |
| Contrôle d'accès   | Aucun contrôle fin : tous les Pods du cluster de management ont le même accès, via la même IP Tailscale  | Seul ArgoCD accède aux clusters distants                                                   |
| DNS                | Modification de CoreDNS avec les IP de service Kubernetes (nameserver Tailscale hébergé dans le cluster) | Aucune modification de CoreDNS                                                             |
| Ressources         | Un Pod et un appareil Tailscale par cluster cible                                                        | Un seul sidecar et un seul appareil Tailscale pour tous les clusters                       |
| Ajout d'un cluster | Un service à créer et à maintenir par cluster                                                            | Aucune ressource supplémentaire                                                            |
| Authentification   | Gérée par l'opérateur                                                                                    | Clé gérée par le client OAuth Tailscale (clés éphémères)                                   |

Le sidecar respecte mieux le Zero Trust : seul le contrôleur d'applications d'ArgoCD, qui en a besoin, accède aux
clusters distants, au lieu d'exposer l'accès à l'ensemble du cluster de management.

## Conclusion

Expérience concluante : le modèle est adopté. Le dépôt applique aujourd'hui les mêmes principes, avec des écarts de mise
en œuvre.

- Tailscale est obligatoire pour toute connectivité entre clusters hors homelab (voir `AGENTS.md`, section « Network and
  security »).
- ArgoCD est le moteur GitOps de chaque cluster Kubernetes. Sur `rhodes.akn`, l'instance ArgoCD pilote les clusters
  distants joints par Tailscale : ses `ApplicationSets`
  ([`system.applicationset.yaml`](../../projects/rhodes.akn/src/argocd/shoot.apps/system.applicationset.yaml)) lisent
  l'annotation `device.tailscale.com/hostname` pour trouver le chemin
  `projects/<hostname>/src/infrastructure/kubernetes/*` de chaque cluster, et le réglage de
  [`helmvalues/default.yaml`](../../projects/rhodes.akn/src/argocd/helmvalues/default.yaml) traite les clusters servis
  par Tailscale (timeouts TLS).
- Le dépôt Helm Tailscale (`https://pkgs.tailscale.com/helmcharts`) est autorisé dans
  [`appprojects.yaml`](../../projects/rhodes.akn/src/argocd/appprojects.yaml) pour tous les clusters ; `lungmen.akn`
  embarque l'opérateur dans `projects/lungmen.akn/src/infrastructure/kubernetes/tailscale/`, avec un secret OAuth fourni
  par External Secrets (`operator-oauth.externalsecret.yaml`).

> [!NOTE]\
> Constat du 2026-10-11 : le montage de cette expérience (sidecar ArgoCD, `ApplicationSet` de démonstration, clusters
> `k3d`) n'est pas repris tel quel par le dépôt. Les clusters réels sont des clusters Talos, et les secrets OAuth
> passent par OpenBao et External Secrets au lieu d'une saisie en ligne de commande. Preuve :
> `ls projects/lungmen.akn/src/infrastructure/kubernetes/tailscale` (`operator-oauth.externalsecret.yaml`,
> `restricted.proxyclass.yaml`, `tailscale.helmvalues`) ;
> `grep -rn -i "sidecar\|TS_AUTHKEY" projects/rhodes.akn/src/argocd` ne renvoie rien (aucun sidecar Tailscale dans
> l'ArgoCD de `rhodes.akn`).

## Pour aller plus loin

- [ADR-011 Pré-rendre les manifestes Kubernetes dans Git](../decisions/ADR-011-Pre-rendre-les-Manifestes-Kubernetes-dans-Git.md)
  : le motif de rendu des manifestes qu'ArgoCD synchronise dans le dépôt.
- [ADR-014 Topologie Réseau](../decisions/ADR-014-Separer-le-Trafic-des-Noeuds-Talos-du-VLAN-Homelab.md) : la topologie
  réseau dans laquelle s'insèrent les clusters.
- [Code de l'expérience](tailscale-argocd-zero-trust/README.md) : environnement, manifestes et prérequis d'exécution.
