# 🚀 Tailscale + ArgoCD for Zero Trust

This guide details how to set up a management Kubernetes cluster (hosting [ArgoCD](https://argo-cd.readthedocs.io/en/stable/)) and an application Kubernetes cluster for deployable applications—all within a Zero Trust environment using [Tailscale](https://tailscale.com/). Each step is explained in depth to help you understand the process clearly. Enjoy the journey!

***

## 🎯 Objectives

The experiment aims to:

* [x] Ensure each Kubernetes cluster is accessible via Tailscale.
* [x] Grant Tailscale users in the `kubernetes:admins` group full access to all Kubernetes APIs.
* [x] Allow Tailscale users in the `kubernetes:read-only` group to access the application cluster’s Kubernetes API.
* [x] Manage Kubernetes permissions using Tailscale groups:
  * [x] Users in `kubernetes:admins` will impersonate the `system:masters` group.
  * [x] Users in `kubernetes:read-only` will impersonate the `system:view` group.
* [x] Install ArgoCD on the management cluster and ensure it’s accessible via Tailscale.
* [x] Enable ArgoCD to deploy applications on the application cluster using `ApplicationSets`.

***

## 🔧 Prerequisites

> \[!NOTE]
> A devcontainer is available to facilitate the execution of the experiment. You can find it in the `.devcontainer` directory.

Before starting, ensure you have:

* **Tailscale Account:** With admin access and **HTTPS enabled** for secure API access.
* **devenv:** Install from [devenv.sh](https://devenv.sh/) to obtain all necessary tools and resources.
* **Basic Knowledge:** Familiarity with Kubernetes, Helm, and command-line operations.

***

## ⚗️ Experimentation

> \[!TIP]
> The experiment will be carried out in several steps. Each step is detailed in the following sections.\
> You can also run `runme` from your terminal to follow these instructions interactively.

Let's kick off the journey by configuring Tailscale! 🚀

### 🔧 Prepare Tailscale OAuth Clients

Before proceeding, you'll need to create OAuth clients in Tailscale. These clients will be used to authenticate the Tailscale operator on your Kubernetes clusters. To get started, navigate to the [Tailscale ACL settings](https://login.tailscale.com/admin/settings/acls) page and add the following groups and tags to your ACL configuration:

```json
"groups": {
    ...
    // Define the groups used to manage the Kubernetes clusters
    "group:kubernetes:admins": [...],
    "group:kubernetes:read-only": [...],
    ...
},
"tagOwners": {
    ...
    // Define the tags used by Tailscale clients to access the Kubernetes clusters
    "tag:kubernetes-argocd":   [],

    // Define the tags used by the Tailscale operator
    "tag:kubernetes-operator": [],
    "tag:kubernetes-seed":     [],
    "tag:kubernetes-apps":     ["tag:kubernetes-seed", "tag:kubernetes-operator"],
    ...
},
```

### 🔐 Configure OAuth Clients for Tailscale Operator Authentication

Begin by navigating to the [OAuth clients](https://login.tailscale.com/admin/settings/oauth) page in the Tailscale admin console. Follow the guidelines in [this article](https://tailscale.com/kb/1215/oauth-clients#setting-up-an-oauth-client) to create your first OAuth client with the following specifications:

* **Scopes:** Enable `Devices Core` and `Auth Keys` write scopes.
* **Tag:** Assign the tag `tag:kubernetes-seed` to secure authentication for the management cluster's Tailscale operator.

Next, replicate the process to create a second OAuth client with the same scopes, but assign it the tag `tag:kubernetes-operator`. This client will be used to authenticate the Tailscale operator on the application cluster.

> \[!TIP]
> Using separate OAuth clients for each cluster provides granular control, making it easier to revoke access for one cluster without impacting the other.

### 🚀 Set Up All Local Kubernetes Clusters

In this step, we will create two Kubernetes clusters using k3d: one for management and one for application deployment. The management cluster will host ArgoCD and control operations, while the application cluster is dedicated to running deployable apps. This separation of concerns ensures a secure and structured Zero Trust GitOps workflow.

Use the following commands to create the clusters:

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Setup Kubernetes clusters"}
k3d cluster create management --config manifests/00.k3d-management.yaml
k3d cluster create apps --config manifests/00.k3d-apps.yaml
```

These commands initialize clusters with predefined configurations tailored to our environment, enabling seamless integration with Tailscale and ArgoCD.

Ensure that your environments are correctly set up before proceeding to the next steps.

### 🚀 Install and Configure the Tailscale Operator

With the kubernetes clusters now set up, the next step is to deploy the Tailscale operator on both your management and application clusters. This operator facilitates secure, Zero Trust access to your Kubernetes APIs by integrating with Tailscale's authentication mechanisms.

Follow these steps to install and configure the operator:

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Install Taiscale helm repository"}
helm repo add tailscale https://pkgs.tailscale.com/helmcharts
```

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Install Tailscale operator on the management cluster"}
read -p "Enter the OAuth client ID for the management cluster: " TS_MANAGEMENT_OAUTH_CLIENT_ID
read -p "Enter the OAuth client secret for the management cluster: " TS_MANAGEMENT_OAUTH_CLIENT_SECRET

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

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Install Tailscale operator on the application cluster"}
read -p "Enter the OAuth client ID for the application cluster: " TS_APPS_OAUTH_CLIENT_ID
read -p "Enter the OAuth client secret for the application cluster: " TS_APPS_OAUTH_CLIENT_SECRET

helm upgrade \
  --kube-context "k3d-apps" \
  --install \
  tailscale-operator \
  tailscale/tailscale-operator \
  --namespace=tailscale \
  --create-namespace \
  --set oauth.clientId="$TS_APPS_OAUTH_CLIENT_ID" \
  --set oauth.clientSecret="$TS_APPS_OAUTH_CLIENT_SECRET" \
  --set operatorConfig.defaultTags[0]="tag:kubernetes-operator" \
  --set-string apiServerProxyConfig.mode="true" \
  --set operatorConfig.hostname="k3d-apps" \
  --set proxyConfig.defaultTags="tag:kubernetes-apps"
```

At this point, both Kubernetes clusters should be visible in the [Tailscale admin console](https://login.tailscale.com/admin/devices) with their correct tags, confirming that your clusters are properly registered and communicating within the Tailscale network.

### 🚀 Accessing the Kubernetes API with kubectl

Before you interact with your clusters, ensure that Tailscale is configured to route traffic securely to the Kubernetes APIs according to our objectives. This setup maintains the integrity of your Zero Trust posture and enforces the defined access controls.

Below is an example of the ACLs and grants to add:

```json
"acls": [
    // Allow only users in the 'kubernetes:admins' group to access the management cluster's Kubernetes API.
    {
        "action": "accept",
        "src": ["group:kubernetes:admins"],
        "dst": ["tag:kubernetes-seed:443"]
    },

    // Permit users in both 'kubernetes:admins' and 'kubernetes:read-only' groups to access the Kubernetes API as applicable.
    {
        "action": "accept",
        "src": ["group:kubernetes:admins", "group:kubernetes:read-only"],
        "dst": ["tag:kubernetes-operator:443"]
    }
]
```

```json
"grant": [
    // Grant 'kubernetes:admins' permissions to impersonate the 'system:masters' group across all clusters.
    {
        "src": ["group:kubernetes:admins"],
        "dst": ["tag:kubernetes-operator", "tag:kubernetes-seed"],
        "app": {
            "tailscale.com/cap/kubernetes": [{
                "impersonate": {
                    "groups": ["system:masters"]
                }
            }]
        }
    },

    // Allow 'kubernetes:read-only' users to impersonate the 'system:view' group on the application cluster.
    {
        "src": ["group:kubernetes:read-only"],
        "dst": ["tag:kubernetes-operator"],
        "app": {
            "tailscale.com/cap/kubernetes": [{
                "impersonate": {
                    "groups": ["system:view"]
                }
            }]
        }
    }
]
```

> \[!NOTE]
> While the `system:masters` group is preexisting and can be impersonated directly, ensure that you create the `system:view` group on the application cluster by running:
>
> ```bash
> kubectl --context k3d-apps create clusterrolebinding tailscale:system:view --clusterrole=view --group=system:view
> ```

Finally, configure `kubectl` to access the Kubernetes APIs for both clusters:

```bash
tailscale configure kubeconfig k3d-management
tailscale configure kubeconfig k3d-apps
```

This configuration secures access to your clusters while ensuring that permissions are correctly enforced. Now that we have our Zero Trust environment set up, let's move on to the next step: installing ArgoCD on the management cluster.

### 🚀 Install ArgoCD on the Management Cluster

Now that both Kubernetes clusters are securely connected through Tailscale, we'll install ArgoCD on the management cluster to implement GitOps workflows. ArgoCD will allow us to declaratively manage applications deployed to our application cluster within our Zero Trust network.

First, we need to create an OAuth client in Tailscale specifically for ArgoCD. Navigate to the [OAuth clients](https://login.tailscale.com/admin/settings/oauth) page in the Tailscale admin console and:

1. Create a new OAuth client with `Auth Keys` write scope only
2. Assign the tag `tag:kubernetes-argocd` to this client
3. Generate and safely store the OAuth client credentials

Using your OAuth client, generate an auth key and create a Kubernetes secret to store it:

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Create Tailscale authkey secret for ArgoCD"}
read -p "Enter the Tailscale Auth Key for ArgoCD: " TS_ARGOCD_AUTH_KEY

kubectl --context k3d-management --namespace argocd-system create secret generic tailscale-argocd-authkey \
    --from-literal=TS_AUTHKEY="$TS_ARGOCD_AUTH_KEY"
```

Next, configure the ACLs and grants to enable ArgoCD to securely access the application cluster's Kubernetes API with appropriate permissions:

> \[!WARNING]
> For simplicity in this experiment, we're granting ArgoCD full access to the application cluster. In production environments, you should implement more restrictive permissions following the principle of least privilege.

```json
"grant": [
    ...
    // Grant ArgoCD access to the application cluster with system:masters privileges
    {
        "src": ["tag:kubernetes-argocd"],
        "dst": ["tag:kubernetes-operator"],
        "app": {
            "tailscale.com/cap/kubernetes": [{
                "impersonate": {
                    "groups": ["system:masters"]
                }
            }]
        }
    }
    ...
]
```

With the proper permissions in place, proceed to install ArgoCD on the management cluster using Helm:

> \[!NOTE]
> We'll implement a Tailscale sidecar within the ArgoCD deployment to establish secure connectivity to remote clusters through the Tailscale network. While the official ArgoCD Helm chart doesn't support direct Tailscale ingress configuration (specifically the `defaultBackend` parameter), we'll create the ingress resource separately to complete our setup.

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Install ArgoCD on the management cluster"}
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

#### ❓ Why use a sidecar instead of an Egress service?

I initially explored using Tailscale's Egress service for ArgoCD connectivity, but found several limitations that made it unsuitable for our Zero Trust architecture:

**Egress service advantages:**

* **Simplified setup:** Managed by the operator

**Egress service drawbacks:**

* **No granular access control:** All pods on the management cluster would have the same access level to application clusters as they use the same Tailscale IP through the Egress service
* **CoreDNS configuration overhead:** Requires modifying CoreDNS with Kubernetes service IPs *(Tailscale nameserver hosted in the cluster)*
* **Resource overhead:** Creates a separate pod and Tailscale device for each target cluster
* **Scaling complexity:** Requires creating and maintaining a service for each additional cluster

**Sidecar advantages:**

* **Precise access control:** Only ArgoCD can access remote clusters
* **DNS simplicity:** No CoreDNS modifications needed
* **Resource efficiency:** Single sidecar manages all cluster connections and so, only one TS device is needed
* **Security isolation:** Maintains proper separation of concerns

**Sidecar drawbacks:**

* **Authentication management:** Requires managing an authentication key *(easily handled through Tailscale's OAuth client for ephemeral keys)*
* **Sidecar management:** Requires managing a sidecar and their RBAC *(but only a single one for all clusters)*

The sidecar approach aligns better with Zero Trust principles by restricting access to only the ArgoCD application controller that needs it, rather than exposing cluster access broadly across the management cluster. While it requires managing authentication, this is easily handled through Tailscale's OAuth client for ephemeral authentication keys.

### 🔗 Add the application cluster to ArgoCD

Now that we have ArgoCD installed on the management cluster, we need to add the application cluster as a deployment target. This will allow ArgoCD to deploy applications to the application cluster within our Zero Trust network.

First, register the application cluster in ArgoCD using the Tailscale secure connection:

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Add application cluster to ArgoCD"}
read -p "Enter your Tailscale network name: " TS_NETWORK_NAME

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

> \[!TIP]
> I recommend to not use `argocd cluster add` as it will create service accounts and roles in the application cluster. Instead, use a `Secret` to add the cluster to ArgoCD which is enough for our use case.

You can verify that the cluster was added successfully by checking the ArgoCD UI or using the CLI:

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Verify cluster connection"}
argocd cluster list
```

With the application cluster now connected to ArgoCD, you're ready to deploy applications using GitOps workflows within your Zero Trust environment!

### What's Next?

Congratulations on successfully setting up a Zero Trust environment using Tailscale and ArgoCD! 🎉
If you want to test your setup, try deploying an applicationset on the remote cluster using ArgoCD like `manifests/80.applicationset-demo.yaml`.

```bash {"category":"experiments/tailscale-argocd-zero-trust","name":"Deploy the ApplicationSet demo"}
kubectl --context k3d-management apply -f manifests/80.applicationset-demo.yaml
```

This `ApplicationSet` will deploy the [`guestbook`](https://github.com/argoproj/argocd-example-apps/tree/master/guestbook) application on all remote clusters automatically. You can monitor the deployment status in the ArgoCD UI or using the CLI.
