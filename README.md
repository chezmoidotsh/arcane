<!-- markdownlint-disable MD033 -->
<h1 align="center">
  chezmoi.sh · Atlas
  <br/>
  <img src="assets/159c3cee-7092-4f4c-8b32-cd5c96466c69.png" alt="Bernese Mountain Dog as logo" height="250">
</h1>

<h4 align="center">Atlas - My homelab infrastructure as-code</h4>

<div align="center">

[![License](https://img.shields.io/badge/license-GLWTS%20Public%20License-blue?logo=git&logoColor=white&logoWidth=20)](LICENSE)
[![Open in GitHub Codespaces](https://img.shields.io/badge/Open_in_Github_Codespace-black?logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=poc/pulumi-alt&repo=737828332)

<a href="#about">About</a> ·
<a href="#project-structure">Project Structure</a> ·
<a href="#getting-started">Getting Started</a> ·
<a href="#roadmap">Roadmap</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## ℹ️ About

Welcome to the repository for my personal homelab infrastructure. This monorepo contains all the code and configurations for managing
my homelab, including various services and tools.  
_This repository will probably never be finished, as I'll always be adding new services or tools to my homelab, where I'd like to make
improvements on them._

## 📁 Project Structure

```plaintext
├── .envrc                  # direnv configuration
├── .tool-versions          # asdf-vm tool versions
├── Taskfile.dist.yaml      # Taskfile used to manage this repository
├── apps                    # Project or applications definitions (this is the main part of the repository)
│   └── nex.rpi             # └ Homelab's critical services running on a Raspberry Pi
│       ├── config          #   Configuration files
│       └── images          #   Docker images definitions
├── assets                  # Images, logos, and other assets used in this repository
├── infrastructure          # Infrastructure as-code definitions
│   ├── live                # Live infrastructure definitions (what is actually deployed)
│   │   ├── external        # ├ Mainly cloud-related infrastructure
│   │   ├── nex.rpi         # ├ nex.rpi related infrastructure
│   │   └── proxmox         # └ Proxmox related infrastructure (main hypervisor)
│   └── modules             # Infrastucture modules or components used to build the infrastructure
│       └── pyinfra         # pyinfra modules
│           ├── nut         # ├ Network UPS Tools (UPS management)
│           ├── overlayfs   # ├ OverlayFS management
│           └── smfc        # └ SuperMicro Fan Control
├── scripts
└── vendor
```

## 🚀 Getting Started

### Prerequisites

-   [asdf-vm](https://asdf-vm.com/)
-   [direnv](https://direnv.net/)

### Installation

```bash
asdf install
task
```

## 🗺️ Roadmap

-   [ ] Add Proxmox infrastructure as-code definitions (VMs, LXC, configuration, etc.)
-   [ ] Add some tools as-code (VictoriaMetrics VM, Dataiku VM, HomeAssistant OS VM, ...)
-   [ ] Add network configuration as-code (VLANs, firewall rules, etc.)
-   [ ] Add some documentation about the homelab's architecture (hardware, network, etc.)

## 🛡️ License

This repository is licensed under the [GLWTS Public License](LICENSE).

> [!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
