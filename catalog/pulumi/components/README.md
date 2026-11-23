# `catalog/pulumi/components/`

Shared Pulumi `ComponentResource` packages. A fleet project declares the ones it uses as `workspace:*` dependencies in
its `pulumi/package.json` (see [`catalog/pulumi/`](../README.md) for the workspace layout).

| Component                                                        | Package                                       | Role                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`cloudflare-dns01-token`](cloudflare-dns01-token/README.md)     | `@chezmoi.sh/pulumi-cloudflare-dns01-token`   | Cloudflare account token scoped to Zone Read + DNS Edit on one zone, for ACME DNS-01 solvers |
| [`cluster-vault`](cluster-vault/README.md)                       | `@chezmoi.sh/pulumi-cluster-vault`            | OpenBao KV mount, Kubernetes auth backend, policy and ESO role of one cluster                |
| [`garage-cnpg-backup`](garage-cnpg-backup/README.md)             | `@chezmoi.sh/pulumi-garage-cnpg-backup`       | Garage S3 bucket and read/write key for CloudNative-PG backups                               |
| [`proxmox-cluster-identity`](proxmox-cluster-identity/README.md) | `@chezmoi.sh/pulumi-proxmox-cluster-identity` | Proxmox VE role, user, API token and ACLs for one Kubernetes cluster integration             |
| [`sops-file`](sops-file/README.md)                               | `@chezmoi.sh/pulumi-sops-file`                | Read and write a whole SOPS-encrypted JSON file                                              |
| [`truenas-pool`](truenas-pool/README.md)                         | `@chezmoi.sh/pulumi-truenas-pool`             | ZFS dataset tree on an existing TrueNAS pool                                                 |

Apart from `sops-file`, whose job is to write a file, a component never writes a value outside the Pulumi state (no
OpenBao secret, no Kubernetes `Secret`): the project that uses it does, next to the call, so every output of a stack
stays visible in the stack's own code.
