<!-- markdownlint-disable MD033 -->

<h1 align="center">
  Nexus · Raspberry Pi <sub>(Nex · RPi)</sub>
</h1>

<h4 align="center">Nex·RPi - Mission-critical services</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#%EF%B8%8F-mission-critical-services">Services</a> · <a href="#-how-to-use--how-to-develop-on-it">How to use</a> · <a href="#-disaster-recovery-plan-drp">Disaster Recovery Plan (DRP)</a> · <a href="#%EF%B8%8F-roadmap">Roadmap</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

<!-- markdownlint-enable MD033 -->

## ℹ️ About

Nex·RPi is a project that aims to transform a Raspberry Pi 5 into the most critical component of my homelab.
This project integrates several essential components to allow other projects to be deployed and managed securely,
without[^1] the need of third-party services.

## 🛠️ Mission-Critical services

![Architecture diagram](./assets/architecture.svg)

### 🌐 Networking

* **DNS** *based on [AdGuard Home](https://adguard.com/en/adguard-home/overview.html)*: Serves as a local DNS cache to
  speed up DNS resolution, block ads and trackers, and provide local services DNS records if the internet is down.

  **Why is it mission-critical?** It ensures that, even if the internet is down, I can still access local services using
  their DNS names like we do normally.

* **VPN** *based on [TailScale](https://tailscale.com/)*: Allows access to hosted services from anywhere and manages SSH
  access to devices on the cloud (AWS, Hetzner, etc).

  **Why is it mission-critical?** It allows me to access my homelab services from anywhere securely and access cloud-based
  services without managing SSH keys or a PKI.

### 🔐 Authentication and Authorization

* **SSO** \_based on [Authelia](https://www.authelia.com/) and [yaLDAP](https://github.com/chezmoi-sh/yaldap/tree/main)\_\_:
  Centralized authentication with 2FA, SSO and LDAP support for all services.

  **Why is it mission-critical?** It provides a centralized authentication system that can be used by other services
  in the homelab and ensures that all services are secure.

### 🗄️ Storage

* **S3 compatible storage** *based on [MinIO](https://min.io/)*: Stores somes objects that should be critical like
  backups, some OCI images, etc.

  **Why is it mission-critical?** This is not mission-critical, but it is convenient to have a local S3-compatible
  storage for backups and other objects.

* **Registry** *based on [zot registry](https://zotregistry.dev)*: Stores Docker images locally.

  ❗**Why is it mission-critical?** All Docker images used by other services are in this registry, and without it, no
  service can be deployed.

* **Secrets vault** *based on [kubevault](https://github.com/chezmoi-sh/kubevault)*: Stores all secrets used by other services in a secure way.

  **Why is it mission-critical?** It ensures that all secrets are stored securely and can be accessed by services that
  need them with the right ACLs.

### 📦 Others

* **Home dashboard** *based on [glance](https://github.com/glanceapp/glance)*: Provides a page with all services and their
  status and, if possible, a start page for the browser.

  **Why is it mission-critical?** This is not mission-critical, but it covenient to have a single page with all services
  hosted on the device that must not be shut down.

* **Synchronized IaC** *based on [crossplane](https://crossplane.io)*: Provides a way to manage cloud/3rd party services
  using the same IaC tools.

  **Why is it mission-critical?** It ensures that all external services are managed using the same tools and processes,
  and can be easily audited.

## 🚀 How to use / How to develop on it

> \[!WARNING]
> This project is still in development and not ready for use

## 💀 Disaster Recovery Plan (DRP)

In case of a disaster, the following steps should be taken:

> \[!WARNING]
> This part depends on how the project is deployed... so until I found a way to deploy it, this part is not yet ready.

## 🗺️ Roadmap

* \[X] **Step 0**: Think of what this project should host.
  * \[X] List all services that should be deployed on this project.
  * \[X] Create a diagram of the architecture.
* \[ ] **Step 1**: Install all services on the Raspberry Pi in a "dirty" way.
  * \[ ] Configure the Raspberry Pi by hand (no automation).
  * \[ ] Install and configure the k3s cluster.
  * \[ ] Install and configure all services using only raw Kubernetes manifests.
* \[ ] **Step 2**: Improve quality and security.
  * \[ ] Configure k3s to use the ZOT registry as mirror/proxy for all images[^2].
  * \[ ] Make my own images for all services.
  * \[ ] Develop my own Helm charts for all services.
  * \[ ] ... probably more, but I don't know yet.

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.

[^1]: Except for TailScale and SMTP services, which are used for external communication. However, these services are
    optional and everything *should* work without them.

[^2]: See for more details <https://docs.k3s.io/installation/private-registry>.
