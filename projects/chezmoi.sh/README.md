<h1 align="center">
  Root <sub>(chezmoi.sh)</sub>
</h1>

<h4 align="center">chezmoi.sh - Root project</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](../../LICENSE)

<!-- trunk-ignore-begin(markdown-link-check/404) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check/404) -->

</div>

***

## ℹ️ About

`chezmoi.sh` is the root infrastructure project that manages all shared resources and infrastructure-as-code configuration used across the homelab, including:

* **Crossplane providers** for cloud infrastructure (AWS, Cloudflare, Vault)
* **TrueNAS management** for network-attached storage infrastructure
* **Shared IaC compositions** and resources

> \[!NOTE]
> Even if this project is the "root" one, it relies on the [`amiya.akn`](../amiya.akn/README.md) project
> to provide the Kubernetes cluster used by `kubevault` and `crossplane` *(IaC)*.

### TrueNAS Scale Infrastructure

This project includes Ansible automation for TrueNAS Scale infrastructure management using a custom-built collection. The TrueNAS system provides centralized storage for the entire homelab and is configured using Infrastructure as Code principles.

**Collection Details:**

* **Custom Collection**: `chezmoidotsh.truenas.scale` (local fork adapted for Scale)
* **TrueNAS Scale Only**: Requires TrueNAS Scale 22.02+ (fails fast on other systems)
* **midclt Communication**: Uses native TrueNAS Scale middleware interface exclusively
* **Critical Infrastructure Focus**: Essential operations only (datasets, users, shares, ACLs)

**Key Features:**

* Automated ZFS dataset configuration with optimized properties
* Service account management with dedicated users/groups per application
* Fine-grained ACL permissions using NFSv4 ACLs
* Secure SMB network shares with authentication
* Comprehensive system facts gathering and audit capabilities

**Available Operations:**

```bash
# Extract current TrueNAS state (read-only)
mise run ansible:truenas:audit

# Configure TrueNAS system
mise run ansible:truenas

# Preview configuration changes
mise run ansible:truenas:dry-run
```

## 🛡️ License

This repository is licensed under the [Apache-2.0](../../LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
