# `chezmoi.sh/lxc-oci-registry` — Reusable NixOS module library

NixOS module library that composes a single-node OCI registry stack
(**Zot** behind **Caddy**) suitable for running inside a Proxmox LXC.

This flake exposes **modules only** — it doesn't build an image. The
deployable LXC lives at
[`projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/`](../../../../projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/)
and imports the modules below.

## What's in the box

```text
modules/
├── default.nix     Imports the three sub-modules below (the "bundle").
├── zot.nix         Zot service: user, systemd unit, config, htpasswd.
├── caddy.nix       Caddy reverse proxy: TLS, HSTS, OCI-aware routing.
└── hardening.nix   Opt-in LXC hardening (sysctl, login surface, services).
```

| Output                                     | What it gives you                                     |
| ------------------------------------------ | ----------------------------------------------------- |
| `nixosModules.lxc-oci-registry`            | Bundle — imports zot + caddy + hardening (all opt-in) |
| `nixosModules.default`                     | Alias of the bundle                                   |
| `nixosModules.zot` / `caddy` / `hardening` | Individual modules, for finer-grained imports         |
| `packages.<system>.zot`                    | Re-export of the full Zot binary                      |
| `packages.<system>.zot-minimal`            | Re-export of the slim Zot binary                      |

## Module options at a glance

### `services.lxc-oci-registry.zot`

| Option                | Type            | Default        | Purpose                                                             |
| --------------------- | --------------- | -------------- | ------------------------------------------------------------------- |
| `package`             | `package`       | *(required)*   | Which Zot binary to run                                             |
| `storageDir`          | `path`          | `/var/lib/zot` | Storage root for blobs and metadata                                 |
| `enableManagementAPI` | `bool`          | `true`         | Activate `extensions.search` (transitively enables `mgmt` and `ui`) |
| `htpasswdFile`        | `nullOr path`   | `null`         | Bcrypt-hashed credentials for `http.auth.htpasswd`                  |
| `settings`            | `freeform JSON` | `{}`           | Deep-merged over the defaults (full Zot config schema)              |

### `services.lxc-oci-registry.caddy`

| Option               | Type      | Default      | Purpose                                                          |
| -------------------- | --------- | ------------ | ---------------------------------------------------------------- |
| `package`            | `package` | `pkgs.caddy` | Caddy binary (use `withPlugins` for DNS-01)                      |
| `domain`             | `str`     | *(required)* | Public domain — virtual host name and ACME subject               |
| `upstreamPort`       | `port`    | `5000`       | Port where Zot listens locally                                   |
| `maxRequestBodySize` | `str`     | `10GiB`      | Hard ceiling on a single blob upload                             |
| `https.enable`       | `bool`    | `false`      | Toggle TLS termination                                           |
| `https.extraConfig`  | `lines`   | `""`         | Extra directives inside the HTTPS site block (TLS issuer config) |

### `services.lxc-oci-registry.hardening`

| Option        | Type         | Default | Purpose                                                                          |
| ------------- | ------------ | ------- | -------------------------------------------------------------------------------- |
| `enable`      | `bool`       | `false` | Apply the LXC hardening profile                                                  |
| `consoleUser` | `nullOr str` | `null`  | Create an unprivileged user for `pct enter` (default: only root via `pct enter`) |

## Minimal usage example

```nix
{
  description = "My private OCI registry";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-26.05";
    nixos-generators.url = "github:nix-community/nixos-generators";
    nixos-generators.inputs.nixpkgs.follows = "nixpkgs";
    lxc-oci-registry.url = "path:../catalog/flakes/chezmoi.sh/lxc-oci-registry";
    lxc-oci-registry.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, nixos-generators, lxc-oci-registry }: {
    packages.x86_64-linux.default = nixos-generators.nixosGenerate {
      system = "x86_64-linux";
      format = "lxc";
      modules = [
        lxc-oci-registry.nixosModules.lxc-oci-registry
        ({ pkgs, ... }: {
          system.stateVersion = "26.05";
          networking.hostName = "oci";

          services.lxc-oci-registry.hardening.enable = true;

          services.lxc-oci-registry.zot = {
            package = lxc-oci-registry.packages.x86_64-linux.zot;
            settings.extensions.sync.registries = [
              {
                urls = [ "https://docker.io" ];
                content = [{ destination = "/docker.io"; prefix = "**"; }];
                onDemand = true;
                tlsVerify = true;
              }
            ];
          };

          services.lxc-oci-registry.caddy = {
            domain = "oci.example.com";
            https.enable = true;
            https.extraConfig = ''
              tls {
                dns cloudflare {env.CLOUDFLARE_API_TOKEN}
              }
            '';
            # Build a Caddy with the Cloudflare DNS plugin
            package = pkgs.caddy.withPlugins {
              plugins = [ "github.com/caddy-dns/cloudflare@v0.2.4" ];
              hash = "sha256-…";
            };
          };
        })
      ];
    };
  };
}
```

Build the LXC tarball with:

```sh
mise run nix:build:lxc .
```

The result is a `.tar.xz` ready for `pct create … vztmpl:…`.

## Design choices

1. **Catalog vs project split.** The catalog flake stays free of site-specific
   values (no domains, no upstream registries, no secrets). All of that goes
   in a *deployable* flake that imports the modules and supplies the missing
   options. This is the standard
   [chezmoi.sh layering](../../../../../AGENTS.md#project-structure).

2. **Hardening is opt-in.** A homelab in someone else's environment may want
   SSH, a real shell user, or different sysctls. Forcing a single profile
   would surprise them. Set `services.lxc-oci-registry.hardening.enable = true`
   to apply the chezmoi.sh defaults.

3. **Zot's `mgmt` extension is on by default.** It exposes a single read-only
   endpoint at `GET /v2/_zot/ext/mgmt?resource=config` returning the running
   config with secrets stripped. Nothing destructive lives there — useful for
   monitoring, easy to keep enabled.

4. **No proxy-level basic auth.** OCI clients (`docker`, `crane`, `skopeo`)
   expect `401 WWW-Authenticate` to come from the registry, not a generic
   reverse proxy. If you need authentication, configure it in Zot via
   `htpasswdFile` so the challenge round-trip stays compliant.

5. **`pkgs.formats.json` over `lib.types.attrs`.** The Zot module uses
   `pkgs.formats.json { }` to type-check the settings tree and emit a
   reproducible JSON file. Free-form attribute sets are still accepted via
   the settings option, but they go through type validation.

## Related

* Binary packaging flake — [`../zot/`](../zot/)
* Deployable LXC flake — [`projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/`](../../../../projects/chezmoi.sh/src/infrastructure/proxmox/zot-registry/)
* Upstream Zot docs — <https://zotregistry.dev>
* Upstream Caddy docs — <https://caddyserver.com/docs/>
