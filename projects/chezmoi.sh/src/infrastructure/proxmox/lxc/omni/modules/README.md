# Omni — NixOS modules

NixOS modules of the `omni` LXC for [Omni](https://omni.siderolabs.com), the Talos Linux management platform. They are
specific to this appliance (nothing else consumes them) and use the `omni` package built from source in
`catalog/nix/pkgs/by-name/om/omni`, which the LXC flake injects through `services.omni.package`.

## About

| Module     | Purpose                                                            |
| ---------- | ------------------------------------------------------------------ |
| `omni.nix` | Omni Talos management platform — PKI, GPG, WireGuard, OIDC, SQLite |
| `dex.nix`  | Optional co-located Dex OIDC provider (`services.omni.dex`)        |

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

## Configuration reference

### `services.omni` — Omni Talos management platform

#### Identity

| Option          | Type  | Default  | Description                                                     |
| --------------- | ----- | -------- | --------------------------------------------------------------- |
| `name`          | `str` | `"omni"` | Instance name (`--name`).                                       |
| `domain`        | `str` | —        | FQDN for advertised URLs and TLS certificate SANs.              |
| `advertiseHost` | `str` | —        | Public IP or DNS hostname for the WireGuard advertised address. |

#### Binary

| Option    | Type      | Default | Description                                    |
| --------- | --------- | ------- | ---------------------------------------------- |
| `package` | `package` | —       | Omni package, set by the LXC flake (required). |

#### Storage

| Option              | Type  | Default                   | Description                            |
| ------------------- | ----- | ------------------------- | -------------------------------------- |
| `dataDir`           | `str` | `"/var/lib/omni"`         | Root state directory.                  |
| `pkiDir`            | `str` | `"${dataDir}/pki"`        | Root CA and server TLS cert directory. |
| `sqliteStoragePath` | `str` | `"${dataDir}/db/omni.db"` | SQLite database path.                  |

#### Network

| Option               | Type  | Default          | Description                                          |
| -------------------- | ----- | ---------------- | ---------------------------------------------------- |
| `bindAddr`           | `str` | `"0.0.0.0:443"`  | UI/API bind address (`--bind-addr`).                 |
| `machineApiBindAddr` | `str` | `"0.0.0.0:8090"` | SideroLink machine API (`--machine-api-bind-addr`).  |
| `k8sProxyBindAddr`   | `str` | `"0.0.0.0:8100"` | Kubernetes proxy (`--k8s-proxy-bind-addr`).          |
| `eventSinkPort`      | `int` | `8091`           | Event sink port (`--event-sink-port`).               |
| `wireguardPort`      | `int` | `50180`          | WireGuard UDP port.                                  |
| `metricsBindAddr`    | `str` | `"0.0.0.0:2122"` | Prometheus metrics endpoint (`--metrics-bind-addr`). |

\| `machineApiAdvertisedUrl` | `str` | `"https://api.<domain>/"` | SideroLink URL advertised to Talos machines
(`--siderolink-api-advertised-url`). | \| `k8sProxyAdvertisedUrl` | `str` | `"https://kube.<domain>/"` | Kubernetes
proxy URL advertised to clients (`--advertised-kubernetes-proxy-url`). |

> **Subdomain routing** — defaults derive both advertised URLs from `domain` (`api.<domain>` and `kube.<domain>`). Bind
> `machineApiBindAddr` and `k8sProxyBindAddr` to loopback and front them with a reverse proxy (e.g. Caddy) on port 443.
> The in-module firewall only opens port 8091 (event sink, WireGuard-internal) and the WireGuard UDP port — 8090 and
> 8100 are not opened.

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

Dex is one possible OIDC provider. Any compliant provider (Pocket-Id, Keycloak, …) works by pointing
`services.omni.oidcProviderUrl` at its issuer URL.

| Option            | Type         | Default            | Description                                      |
| ----------------- | ------------ | ------------------ | ------------------------------------------------ |
| `enable`          | `bool`       | `false`            | Enable co-located Dex.                           |
| `bindAddr`        | `str`        | `"127.0.0.1:5557"` | HTTP bind address. TLS is handled externally.    |
| `environmentFile` | `nullOr str` | `null`             | Environment file for the `dex` unit.             |
| `users`           | `list`       | `[]`               | Static users: `{ email, username, hashEnvVar }`. |

Password hashes are read from `environmentFile` at Nix eval time and baked into the Dex config. Generate with:

```sh
htpasswd -bnBC 12 "" '<password>' | tr -d ':\n'
```

## Troubleshooting

### `omni-pki-init` fails with "Permission denied"

`${dataDir}/pki` is not writable by the `omni` user. Check that the persistent volume is mounted and owned correctly.
For Proxmox LXCs, pre-create and chown the directories before first start.

### `omni-gpg-init` hangs

GPG key generation uses `/dev/random` and can block on entropy. On virtualized or container environments, install
`rng-tools` or ensure `virtio-rng` is available.

### Dex users cannot log in

Password hashes are read at Nix eval time. If the `environmentFile` was absent during `nix build`, hashes are empty and
Dex rejects authentication. Rebuild with the secrets file present.

## Dependencies

| Package | Source                                       | Purpose                               |
| ------- | -------------------------------------------- | ------------------------------------- |
| Omni    | `catalog/nix/pkgs/by-name/om/omni` (version) | Talos Linux management platform       |
| Dex     | nixpkgs                                      | OIDC identity provider (optional)     |
| OpenSSL | nixpkgs                                      | PKI initialization (CA + server cert) |
| GnuPG   | nixpkgs                                      | Etcd encryption key generation        |

## References

- [Omni documentation](https://omni.siderolabs.com)
- [Omni GitHub](https://github.com/siderolabs/omni)
- [Talos Linux](https://www.talos.dev)
- [Dex OIDC provider](https://github.com/dexidp/dex)
