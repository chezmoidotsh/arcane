<!-- markdownlint-disable MD033 -->

<div align="center">
  <img src="../../../../../docs/assets/icons/apps/argo-cd.svg" alt="ArgoCD" width="100" height="100">
</div>

<h4 align="center">chezmoi.sh - ArgoCD Documentation</h4>

***

> \[!NOTE]
> **Why is ArgoCD in `apps` folder and not the `infrastructure` one?**
>
> The main reason is that ArgoCD is used in this project as a deployment tool, similar to Adguard as a DNS server. Although it is crucial for the proper functioning of the infrastructure, it is not considered an integral part of it.

## 🐙 But ... what is ArgoCD?

[ArgoCD](https://argo-cd.readthedocs.io/en/stable/) is a continuous deployment tool for Kubernetes. It allows managing Kubernetes applications using declarative configuration files, making it easier to handle versioning and deploying applications in Kubernetes environments.

For more information, please refer to the [official documentation](https://argo-cd.readthedocs.io/en/stable/).

## ℹ️ About this folder

This folder, like all folders prefixed with `*`, is a special folder that requires particular attention. In fact, it is part of the bootstrap folders that need to be initiated manually and must not be managed in `autosync` mode.

It consists of two distinct parts:

* The deployment of ArgoCD itself ([in this folder](.))
* The deployment of ArgoCD ApplicationSets, which follow a normal lifecycle ([in the `applicationsets` folder](applicationsets/))
