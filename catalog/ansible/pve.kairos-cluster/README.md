# pve.kairos-cluster

This role sets up and configures a Kairos cluster on Proxmox Virtual Environment (PVE).

> \[!CAUTION]
> This role has only been tested for a single-node cluster and may not work as
> expected for multi-node clusters.

## Requirements

* Proxmox VE 8.3 or higher
* Ansible 2.16 or higher
* Python 3.6 or higher on the control node
* `community.general` collection for additional modules
* `proxmoxer` and `requests-toolbelt` Python packages on the control node

## Role variables

### Required variables

* *`kairos_cluster_name`*: Name of the Kairos cluster. (**required**)
* *`proxmox_host`*: Host address of the Proxmox server. (**required**)
* *`proxmox_user`*: Username for Proxmox authentication. (**required**)

### Optional variables

* *`kairos_cloudinit_hostname_prefix`*: Prefix for the hostname name. (*default: `krs`*)
* *`kairos_cloudinit_k3s`*: k3s configuration. See the [k3s documentation](https://kairos.io/docs/reference/configuration/#k3s-settings) for more information.
* *`kairos_cloudinit_user_sshkeys`*: SSH keys assigned to the kairos user. (*default: `[]`*)
* *`kairos_cpu_cores`*: Number of CPU cores to allocate to the VM. (*default: `4`*)
* *`kairos_cpu_type`*: Type of CPU to use. (*default: `host`*)
* *`kairos_disk_enable_iothread`*: Enable IO thread for disk. (*default: `false`*)
* *`kairos_disk_size`*: Size of the main disk, in gigabyte. (*default: `32`*)
* *`kairos_distribution`*: OS distribution on which Kairos is based (`alpine`, `debian`, `ubuntu`, ...). (*default: `debian-bookworm`*)
* *`kairos_memory_balloon`*: Memory ballooning setting. `0` to disable ballooning. (*default: `0`*)
* *`kairos_memory_shares`*: Memory shares setting when ballooning is enabled. (*default: `1024`*)
* *`kairos_memory`*: Amount of memory to allocate to the VM, in megabyte. (*default: `4096`*)
* *`kairos_network_bridge`*: Network bridge to use. (*default: `vmbr0`*)
* *`kairos_network_mtu`*: Network MTU setting. (*optional*)
* *`kairos_network_vlan`*: Network VLAN setting. (*optional*)
* *`kairos_start_on_boot_order`*: Boot order when the hypervisor starts. (*optional*)
* *`kairos_start_on_boot`*: Start automatically when the hypervisor starts. (*default: `false`*)
* *`kairos_version`*: Version of Kairos. (*default: `latest`*)
* *`kairos_vm_id`*: VM ID. (*default: the first available*)
* *`proxmox_disk_storage`*: Proxmox storage name where the VM disk will be stored. (*default: `local-lvm`*)
* *`proxmox_iso_storage`*: Proxmox storage name where the VM ISO will be stored. (*default: `local`*)
* *`proxmox_password`*: Password for Proxmox. (*required if `proxmox_token_id` and `proxmox_token_secret` are not set*)
* *`proxmox_token_id`*: Token ID for Proxmox. (*required if `proxmox_password` is not set*)
* *`proxmox_token_secret`*: Token secret for Proxmox. (*required if `proxmox_password` is not set*)

### Kairos bundles variables

> \[!NOTE]
> This role supports the installation of Kairos bundles. A bundle is a set of software packages
> that can be installed on a Kairos cluster. The role will configure the cloud-init script to
> configure Kairos with the specified bundles.

* *`kairos_bundles_<bundle_name>.description`*: Description of the bundle that will be displayed in Proxmox, on the VM notes. (*optional*)
* *`kairos_bundles_<bundle_name>.url`*: Bundle documentation URL that will be displayed in Proxmox, on the VM notes. (*optional*)
* *`kairos_bundles_<bundle_name>.targets`*: List of URLs to download the bundle. (*required*)
* *`kairos_bundles_<bundle_name>_config`*: Bundle configuration (*optional*).

For example, to install the `flux` bundle, you can use the following configuration:

```yaml
kairos_bundles_flux:
  description: Open and extensible continuous delivery solution for Kubernetes.
  url: https://github.com/kairos-io/community-bundles/tree/main/flux
  targets:
    - run://ghcr.io/chezmoi-sh/kairos-bundles:flux-sync # sync FluxCD configuration
kairos_bundles_flux_config:
  git:
    url: https://github.com/fluxcd/flux2-monitoring-example.git
    path: clusters/test
    branch: main
```

... that will be added to the cloud-init script as follows:

```yaml
bundles:
  - targets:
      - run://ghcr.io/chezmoi-sh/kairos-bundles:flux-sync

flux:
  git:
    url: https://github.com/fluxcd/flux2-monitoring-example.git
    path: clusters/test
    branch: main
```

## Dependencies

This role depends on the following collections:

* `community.general`

## License

This role is licensed under the Apache License, Version 2.0. See [LICENSE](../../../LICENSE) for the full license text.
