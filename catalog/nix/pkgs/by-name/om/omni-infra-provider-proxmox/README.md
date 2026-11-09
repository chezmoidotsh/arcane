<h1 align="center">
  <img alt="omni-infra-provider-proxmox icon" src="../../../../../../docs/assets/icons/_all/omni-infra-provider-proxmox.svg" width="96"><br>
  omni-infra-provider-proxmox
</h1>

<h4 align="center">Omni infrastructure provider for Proxmox</h4>

<div align="center">

[![License](https://img.shields.io/badge/License-BSL_1.1-blue)](https://github.com/siderolabs/omni-infra-provider-proxmox/blob/main/LICENSE)
![Linux x86_64](https://img.shields.io/badge/Linux-x86__64-success?logo=linux&logoColor=white)
![Linux aarch64](https://img.shields.io/badge/Linux-aarch64-success?logo=linux&logoColor=white)
![macOS aarch64](https://img.shields.io/badge/macOS-aarch64-success?logo=apple&logoColor=white)

</div>

## Project

[omni-infra-provider-proxmox](https://github.com/siderolabs/omni-infra-provider-proxmox) lets
[Omni](https://omni.siderolabs.com) provision Talos Linux machines as Proxmox VMs: it registers itself in Omni as an
infrastructure provider and creates/destroys VMs through the Proxmox REST API. Upstream:
[siderolabs/omni-infra-provider-proxmox](https://github.com/siderolabs/omni-infra-provider-proxmox), BSL-1.1 (unfree in
nixpkgs).

## Package contents

| Output                            | Description                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| `bin/omni-infra-provider-proxmox` | The provider (static Go binary, `CGO_ENABLED=0`)                 |
| `passthru.goModules`              | Vendored Go modules (fixed-output, used to resolve `vendorHash`) |

Single file: `package.nix`. Built from source (`cmd/omni-infra-provider-proxmox`); the schema and icon it advertises to
Omni are embedded by upstream, and there is no frontend.

## Build

From this directory:

```sh
mise run pkg:build:native   # for this machine's system (Linux or Apple Silicon)
mise run pkg:build:cross    # for another system, in a container (NIX_SYSTEM, default x86_64-linux)
```

`pkg:build:cross` is not a real cross-compilation: it runs the build natively inside a `nixos/nix` container of the
target platform (`catalog/nix/.mise/tasks/helpers/pkg/build-in-container`), so a Mac without a Linux builder can produce
Linux outputs. It is fast when the container matches the host (`aarch64-linux` on Apple Silicon) and slow when it must
be emulated (`x86_64-linux`). Equivalent without mise, from `catalog/nix`:
`nix build "path:.#omni-infra-provider-proxmox"` (the `path:` reference does not depend on the git index).

## Use

- **NixOS appliance** (the supported path): the `omni-infra-provider-proxmox` LXC
  (`projects/chezmoi.sh/src/infrastructure/proxmox/lxc/omni-infra-provider-proxmox`) wraps it in a systemd service and
  feeds it the Proxmox credentials and the Omni service account key.
- **Binary**: `bin/omni-infra-provider-proxmox --help`. It needs the Omni API endpoint and key, and a Proxmox
  URL/username/password (see upstream's documentation).
- **Container**: the package ships no image. Use the image published by upstream, or wrap the binary with
  `pkgs.dockerTools.buildLayeredImage`.

## Workarounds and risks

None: a plain `buildGoModule` build with nixpkgs' default Go. `proxyVendor = true` only makes the vendoring step
deterministic.

Validation: built on `x86_64-linux` (as part of the `omni-infra-provider-proxmox` LXC image, emulated container),
`aarch64-linux` (native container) and `aarch64-darwin`.

## Update

```sh
cd catalog/nix/pkgs/by-name/om/omni-infra-provider-proxmox
mise run pkg:update -- <new-version>     # e.g. 0.3.0
mise run pkg:eval
```

`pkg:update` rewrites `version`, then resolves the source hash and `vendorHash`. Check that `go.mod`'s Go version is
still covered by nixpkgs' default Go, and build on Linux (`mise run pkg:build:native`). The `# oripathy:` annotation
above `version` is what Oripathy tracks: keep it on that line.
