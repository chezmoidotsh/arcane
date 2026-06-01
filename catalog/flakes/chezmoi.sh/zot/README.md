# `chezmoi.sh/zot` — Zot binary packaging flake

Pure binary-packaging flake that exposes the upstream [Zot OCI registry][zot]
release artifacts as Nix derivations. No source rebuild, no Go toolchain — the
official GitHub release binary is fetched, hash-pinned, and `autoPatchelfHook`
rewrites the ELF interpreter so it runs on NixOS.

This flake is consumed by [`../lxc-oci-registry`](../lxc-oci-registry/) (the
NixOS module library) which in turn is consumed by the deployable LXC flake at
[`projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/`](../../../../projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/).

## Why pre-built binaries?

| Concern         | Source build (`buildGoModule`)    | Upstream release (this flake)            |
| --------------- | --------------------------------- | ---------------------------------------- |
| Reproducibility | Bit-identical Go output           | Bit-identical to the GitHub release      |
| Trust boundary  | Trust nixpkgs + Go toolchain      | Trust upstream signing + SHA-256 pin     |
| Build time      | \~5 min, pulls full Go toolchain  | Seconds — `fetchurl` + ELF patch         |
| Supply-chain    | All transitive Go deps re-fetched | Single upstream tarball, single hash     |
| Extensions      | Need `-tags search,sync,…` flag   | Already baked into upstream `zot` binary |

For a homelab pull-through cache we already trust the upstream release; the
extra rebuild buys nothing, so we ship the official binary verbatim.

## Packages

| Output                                    | Description                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `packages.<system>.zot` (also `.default`) | Full Zot — distribution + `search`, `ui`, `sync`, `scrub`, `mgmt`, `metrics` |
| `packages.<system>.zot-minimal`           | Distribution-spec only (\~⅓ size, no extensions)                             |
| `overlays.default`                        | Adds `pkgs.zot` and `pkgs.zot-minimal` to consumers                          |

Supported systems: `x86_64-linux`, `aarch64-linux`.

## Usage

```nix
{
  inputs.zot.url = "path:./catalog/flakes/chezmoi.sh/zot";

  outputs = { self, nixpkgs, zot, ... }: {
    # Direct reference
    packages.x86_64-linux.zot = zot.packages.x86_64-linux.zot;

    # Or via the overlay
    nixosConfigurations.example = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        { nixpkgs.overlays = [ zot.overlays.default ]; }
        ({ pkgs, ... }: { environment.systemPackages = [ pkgs.zot ]; })
      ];
    };
  };
}
```

## Bumping the version

1. Edit `version` in [`flake.nix`](./flake.nix). The `renovate:` manager comment
   above the assignment lets Renovate open a PR automatically.

2. Refresh all four hashes (two systems × two variants):

   ```sh
   mise run nix:hash:update    # picks up every fetchurl in the flake
   ```

3. Rebuild downstream:

   ```sh
   nix build .#zot
   ```

4. Verify the binary boots:

   ```sh
   ./result/bin/zot --version
   ```

## Cross-references

* Upstream releases — <https://github.com/project-zot/zot/releases>
* Zot docs — <https://zotregistry.dev>
* Renovate config — `.github/renovate.json5`

[zot]: https://zotregistry.dev
