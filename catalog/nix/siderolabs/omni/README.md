# SideroLabs Omni — NixOS Modules

[![Omni](https://img.shields.io/badge/siderolabs-omni-blue?logo=talos\&logoColor=white)](https://omni.siderolabs.com)
![License](https://img.shields.io/badge/license-BSL--1.1-orange)

NixOS modules for [SideroLabs Omni](https://omni.siderolabs.com) — the Talos Linux
management platform — and its infrastructure provider for Proxmox.

## About

This directory contains three composable NixOS modules:

| Module                       | Purpose                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `omni.nix`                   | Omni Talos management platform — PKI, GPG, WireGuard, OIDC, SQLite |
| `dex.nix`                    | Optional co-located Dex OIDC provider                              |
| `infra-provider/proxmox.nix` | Omni infrastructure provider for Proxmox VM provisioning           |

Import all three via `default.nix`, or cherry-pick individual modules.

```nix
# Import everything
imports = [ ./path/to/catalog/nix/siderolabs/omni ];

# Or import individually
imports = [
  ./path/to/catalog/nix/siderolabs/omni/omni.nix
  ./path/to/catalog/nix/siderolabs/omni/dex.nix
];
```

## Quick start

### Omni service

```nix
{
  services.omni = {
    enable = true;
    domain = "omni.example.com";
    advertiseHost = "1.2.3.4";
    oidcProviderUrl = "https://sso.example.com";
    oidcClientId = "omni";
    oidcClientSecret = "omni-secret";
    eulaAcceptName = "Admin";
    eulaAcceptEmail = "admin@example.com";
    initialUsers = [ "admin@example.com" ];
  };
}
```

### With co-located Dex

```nix
{
  services.omni = {
    enable = true;
    domain = "omni.example.com";
    advertiseHost = "1.2.3.4";
    oidcProviderUrl = "https://omni.example.com/dex";
    oidcClientId = "omni";
    oidcClientSecret = "omni-secret";
    eulaAcceptName = "Admin";
    eulaAcceptEmail = "admin@example.com";

    dex = {
      enable = true;
      environmentFile = /path/to/secrets.env;
      users = [{
        email = "admin@example.com";
        username = "admin";
        hashEnvVar = "DEX_ADMIN_PASSWORD_HASH";
      }];
    };
  };
}
```

### Proxmox infrastructure provider

```nix
{
  services.omniInfraProviderProxmox = {
    enable = true;
    omniApiEndpoint = "https://omni.example.com/";
    proxmox = {
      url = "https://pve.lan:8006/api2/json";
      username = "omni";
      realm = "pve";
    };
  };
}
```

## Configuration reference

### `services.omni` — Omni Talos management platform

#### Identity

| Option          | Type  | Default  | Description                                                     |
| --------------- | ----- | -------- | --------------------------------------------------------------- |
| `name`          | `str` | `"omni"` | Instance name (`--name`).                                       |
| `domain`        | `str` | —        | FQDN for advertised URLs and TLS certificate SANs.              |
| `advertiseHost` | `str` | —        | Public IP or DNS hostname for the WireGuard advertised address. |

#### Binary

| Option    | Type          | Default    | Description                                     |
| --------- | ------------- | ---------- | ----------------------------------------------- |
| `version` | `str`         | `"v1.8.2"` | Omni release version (GitHub releases).         |
| `hashes`  | `attrsOf str` | —          | SRI hashes keyed by system (`x86_64-linux`, …). |
| `package` | `package`     | derived    | Override to use a custom build.                 |

#### Storage

| Option              | Type  | Default                   | Description                            |
| ------------------- | ----- | ------------------------- | -------------------------------------- |
| `dataDir`           | `str` | `"/var/lib/omni"`         | Root state directory.                  |
| `pkiDir`            | `str` | `"${dataDir}/pki"`        | Root CA and server TLS cert directory. |
| `sqliteStoragePath` | `str` | `"${dataDir}/db/omni.db"` | SQLite database path.                  |

#### Network

| Option               | Type  | Default          | Description                                         |
| -------------------- | ----- | ---------------- | --------------------------------------------------- |
| `bindAddr`           | `str` | `"0.0.0.0:443"`  | UI/API bind address (`--bind-addr`).                |
| `machineApiBindAddr` | `str` | `"0.0.0.0:8090"` | SideroLink machine API (`--machine-api-bind-addr`). |
| `k8sProxyBindAddr`   | `str` | `"0.0.0.0:8100"` | Kubernetes proxy (`--k8s-proxy-bind-addr`).         |
| `eventSinkPort`      | `int` | `8091`           | Event sink port (`--event-sink-port`).              |
| `wireguardPort`      | `int` | `50180`          | WireGuard UDP port.                                 |

#### OIDC

| Option             | Type  | Default         | Description         |
| ------------------ | ----- | --------------- | ------------------- |
| `oidcClientId`     | `str` | `"omni"`        | OIDC client ID.     |
| `oidcClientSecret` | `str` | `"omni-secret"` | OIDC client secret. |
| `oidcProviderUrl`  | `str` | —               | OIDC issuer URL.    |

#### Initial setup

| Option            | Type         | Default | Description                        |
| ----------------- | ------------ | ------- | ---------------------------------- |
| `initialUsers`    | `listOf str` | `[]`    | Email addresses of initial admins. |
| `eulaAcceptName`  | `str`        | —       | Full name for EULA acceptance.     |
| `eulaAcceptEmail` | `str`        | —       | Email for EULA acceptance.         |

#### Advanced

| Option                | Type         | Default | Description                                        |
| --------------------- | ------------ | ------- | -------------------------------------------------- |
| `allowEphemeralState` | `bool`       | `false` | Suppress the persistent-mount assertion (testing). |
| `environmentFile`     | `nullOr str` | `null`  | Environment file for the `omni` systemd unit.      |
| `extraArgs`           | `listOf str` | `[]`    | Extra flags appended verbatim to the Omni command. |

#### Systemd units

| Unit            | Type    | Description                                                       |
| --------------- | ------- | ----------------------------------------------------------------- |
| `omni-pki-init` | oneshot | Generates root CA + server TLS cert (skipped if `ca.pem` exists). |
| `omni-gpg-init` | oneshot | Generates GPG private key for embedded etcd encryption.           |
| `omni`          | service | Main Omni process. Runs as `omni` user with `CAP_NET_ADMIN`.      |

#### Critical backups

After first boot, back up these files from `${dataDir}`:

| File         | Loss consequence                                |
| ------------ | ----------------------------------------------- |
| `omni.asc`   | All Omni state is unrecoverable.                |
| `pki/ca.pem` | Talos machines cannot verify the Machine API.   |
| `db/omni.db` | Cluster inventory and machine assignments lost. |

### `services.omni.dex` — Co-located Dex OIDC provider

Dex is one possible OIDC provider. Any compliant provider (Pocket-Id, Keycloak, …)
works by pointing `services.omni.oidcProviderUrl` at its issuer URL.

| Option            | Type         | Default            | Description                                      |
| ----------------- | ------------ | ------------------ | ------------------------------------------------ |
| `enable`          | `bool`       | `false`            | Enable co-located Dex.                           |
| `bindAddr`        | `str`        | `"127.0.0.1:5557"` | HTTP bind address. TLS is handled externally.    |
| `environmentFile` | `nullOr str` | `null`             | Environment file for the `dex` unit.             |
| `users`           | `list`       | `[]`               | Static users: `{ email, username, hashEnvVar }`. |

Password hashes are read from `environmentFile` at Nix eval time and baked into the
Dex config. Generate with:

```sh
htpasswd -bnBC 12 "" '<password>' | tr -d ':\n'
```

### `services.omniInfraProviderProxmox` — Proxmox infrastructure provider

| Option                       | Type    | Default     | Description                                      |
| ---------------------------- | ------- | ----------- | ------------------------------------------------ |
| `enable`                     | `bool`  | `false`     | Enable the provider.                             |
| `version`                    | `str`   | `"v0.1.0"`  | Release version (GitHub releases).               |
| `hashes`                     | `attrs` | —           | SRI hashes keyed by system.                      |
| `package`                    | `pkg`   | derived     | Override to use a custom build.                  |
| `id`                         | `str`   | `"proxmox"` | Provider ID in Omni (`--id`).                    |
| `omniApiEndpoint`            | `str`   | —           | Omni API endpoint URL (trailing slash required). |
| `proxmox.url`                | `str`   | —           | Proxmox REST API URL.                            |
| `proxmox.username`           | `str`   | `"root"`    | Proxmox API username (`user`).                   |
| `proxmox.realm`              | `str`   | `"pam"`     | Proxmox authentication realm.                    |
| `proxmox.insecureSkipVerify` | `bool`  | `false`     | Skip TLS verification (self-signed certs only).  |

The provider is stateless with no inbound ports. It connects outbound to Omni and
Proxmox. Secrets (Proxmox password, Omni service account key) are baked into the
image at build time via `_module.args`.

## Version management

Both `omni.nix` and `infra-provider/proxmox.nix` carry Renovate annotations:

```nix
# renovate: datasource=github-releases depName=siderolabs/omni
version = "v1.8.2";
```

Bump `version` and `hashes` together. Renovate proposes these automatically.

## Troubleshooting

### `omni-pki-init` fails with "Permission denied"

`${dataDir}/pki` is not writable by the `omni` user. Check that the persistent
volume is mounted and owned correctly. For Proxmox LXCs, pre-create and chown
the directories before first start.

### `omni-gpg-init` hangs

GPG key generation uses `/dev/random` and can block on entropy. On virtualized
or container environments, install `rng-tools` or ensure `virtio-rng` is available.

### Dex users cannot log in

Password hashes are read at Nix eval time. If the `environmentFile` was absent
during `nix build`, hashes are empty and Dex rejects authentication. Rebuild
with the secrets file present.

### Provider not appearing in Omni UI

Verify `omniApiEndpoint` matches the Omni URL exactly (including trailing slash).
Check that `OMNI_SERVICE_ACCOUNT_KEY` is set in the environment file.

## Dependencies

| Package                | Version | Purpose                               |
| ---------------------- | ------- | ------------------------------------- |
| Omni                   | v1.8.2  | Talos Linux management platform       |
| Dex                    | nixpkgs | OIDC identity provider (optional)     |
| OpenSSL                | nixpkgs | PKI initialization (CA + server cert) |
| GnuPG                  | nixpkgs | Etcd encryption key generation        |
| infra-provider-proxmox | v0.1.0  | Proxmox VM provisioning (optional)    |

## References

* [Omni documentation](https://omni.siderolabs.com)
* [Omni GitHub](https://github.com/siderolabs/omni)
* [omni-infra-provider-proxmox](https://github.com/siderolabs/omni-infra-provider-proxmox)
* [Talos Linux](https://www.talos.dev)
* [Dex OIDC provider](https://github.com/dexidp/dex)
