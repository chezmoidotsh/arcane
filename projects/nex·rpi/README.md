<!-- markdownlint-disable MD033 -->
<h1 align="center">
  Nexus · Raspberry Pi <sub>(Nex · RPi)</sub>
</h1>

<h4 align="center">Nex·RPi - Mission-critical services</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git&logoColor=white&logoWidth=20)](../../LICENSE)
[![Made with Pulumi](https://img.shields.io/badge/Made_with-Pulumi-f7bf2a?logo=pulumi&logoColor=white&logoWidth=20)]()

<a href="#about">About</a> ·
<a href="#mission-critcal-services">Services</a> ·
<a href="#how-to-use--how-to-develop-on-it">How to use</a> ·
<a href="#disaster-recovery-plan-drp">Disaster Recovery Plan (DRP)</a> ·
<a href="#roadmap">Roadmap</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## ℹ️ About

Nex · RPi is a project that aims to transform a Raspberry Pi 5 into the most critical component of my homelab.
This project integrates several essential components to allow other projects to be deployed and managed securely,
without[^1] the need of third-party services.

## 🛠️ Mission-Critcal services

### 🌐 Networking

- **DNS based on [AdGuard Home](https://adguard.com/en/adguard-home/overview.html)**: Serves as a local DNS cache to
  speed up DNS resolution, block ads and trackers, and provide local services DNS records if the internet is down.

  **Why is it mission-critical?** It ensures that, even if the internet is down, I can still access local services using
  their DNS names like we do normally.

- **VPN based on [TailScale](https://tailscale.com/)**: Allows access to hosted services from anywhere and manages SSH
  access to devices on the cloud (AWS, Hetzner, etc).

  **Why is it mission-critical?** It allows me to access my homelab services from anywhere securely and access cloud-based
  services without managing SSH keys or a PKI.

### 🔐 Authentication and Authorization

- **LDAP based on [yaLDAP](https://github.com/chezmoi-sh/yaldap/tree/main)**: Provides centralized user management,
  LDAP-compatible service, and is easy to deploy with no feature bloat and static configuration.

  **Why is it mission-critical?** It provides a centralized user management system that can be used by other services
  like SSO and more.

- **SSO based on [Authelia](https://www.authelia.com/)**: Centralized authentication with 2FA, SSO, easy deployment,
  and backed by the previous LDAP.

  **Why is it mission-critical?** It provides a centralized authentication system that can be used by other services
  in the homelab.

### 🗄️ Storage

- **S3 compatible storage based on [MinIO](https://min.io/)**: Stores Pulumi states, but can also be used to store
  metrics and logs.

  ❗**Why is it mission-critical?** Storing Pulumi states makes it essential for the infrastructure to work correctly and
  nothing can be deployed without.

- **Registry based on [zot registry](https://zotregistry.dev)**: Stores Docker images locally.

  ❗**Why is it mission-critical?** All Docker images used by other services are in this registry, and without it, no
  service can be deployed.

- **Secrets vault based on ??**: Stores all secrets used by other services in a secure way.

  **Why is it mission-critical?** It ensures that all secrets are stored securely and can be accessed by services that
  need them with the right ACLs.

### 📦 Others

- **NUT server**: Monitors UPS status and battery level, ideal for Raspberry Pi due to its low power consumption.

  **Why is it mission-critical?** It ensures that all servers can shut down gracefully in case of a power outage.

- **Home dashboard based on [homepage](https://gethomepage.dev/latest/)**: Provides a page with all services and their
  status.

  **Why is it mission-critical?** This is not mission-critical, but it covenient to have a single page with all services
  hosted on the device that must not be shut down.

## 🚀 How to use / How to develop on it

> [!WARNING]
> This project is still in development and not ready for use

## 💀 Disaster Recovery Plan (DRP)

In case of a disaster, the following steps should be taken:

1. Make a new Kubernetes cluster on a Raspberry Pi 5 _(or any other device)_.
2. Deploy the project using `DRP_ENABLED=true`[^2] environment variable and a local Pulumi state.
3. Restore the MinIO bucket with the latest backup if there is any _(other services are stateless or their data are not
   critical, like Authelia session)_.
4. Deploy the project again with the `DRP_ENABLED` environment variable set to `true` **AND** `DRP_STEP=configure_s3`.
5. Migrate current Pulumi states to the new MinIO bucket using the output of the previous step.
6. Deploy the project again without the `DRP_ENABLED` environment variable.

### What these environment variables do?

- `DRP_ENABLED`: When set to `true`, it will force the project to use a local Docker registry.
- `DRP_STEP`: When set to `configure_s3`, it will configure the MinIO bucket with the necessary policies and users to
  allow Pulumi to store its states.

> [!NOTE]
> When the `DRP_ENABLED` environment variable is set to `false`, the project will use the homelab registry (hosted on
> this project) and will always configure MinIO with the necessary policies and users to allow Pulumi to store its
> states.

## 🗺️ Roadmap

- [ ] Configure the Raspberry Pi 5 and install [k3s](https://k3s.io/).
  - [ ] Document the process.
- [ ] Migrate all services from docker to Kubernetes.
- [ ] Add missing services like MinIO, Zot and NUT server.
- [ ] Deploy the project on a Raspberry Pi 5 and test it.
- [ ] Replace the old _Nex.RPi_ project with this one.
- [ ] Make the project easier to test and to work on.

## 📝 Changelog

The ~~changelog~~ history of this project is available [here](CHANGELOG.md).

## 🛡️ License

This repository is licensed under the [Apache-2.0](LICENSE).

> [!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.

[^1]: Except for TailScale and SMTP services, which are used for external communication. However, these services are
      optional and everything _should_ work without them.
[^2]: This will force to use a local docker registry to deploy the services. **Make sure to be able to access the
      registry from the remote device.**
