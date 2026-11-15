# omni-infra-provider-proxmox — NixOS module

NixOS module of the `omni-infra-provider-proxmox` LXC. It runs the provider that lets Omni create Talos VMs on Proxmox,
using the `omni-infra-provider-proxmox` package built from source in
`catalog/nix/pkgs/by-name/om/omni-infra-provider-proxmox`, which the LXC flake injects through
`services.omniInfraProviderProxmox.package`.

## Quick start

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

| Option                       | Type   | Default     | Description                                        |
| ---------------------------- | ------ | ----------- | -------------------------------------------------- |
| `enable`                     | `bool` | `false`     | Enable the provider.                               |
| `package`                    | `pkg`  | —           | Provider package, set by the LXC flake (required). |
| `id`                         | `str`  | `"proxmox"` | Provider ID in Omni (`--id`).                      |
| `omniApiEndpoint`            | `str`  | —           | Omni API endpoint URL (trailing slash required).   |
| `proxmox.url`                | `str`  | —           | Proxmox REST API URL.                              |
| `proxmox.username`           | `str`  | `"root"`    | Proxmox API username (`user`).                     |
| `proxmox.realm`              | `str`  | `"pam"`     | Proxmox authentication realm.                      |
| `proxmox.insecureSkipVerify` | `bool` | `false`     | Skip TLS verification (self-signed certs only).    |

The provider is stateless with no inbound ports. It connects outbound to Omni and Proxmox. Secrets (Proxmox password,
Omni service account key) are baked into the image at build time via `_module.args`.

## Troubleshooting

### Provider not appearing in Omni UI

Verify `omniApiEndpoint` matches the Omni URL exactly (including trailing slash). Check that `OMNI_SERVICE_ACCOUNT_KEY`
is set in the environment file.

## References

- [omni-infra-provider-proxmox](https://github.com/siderolabs/omni-infra-provider-proxmox)
- [Omni documentation](https://omni.siderolabs.com)
