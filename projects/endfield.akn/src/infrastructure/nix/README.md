# Endfield Industries Infrastructure — Nix

nix-darwin configuration for the machines of **Endfield Industries** — the local AI inference
arm of the Rhine Lab project, managed as code through the Nix ecosystem.

## Table of Contents

* [Why Nix instead of Ansible?](#why-nix-instead-of-ansible)
* [Machines](#machines)
  * [yvonne — Mac Studio (2022, M1 Max, 32 GB)](#yvonne--mac-studio-2022-m1-max-32-gb)
    * [Specifications](#specifications)
    * [Components](#components)
    * [Access URLs](#access-urls)
    * [Setup](#setup)
    * [XDG Paths](#xdg-paths)
* [Development](#development)
  * [Build & Apply](#build--apply)
  * [Lint](#lint)

## Why Nix instead of Ansible?

The previous iteration of this infrastructure used Ansible. Nix replaces it for three
structural reasons:

**Deep macOS integration via nix-darwin.** nix-darwin is a Nix module system built
specifically for macOS. It manages Homebrew, launchd agents, system settings, and XDG
directories through a single declarative layer — no ad hoc shell commands, no `brew install`
scattered across playbooks.

**Declarative state, not imperative actions.** Ansible describes *tasks to run*: install this,
copy that, restart the service. Nix describes *the system you want*. The derivation graph
ensures reproducibility: the same flake on any machine produces the same result. Rolling back
is `darwin-rebuild switch --rollback`; no playbook undo logic needed.

**One flake, multiple machines.** Adding a second machine is a new `darwinConfigurations`
entry in `flake.nix`. Shared settings live in `modules/common.nix`; machine-specific modules
are composed on top. Ansible's inventory + group\_vars model achieves the same goal but at the
cost of more moving parts.

**Atomic upgrades and garbage collection.** Nix applies changes atomically — the system
either switches to the new generation or stays on the old one. Unused packages are collected
with `nix-collect-garbage`. Ansible has no equivalent safety net for partial failures.

***

## Machines

### Yvonne — Mac Studio (2022, M1 Max, 32 GB)

> \[!NOTE]
> Named after **Yvonne**, an operator from *Arknights: Endfield*. A chic and unconventional
> scientist of Endfield Industries' Specialist Tech Division, Yvonne researches Æther and
> Blight-related devices. Despite everyone expecting her to join a prestigious research
> institute after her early graduation, she chose Endfield — and never explained why. Her
> rebellious style (dyed horns, custom attire) hides a mind that produces real results outside
> conventional paths. The machine mirrors that: running open-weight models that the mainstream
> AI industry ignores, on hardware that does not need a data center.

#### Specifications

| Field            | Spec                                     |
| ---------------- | ---------------------------------------- |
| Model            | Apple Mac Studio (2022)                  |
| Chip             | Apple M1 Max                             |
| CPU              | 10-core (8 performance + 2 efficiency)   |
| GPU              | 24-core                                  |
| Neural Engine    | 16-core — **11 TOPS**                    |
| Memory bandwidth | 400 GB/s                                 |
| Unified memory   | 32 GB                                    |
| Storage          | 512 GB SSD                               |
| Media engine     | Hardware H.264, HEVC, ProRes, ProRes RAW |
| OS               | macOS (managed by nix-darwin)            |

> \[!INFO]
> The M1 Max Neural Engine delivers 11 trillion operations per second (TOPS). For context,
> the Raspberry Pi 5 NPU peaks at 13 TOPS while the M4 Neural Engine reaches 38 TOPS.
> The M1 Max remains strong for local inference because most of the workload goes through
> the 24-core GPU and the 400 GB/s unified memory bandwidth — not the Neural Engine.

#### Components

| Component          | Role                                                                                                    | Managed by                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LM Studio**      | Local LLM inference server. Runs open-weight models (Llama, Mistral, Qwen…) on Apple Silicon via Metal. | **Homebrew cask** — LM Studio ships as a self-contained macOS app with its own update mechanism. Nix cannot cleanly package a sandboxed macOS GUI app that manages its own model store and GPU layers. Nix installs it via `common.nix` through the Homebrew cask `lm-studio`; the service itself starts manually or via the app. The OpenAI-compatible API it exposes on `127.0.0.1:8234` is what the rest of the stack consumes. |
| **Kokoro FastAPI** | Local text-to-speech synthesis served as a REST API.                                                    | **nix-darwin** — managed as a user-level launchd agent in `modules/kokoro.nix`.                                                                                                                                                                                                                                                                                                                                                    |
| **Caddy**          | Reverse proxy. Exposes both services on the local network under friendly hostnames.                     | **nix-darwin** — managed as a user-level launchd agent in `modules/caddy.nix`.                                                                                                                                                                                                                                                                                                                                                     |

#### Access URLs

| Service                | URL                                 | Backend          |
| ---------------------- | ----------------------------------- | ---------------- |
| LM Studio (OpenAI API) | `http://studio.llm.chezmoi.sh:1234` | `127.0.0.1:8234` |
| Kokoro TTS             | `http://kokoro.llm.chezmoi.sh:1234` | `127.0.0.1:8880` |

Both endpoints are exposed by Caddy. Add the following entries to your `/etc/hosts` or local
DNS to resolve them on the LAN (replace `<yvonne-ip>` with the machine's IP address):

```
<yvonne-ip>  studio.llm.chezmoi.sh
<yvonne-ip>  kokoro.llm.chezmoi.sh
```

#### Setup

> \[!NOTE]
> Run all commands from the repo root unless stated otherwise.

1. **Install Lix** (the Nix implementation used here):
   ```bash
   curl -sSf -L https://install.lix.systems/lix | sh -s -- install
   ```

2. **Install mise** (tool manager):
   ```bash
   curl https://mise.run | sh
   mise install
   ```

3. **Set `username`** in `flake.nix` to match the macOS account name:
   ```nix
   username = "yourname";
   ```

4. **Apply the configuration** (first run installs nix-darwin if absent):

   ```bash
   sudo nix --extra-experimental-features "nix-command flakes" run nix-darwin -- switch --flake ./projects/endfield.akn/src/infrastructure/nix#yvonne
   ```

5. **Reconnect** (open a new shell or log out/in) to pick up the new environment and
   start the user-level launchd agents (Caddy, Kokoro).

6. **Start LM Studio manually** (or from Spotlight/Launchpad) and enable the local server
   in its settings on port `8234`.

#### XDG Paths

| Purpose | Path                 |
| ------- | -------------------- |
| Config  | `~/.config`          |
| Data    | `~/.local/share`     |
| Logs    | `~/.local/state/log` |

***

## Development

### Build & Apply

```bash
# Build only (no system changes)
nix build ./projects/rhinelab.akn/src/infrastructure/nix#darwinConfigurations.yvonne.system

# Apply to the system
nix run nix-darwin -- switch --flake ./projects/rhinelab.akn/src/infrastructure/nix#yvonne
```

### Lint

```bash
nix run nixpkgs#statix   -- check projects/rhinelab.akn/src/infrastructure/nix
nix run nixpkgs#deadnix  -- projects/rhinelab.akn/src/infrastructure/nix
nix run nixpkgs#alejandra -- --check projects/rhinelab.akn/src/infrastructure/nix

# Auto-format
nix run nixpkgs#alejandra -- projects/rhinelab.akn/src/infrastructure/nix
```
