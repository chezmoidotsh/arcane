<h1 align="center">
  <img alt="signoz icon" src="../../../../../../docs/assets/icons/_all/signoz.svg" width="96"><br>
  signoz
</h1>

<h4 align="center">SigNoz — open-source observability platform (community edition)</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-MIT-blue)](https://github.com/SigNoz/signoz/blob/main/LICENSE)
![Linux x86_64](https://img.shields.io/badge/Linux-x86__64-success?logo=linux&logoColor=white)
![Linux aarch64](https://img.shields.io/badge/Linux-aarch64-success?logo=linux&logoColor=white)
![macOS aarch64](https://img.shields.io/badge/macOS-aarch64-success?logo=apple&logoColor=white)

</div>

## Project

[SigNoz](https://signoz.io) is an open-source observability platform (logs, metrics, traces) that stores telemetry in
ClickHouse. This package is the query service and web UI of the community edition. Upstream:
[SigNoz/signoz](https://github.com/SigNoz/signoz), MIT (the `ee/` directory is not built).

## Package contents

| Output                           | Description                                                       |
| -------------------------------- | ----------------------------------------------------------------- |
| `bin/signoz`                     | Query service (`signoz server`), built from `cmd/community`       |
| `user_scripts/histogramQuantile` | Helper binary behind ClickHouse's `histogramQuantile()` UDF       |
| `web/`                           | Web UI (`passthru.ui`, `ui.nix`, vite build of `frontend/`, pnpm) |
| `templates/`, `conf/`            | Email/alert templates and the example configuration               |
| `passthru.goModules`             | Vendored Go modules (fixed-output, used to resolve `vendorHash`)  |

Files: `package.nix` (backend, version, source and vendor hashes) and `ui.nix` (frontend, pnpm hash). Built from source
with Go 1.25 (`bytedance/sonic` v1.14 does not compile with Go 1.26). It needs ClickHouse and the
`signoz-otel-collector` package (schema migrations and ingestion) to be useful.

## Build

From this directory:

```sh
mise run pkg:build:native   # for this machine's system (Linux or Apple Silicon)
mise run pkg:build:cross    # for another system, in a container (NIX_SYSTEM, default x86_64-linux)
```

`pkg:build:cross` is not a real cross-compilation: it runs the build natively inside a `nixos/nix` container of the
target platform (`catalog/nix/.mise/tasks/helpers/pkg/build-in-container`), so a Mac without a Linux builder can produce
Linux outputs. It is fast when the container matches the host (`aarch64-linux` on Apple Silicon) and slow when it must
be emulated (`x86_64-linux`). Equivalent without mise, from `catalog/nix`: `nix build "path:.#signoz"` (the `path:`
reference does not depend on the git index).

## Use

- **NixOS appliance** (the supported path): the `signoz` LXC
  (`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/signoz`) runs it next to ClickHouse and the collector.
- **Binary**:
  `SIGNOZ_WEB_DIRECTORY=$pkg/web SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN=tcp://127.0.0.1:9000 $pkg/bin/signoz server`
  (configuration is read from `SIGNOZ_*` variables, see `conf/example.yaml`).
- **Container**: the package ships no image. Use upstream's `signoz/signoz-community`, or wrap the binary with
  `pkgs.dockerTools.buildLayeredImage`.

## Workarounds and risks

| Workaround                                                                      | Why                                                                                                                                                              | Risk                                                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Go 1.25** (`buildGoModule.override { go = go_1_25; }`)                        | `bytedance/sonic` v1.14 (indirect) does not compile with nixpkgs' default Go 1.26 (`undefined: GoMapIterator`). `go.mod` only requires Go 1.25.7.                | Go 1.25 leaves support after Go 1.27 ships; drop the override when SigNoz updates `sonic`.                                   |
| **`pnpm_10_latest`** (`ui.nix`)                                                 | nixpkgs' `pnpm_10` is flagged insecure in 26.05; upstream requires pnpm `>=10 <11`.                                                                              | Slightly different pnpm patch version than upstream's. Breaks if nixpkgs drops the attribute.                                |
| **`postinstall` skipped, translations hash generated in `preBuild`** (`ui.nix`) | The pnpm hook installs with `--ignore-scripts`; upstream's `postinstall` generates `i18n-translations-hash.json` (needed by the UI) and an editor-only registry. | A new `postinstall` step upstream would be silently missed; check the build log and the UI after a bump.                     |
| **`community` command only** (`package.nix`)                                    | The `ee/` (enterprise) edition needs a license; the community build has none of that code.                                                                       | Enterprise-only features are absent. Check upstream's feature matrix before relying on SSO (the appliance has none for now). |

Validation: built on `x86_64-linux` (as part of the `signoz` LXC image, emulated container), `aarch64-linux` (native
container, backend and UI) and `aarch64-darwin`.

## Update

```sh
cd catalog/nix/pkgs/by-name/si/signoz
mise run pkg:update -- <new-version>     # e.g. 0.150.0
mise run pkg:eval
```

`pkg:update` rewrites `version`, then resolves the source hash, `vendorHash` and the pnpm hash of `ui.nix`. Then:

1. Bump `signoz-otel-collector` to the version SigNoz expects (its schema migrations must match).
2. Check that `go.mod`'s Go version still matches `go_1_25`, and that the ClickHouse version of the appliance is
   supported.
3. Build on Linux (`mise run pkg:build:native`) and run the appliance upgrade.
