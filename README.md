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
<a href="#getting-started">Getting Started</a> ·
<a href="#project-structure">Project Structure</a> ·
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

> [!WARNING]
> This repository is a work in progress and currently in a proof of concept phase with Pulumi. It is not yet ready to be reused or forked.

## 🚀 Getting Started

### Prerequisites

-   [devcontainer](https://github.com/devcontainers/cli)

### Installation

> [!NOTE]
> This repository has been designed to be used inside a DevContainer, so any other
> way to interact with it will not be documented.

```bash

# Clone the repository
git clone https://github.com/chezmoi-sh/atlas.git

# Run the development environment
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . -- zsh
```

## 📁 Project Structure

```plaintext
├── .devcontainer          # Development environment setup (DevContainer/Codespaces)
│   ├── devcontainer.json  # DevContainer configuration file
│   └── Dockerfile         # Dockerfile on which the DevContainer is based
├── assets                 # Repository assets (images, video, etc.) used in the documentation.
├── catalog                # Contains all images and application packages compatible with Pulumi
│   ├── os                 # OS related images
│   └── security           # Application related to security (authn, authz, firewall, etc.)
├── lib
│   ├── core               # TS libraries for containing all the buisness logic for this repository.
│   └── policy-pack        # Policy packs used by Pulumi to enforce best practices.
├── scripts
│   └── src
│       └── folderinfo     # Tools to generate the folder structure of Atlas
├── .envrc                 # Direnv configuration file
├── .tool-versions         # asdf-vm configuration file
└── .lefthook.yaml         # Git hooks configuration file (using Lefthook)
```

## 🗺️ Roadmap

-   [ ] Add Pulumi infrastructure as-code definitions (VPC, VMs, LXC, configuration, etc.)
-   [ ] Add Proxmox infrastructure as-code definitions (VMs, LXC, configuration, etc.)
-   [ ] Add some tools as-code (VictoriaMetrics VM, Dataiku VM, HomeAssistant OS VM, ...)
-   [ ] Add network configuration as-code (VLANs, firewall rules, etc.)
-   [ ] Add some documentation about the homelab's architecture (hardware, network, etc.)

## 🛡️ License

This repository is licensed under the [Apache-2.0](LICENSE).

> [!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
