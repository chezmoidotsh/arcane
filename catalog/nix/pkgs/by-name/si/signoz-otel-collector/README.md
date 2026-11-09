<h1 align="center">
  <img alt="signoz-otel-collector icon" src="../../../../../../docs/assets/icons/_all/opentelemetry.svg" width="96"><br>
  signoz-otel-collector
</h1>

<h4 align="center">SigNoz distribution of the OpenTelemetry Collector and schema migrator</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](https://github.com/SigNoz/signoz-otel-collector/blob/main/LICENSE)
![Linux x86_64](https://img.shields.io/badge/Linux-x86__64-success?logo=linux&logoColor=white)
![Linux aarch64](https://img.shields.io/badge/Linux-aarch64-success?logo=linux&logoColor=white)
![macOS aarch64](https://img.shields.io/badge/macOS-aarch64-success?logo=apple&logoColor=white)

</div>

## Project

SigNoz's distribution of the [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/): it receives OTLP
telemetry, writes it to ClickHouse, and carries the `migrate` subcommands that create and upgrade the ClickHouse schemas
SigNoz relies on. Upstream: [SigNoz/signoz-otel-collector](https://github.com/SigNoz/signoz-otel-collector), Apache-2.0.

## Package contents

| Output                      | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `bin/signoz-otel-collector` | Collector (`--config`) and schema migrator (`migrate bootstrap/sync/async`) |
| `passthru.goModules`        | Vendored Go modules (fixed-output, used to resolve `vendorHash`)            |

Single file: `package.nix`. Built from source (`cmd/signozotelcollector`) with Go 1.25 (`bytedance/sonic` v1.14 does not
compile with Go 1.26). The separate `signoz-schema-migrator` binary of upstream is not packaged: the `migrate`
subcommands of the collector are used instead.

## Build

From this directory:

```sh
mise run pkg:build:native   # for this machine's system (Linux or Apple Silicon)
mise run pkg:build:cross    # for another system, in a container (NIX_SYSTEM, default x86_64-linux)
```

`pkg:build:cross` is not a real cross-compilation: it runs the build natively inside a `nixos/nix` container of the
target platform (`catalog/nix/.mise/tasks/helpers/pkg/build-in-container`), so a Mac without a Linux builder can produce
Linux outputs. It is fast when the container matches the host (`aarch64-linux` on Apple Silicon) and slow when it must
be emulated (`x86_64-linux`). Equivalent without mise, from `catalog/nix`: `nix build "path:.#signoz-otel-collector"`
(the `path:` reference does not depend on the git index).

## Use

- **NixOS appliance** (the supported path): the `signoz` LXC
  (`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/signoz`) runs the migrator once at boot, then the collector.
- **Binary**: `bin/signoz-otel-collector --config=ingester.yaml --manager-config=opamp.yaml`; schema:
  `SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN=tcp://127.0.0.1:9000 bin/signoz-otel-collector migrate sync up`.
- **Container**: the package ships no image. Use upstream's `signoz/signoz-otel-collector`, or wrap the binary with
  `pkgs.dockerTools.buildLayeredImage`.

## Workarounds and risks

| Workaround                                               | Why                                                                                                             | Risk                                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Go 1.25** (`buildGoModule.override { go = go_1_25; }`) | `bytedance/sonic` v1.14 (indirect) does not compile with nixpkgs' default Go 1.26 (`undefined: GoMapIterator`). | Go 1.25 leaves support after Go 1.27 ships; drop the override when the collector updates `sonic`.                     |
| **`signoz-schema-migrator` not packaged**                | The `migrate` subcommands of the collector do the same job and are what upstream's systemd install uses.        | If a release moves a migration step to the standalone migrator only, the schema would not be upgraded: check on bump. |

Validation: built on `x86_64-linux` (as part of the `signoz` LXC image, emulated container), `aarch64-linux` (native
container) and `aarch64-darwin`.

## Update

```sh
cd catalog/nix/pkgs/by-name/si/signoz-otel-collector
mise run pkg:update -- <new-version>     # e.g. 0.144.16
mise run pkg:eval
```

`pkg:update` rewrites `version`, then resolves the source hash and `vendorHash`. Keep it compatible with the `signoz`
package (a SigNoz release expects a given collector/schema version), check that `go.mod`'s Go version still matches
`go_1_25`, and build on Linux (`mise run pkg:build:native`).
