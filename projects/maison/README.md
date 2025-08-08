<h1 align="center">
   🏠 Maison
</h1>

<h4 align="center">Maison - Home services</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#-home-services">Services</a> · <a href="#-disaster-recovery-plan-drp">Disaster Recovery Plan (DRP)</a> · <a href="#%EF%B8%8F-roadmap">Roadmap</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## ℹ️ About

Maison (\me.zɔ̃\\) is a project that host all services that I want to have at home. It integrates several components
like media server, automation, etc. to allow me to have services without the need of third-party services (SaaS).

## 📦 Home services

![Architecture diagram](./assets/architecture.svg)

### 📺 Media

* [**Jellyfin**](https://jellyfin.org/): Media server to watch my movies, series, and listen to my music
  from anywhere.
* [**Jellyseerr**](https://github.com/Fallenbagel/jellyseerr): Free and open source software application for managing
  requests for my media library.

### 🏠 Life management

* [**Actual Budget**](https://actualbudget.com/): Budget management software to track my expenses and incomes.
* [**Mealie**](https://mealie.io/): Recipe manager to store and share my recipes.
* [**Paperless-ngx**](https://docs.paperless-ngx.com/): Document management system (DMS) to store, search and share my documents.

### 🤖 Automation

* [**n8n**](https://n8n.io/): Workflow automation tool to automate tasks between services.
* [**Budibase**](https://budibase.com/): Low-code platform to build internal tools and automate processes.

### 📦 Others

* [**Linkding**](https://github.com/sissbruecker/linkding): Bookmarking service to store and share my bookmarks.

## 💀 Disaster Recovery Plan (DRP)

In case of a disaster, the following steps should be taken:

> \[!WARNING]
> This part depends on how the project is deployed... so until I found a way to deploy it, this part is not yet ready.

## 🗺️ Roadmap

* \[X] **Step 0**: Think of what this project should host.
  * \[X] List all services that should be deployed on this project.
  * \[X] Create a diagram of the architecture.
* \[X] **Step 1**: Install all services on the `kubernetes.maison.chezmoi.sh` Kubernetes cluster.
  * \[X] Install all services on the cluster.
  * \[X] Configure all services to work together.
* \[ ] **Step 2**: Start security and quality improvements.
  * \[ ] Configure the backup mechanism for all services.
  * \[ ] Configure policies (RBAC, network policies, etc.) for all services.
  * \[ ] Configure monitoring for all services.
  * \[ ] Configure automatic updates for all services.
* \[ ] **Step 3**: Prepare for disaster recovery
  * \[ ] Update the DRP document.
  * \[ ] Test the DRP automatically.
* \[ ] **Step 4**: Enhance security
  * \[ ] Build all images from source.
  * \[ ] Use custom Helm charts for all services.
  * \[ ] Use a private registry for all images and Helm charts.

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
