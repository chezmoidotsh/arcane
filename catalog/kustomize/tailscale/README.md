<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
  <h1 align="center">Tailscale - Kustomize Component</h1>
  <img src="../../../docs/assets/icons/system/tailscale.svg" alt="Tailscale Logo" width="120" height="120">
</div>

<h4 align="center">Secure networking for your Kubernetes cluster</h4>

<div align="center">

[![Kustomize](https://img.shields.io/badge/Kustomize-ready-green?logo=kubernetes\&logoColor=white\&logoWidth=20)](https://kustomize.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

\[![View on GitHub](https://img.shields.io/badge/View_on-GitHub-lightgrey?logo=github\&logoColor=white\&logoWidth=20)]\( <a href="#-overview">Overview</a> · <a href="#-features">Features</a> · <a href="#%EF%B8%8F-prerequisites">Prerequisites</a> · <a href="#-usage">Usage</a> · <a href="#-configuration">Configuration</a> · <a href="#-security-considerations">Security</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## 🌐 Overview

This `Tailscale Kustomize` component deploys the [Tailscale Operator](https://github.com/tailscale/tailscale) in your Kubernetes cluster, enabling a zero-trust approach to networking with [Tailscale’s mesh VPN](https://tailscale.com/). It enforces identity-based access, providing encrypted connections to cluster services from anywhere and enabling the [Kubernetes API proxy](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/) for secure, remote cluster management.

## ✨ Features

This component provides a preconfigured Tailscale deployment with:

* **Automated operator deployment** via Helm chart integration
* **Network policy enforcement** with strict security defaults for `ingress` proxies
* **Restricted proxy class** for controlled ingress handling *(named `restricted`)*

## ⚙️ Prerequisites

Before using this component, ensure you have:

* A Kubernetes cluster with `Kustomize` support
* Access to the Tailscale admin panel to generate oauth keys (see [Tailscale documentation](https://tailscale.com/kb/1236/kubernetes-operator) for details)
* [External Secrets Operator](https://external-secrets.io/) installed (for auth key management) and a properly configured secret store with your Tailscale credentials

## 🚀 Usage

To use this component in your Kustomization ...

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

components:
  - path/to/catalog/kustomize/tailscale

# Optional patches for customization
patches:
  # Update the hostname of the Tailscale Operator to match the cluster name
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: operator
      spec:
        template:
          spec:
            containers:
              - name: operator
                env:
                  - name: OPERATOR_HOSTNAME
                    value: <YOUR_CLUSTER_NAME>
```

> \[!WARNING]
> On k3s, ensure that the Kubernetes API is permitted by the Tailscale ingress Network Policy to enable communication.
>
> ```yaml
>   - target:
>     group: networking.k8s.io
>     kind: NetworkPolicy
>     name: tailscale-ingress-restricted
>   patch: |
>     - op: add
>       path: /spec/egress/-
>       value:
>         to:
>           - ipBlock:
>               cidr: <KUBERNETES_API>/32
>         ports:
>           - port: 443
>             protocol: TCP
> ```

... and create the `tailscale-operator-oauth` secrets with your Tailscale credentials, containing `client_id` and `client_secret`.

> \[!WARNING]
> If you want to use the `restricted` proxy class, ensure you have also installed the [Generic Device Plugin](https://github.com/squat/generic-device-plugin)
> in your cluster.
>
> ```yaml
> components:
>   - path/to/catalog/kustomize/tailscale/plugins/tun-device-plugin
> ```
>
> This plugin is required to managed `tun` devices without `privileged` containers.

### 🔧 Configuration

This component can be customized through patches:

* **Changing the operator hostname**: Set the `OPERATOR_HOSTNAME` environment variable
* **Adding/changing Tailscale Operator tags**: Configure `OPERATOR_INITIAL_TAGS`

> \[!WARNING]
> Ensure you have created the `tailscale-operator-oauth` secret with your Tailscale credentials before deploying the component.

## 🔒 Security Considerations

This component includes strict network policies that:

* Deny all incoming connections to Tailscale `ingress` pods
* Allow outbound traffic only to in-cluster services and external public internet
* Explicitly block communication to private IP ranges to prevent lateral movement *(RFC1918)*

```mermaid
flowchart LR
    classDef allowed fill:none,stroke:#9f9,stroke-width:2px;
    classDef denied fill:none,stroke:#f99,stroke-width:2px;

    ts((Tailscale Ingress Pods))

    ioc[Outside Cluster]:::denied -- Denied --> ts
    iin[In Namespace]:::denied -- Denied --> ts
    iic[In Cluster]:::denied -- Denied --> ts

    subgraph "Outside Cluster"
        ooc_blocked[Private IP Ranges (RFC1918)]
        ooc_allowed[Other IP Ranges]
    end
    ts -- Allowed --> ooc_allowed:::allowed
    ts -- Denied --> ooc_blocked:::denied
    ts -- Denied --> oin[In Namespace]:::denied
    ts -- Allowed --> oic[In Cluster]:::allowed
```

These measures help maintain network segmentation and protect your cluster from potential security threats.

***

<div align="center">
  <sub>Part of the <a href="../../../README.md">Atlas</a> project</sub>
</div>
