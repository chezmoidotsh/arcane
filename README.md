<h1 align="center">
  <img src=".github/assets/arcane-logo.light.png#gh-light-mode-only" alt="Arcane Logo" height="75" />
  <img src=".github/assets/arcane-logo.dark.png#gh-dark-mode-only" alt="Arcane Logo" height="75" />

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

* [devcontainer](https://github.com/devcontainers/cli)

### Installation

> \[!NOTE]
> This repository has been designed to be used inside a DevContainer, so any other
> way to interact with it will not be documented.

```bash

# Clone the repository
git clone https://github.com/chezmoidotsh/arcane.git

# Run the development environment
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . -- zsh
```

## 📁 Project Structure

```plaintext
├── .devcontainer                   # Development environment setup (DevContainer/Codespaces)
│   ├── devcontainer.json           # DevContainer configuration file
│   └── Dockerfile                  # Dockerfile on which the DevContainer is based
├── .github
│   └── assets                      # Repository assets (images, video, etc.) used in the documentation.
├── catalog
│   ├── crossplane                  # Crossplane composition definitions
│   └── flakes                      # OCI images used by the homelab and built using Nix
├── projects
│   ├── chezmoi.sh                  # Ressources that are not directly related to any other project
│   │   └── src
│   │       ├── infrastructure
│   │       │   └── live
│   │       │       └── production  # Infrastructure definitions based on Crossplane
│   │       └── kubevault           # Vault related resources and documentation
│   ├── hass                        # Home Assistant related resources and documentation
│   │   └── src
│   │       └── infrastructure
│   │           └── live
│   │               └── production  # Infrastructure definitions based on Crossplane
│   └── nex.rpi                     # Mission-critical applications for the homelab (NEXus · Raspberry PI)
│       └── src
│           ├── apps                # Kubernetes resources
│           ├── clusters
│           │   └── production      # Kubernetes cluster composition
│           └── infrastructure
│               └── live
│                   └── production  # Infrastructure definitions based on Crossplane
├── scripts
│   └── folderinfo                  # Perl script to generate a tree-like structure of directories
├── .envrc                          # Environment configuration file (using direnv)
├── .lefthook.yaml                  # Git hooks configuration file (using lefthook)
├── DISASTER_RECOVERY_PLAN.md       # Document describing the disaster recovery plan
└── flake.nix                       # Nix flake configuration file containing all required dependencies
```

## 🗺️ Roadmap

> \[!NOTE]
> I'm currently trying to find a way to manage my homelab infrastructure as code. This roadmap is a work in progress and
> will be updated as I find new ways to improve my homelab. All the history of my choices and changes will be documented
> in the [CHANGELOG](./CHANGELOG.md).

* \[X] ~~Try using `docker-compose` and scripts to manage all containers in the homelab (See [CHANGELOG](./CHANGELOG.md#stone-age-2023-2024---a0))~~

* \[X] ~~Try using `Pulumi` to manage the infrastructure (See [CHANGELOG](./CHANGELOG.md#bronze-age-2024-2024---a1))~~

* \[X] ~~Try using `Helm` to manage the Kubernetes applications and `Terraform` to manage the infrastructure (See [CHANGELOG](./CHANGELOG.md#iron-age-2024-2024---a2))~~

* \[ ] *Improve the dev experience by improving the DevContainer and Nix environment (making it less bloated / more efficient)*

## 🛡️ License

This repository is licensed under the [Apache-2.0](LICENSE).

> \[!CAUTION]
> This is a personal project intended for my own use. Feel free to explore and use the code,
> but please note that it comes with no warranties or guarantees. Use it at your own risk.
