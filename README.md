<h1 align="center">
  <img src=".github/assets/arcane-logo.light.svg#gh-light-mode-only" alt="Arcane Logo" height="250" />
  <img src=".github/assets/arcane-logo.dark.svg#gh-dark-mode-only" alt="Arcane Logo" height="250" />

「 Arcane 」 <br/>

</h1>

<h4 align="center">Arcane - My homelab infrastructure as-code</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue?logo=git\&logoColor=white\&logoWidth=20)](LICENSE)
[![Open in GitHub Codespaces](https://img.shields.io/badge/Open_in_Github_Codespace-black?logo=github)](https://github.com/codespaces/new?hide_repo_select=true\&ref=poc/pulumi-alt\&repo=737828332)

<!-- trunk-ignore-begin(markdown-link-check) -->

<a href="#ℹ%EF%B8%8F-about">About</a> · <a href="#-getting-started">Getting Started</a> · <a href="#-project-structure">Project Structure</a> · <a href="#%EF%B8%8F-roadmap">Roadmap</a> · <a href="#%EF%B8%8F-license">License</a>

<!-- trunk-ignore-end(markdown-link-check) -->

</div>

***

## ℹ️ About

Welcome to the repository for my personal homelab infrastructure. This monorepo contains all the code and configurations for managing
my homelab, including various services and tools.
*This repository will probably never be finished, as I'll always be adding new services or tools to my homelab, where I'd like to make
improvements on them.*

> \[!NOTE]
> Why the name Arcane? For two reasons:
>
> 1. Because of the very definition of "arcane": "a mysterious operation whose secrets should only be known to the initiated".
>    I find this definition perfectly represents this project and its content, as nobody really understands it 😅.
> 2. As a tribute to the [Arcane](https://www.arcane.com/) animated series, which left a lasting impression on me.

> \[!CAUTION]
> This repository is a work in progress and currently in a proof of concept phase to find the way I want to manage this homelab.
> It is not yet ready to be reused or forked.

## 🚀 Getting Started

### Prerequisites

* [mise](https://mise.jdx.dev/)

### Installation

> \[!NOTE]
> This repository uses `mise` to manage the development environment.

```bash
# Clone the repository
git clone https://github.com/chezmoidotsh/arcane.git

# Install the development environment
mise install
```

## 📁 Project Structure

```plaintext
├── .github
│   └── assets                      # Repository assets (images, video, etc.) used in the documentation.
├── catalog                         # Catalog of reusable components
│   ├── ansible                     # Ansible roles and collections
│   ├── pulumi                      # Pulumi components and stacks
│   ├── flakes                      # Nix flakes for OCI images
│   ├── fluxcd                      # FluxCD definitions
│   ├── kairos-bundles              # Kairos bundles
│   ├── kustomize                   # Kustomize bases
│   └── talos                       # Talos configuration patches
├── defaults                        # Default configurations
│   ├── kubernetes                  # Default Kubernetes resources
│   └── talos                       # Default Talos configurations
├── docs                            # Documentation
│   ├── decisions                   # Architecture Decision Records (ADR)
│   ├── experiments                 # Experimental projects
│   ├── procedures                  # Operational procedures
│   └── reports                     # Automated reports
├── projects                        # Infrastructure projects
│   ├── amiya.akn                   # Amiya cluster configuration
│   ├── chezmoi.sh                  # Shared resources
│   ├── hass                        # Home Assistant configuration
│   ├── kazimierz.akn               # Kazimierz cluster configuration
│   ├── lungmen.akn                 # Lungmen cluster configuration
│   └── shodan.akn                  # Shodan cluster configuration
├── scripts                         # Utility scripts
├── .mise.toml                      # Development environment configuration
├── CHANGELOG.md                    # Project history and evolution
├── DISASTER_RECOVERY_PLAN.md       # Disaster recovery plan
└── README.md                       # Project documentation
```

## 🗺️ Roadmap

> \[!NOTE]
> I'm currently trying to find a way to manage my homelab infrastructure as code. This roadmap is a work in progress and
> will be updated as I find new ways to improve my homelab. All the history of my choices and changes will be documented
> in the [CHANGELOG](./CHANGELOG.md).

* \[X] ~~Try using `docker-compose` and scripts to manage all containers in the homelab (See [CHANGELOG](./CHANGELOG.md#stone-age-2023-2024---a0))~~

* \[X] ~~Try using `Pulumi` to manage the infrastructure (See [CHANGELOG](./CHANGELOG.md#bronze-age-2024-2024---a1))~~

* [x] ~~Try using `Helm` to manage the Kubernetes applications and `Terraform` to manage the infrastructure (See [CHANGELOG](./CHANGELOG.md#iron-age-2024-2024---a2))~~

* [ ] **Secure Internet Access**: Ensure the homelab is accessible from the internet securely.

* [ ] **Project Shodan**: Implement the AI stack.

* [ ] **Energy Efficiency**: Reduce energy consumption (KEDA -> scaling to 0, start/stop servers at night).

* [ ] **Resilience & DRP**: Rework resilience and Disaster Recovery Plan (especially recovery of critical elements like personal documents).

## 🛡️ License

This repository is licensed under the [Apache-2.0](LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
