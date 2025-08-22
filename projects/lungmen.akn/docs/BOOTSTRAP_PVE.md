# Bootstrap on Proxmox VE

## Table of Contents

* [Introduction](#introduction)
* [Prerequisites](#prerequisites)
* [Talos Image Generation](#talos-image-generation)
* [VM Configuration](#vm-configuration)
* [Verification](#verification)
* [References](#references)

## Introduction

This guide provides a step-by-step process for deploying Talos Linux on Proxmox VE. It details the creation of a custom Talos image with essential extensions and the configuration of a virtual machine optimized for Talos Linux deployment.

## Prerequisites

Ensure you have the following before starting:

* Administrative access to a Proxmox VE cluster
* Access to the Talos Linux factory (<https://factory.talos.dev>)
* Properly configured storage pools in Proxmox VE
* Network infrastructure ready (VLANs, bridges, etc.)

## Talos Image Generation

### 1. Generate Custom Image

> \[!NOTE]
> The current configuration uses Talos Linux version 1.10.4. You can modify the version in the URL to use a different release.

Access the Talos Linux factory with these parameters:
<https://factory.talos.dev/?arch=amd64&cmdline-set=true&extensions=-&extensions=siderolabs%2Fiscsi-tools&extensions=siderolabs%2Fqemu-guest-agent&extensions=siderolabs%2Futil-linux-tools&platform=nocloud&secureboot=true&target=cloud&version=1.10.4>

<details>
<summary>Image Configuration Details</summary>

#### Schematic ID

```text
88d1f7a5c4f1d3aba7df787c448c1d3d008ed29cfb34af53fa0df4336a56040b
```

#### Customization

```yaml
customization:
    systemExtensions:
        officialExtensions:
            - siderolabs/iscsi-tools
            - siderolabs/qemu-guest-agent
            - siderolabs/util-linux-tools
```

#### Available Images

* **SecureBoot Disk Image**: <https://factory.talos.dev/image/88d1f7a5c4f1d3aba7df787c448c1d3d008ed29cfb34af53fa0df4336a56040b/v1.10.4/nocloud-amd64-secureboot.raw.xz>
* **SecureBoot ISO**: <https://factory.talos.dev/image/88d1f7a5c4f1d3aba7df787c448c1d3d008ed29cfb34af53fa0df4336a56040b/v1.10.4/nocloud-amd64-secureboot.iso>
* **SecureBoot PXE**: <https://pxe.factory.talos.dev/pxe/88d1f7a5c4f1d3aba7df787c448c1d3d008ed29cfb34af53fa0df4336a56040b/v1.10.4/nocloud-amd64-secureboot>

#### Installer Image

For installation or upgrades:

```text
factory.talos.dev/nocloud-installer-secureboot/88d1f7a5c4f1d3aba7df787c448c1d3d008ed29cfb34af53fa0df4336a56040b:v1.10.4
```

</details>

The generated image includes these essential extensions:

* siderolabs/iscsi-tools
* siderolabs/qemu-guest-agent
* siderolabs/util-linux-tools

### 2. Download and Prepare Image

1. Download the SecureBoot ISO image:
   <https://factory.talos.dev/image/88d1f7a5c4f1d3aba7df787c448c1d3d008ed29cfb34af53fa0df4336a56040b/v1.10.4/nocloud-amd64-secureboot.iso>

2. Upload to Proxmox VE:
   * Access the Proxmox VE web interface
   * Navigate to local storage (or your preferred storage location)
   * Select "Content" → "Upload"
   * Choose the downloaded ISO
   * Rename to `talos-linux.v1.10.6-amd64.iso` for consistency

## VM Configuration

Next, create a VM with the following configuration:

### 1. General Settings

| Field         | Value                        |
| ------------- | ---------------------------- |
| Node          | pve-01                       |
| VM ID         | 2411000                      |
| Name          | tal01.lungmen.akn.chezmoi.sh |
| Resource Pool | (empty)                      |

> \[!NOTE]
> The VM ID follows this format: `24XXXXX` where:
>
> `2......` indicates a VM instance (0 = LXC, 1 = VM, 9 = Templates)\
> `.4.....` indicates Talos OS (0 = unknown, 1 = Alpine, 2 = Ubuntu, 3 = Windows, 4 = Talos)\
> `..XXX..` represents the initial Talos version\
> `.....X.` indicates the cluster number\
> `......X` indicates the node instance ID
>
> Example: `2411000` represents:
>
> * VM instance (2)
> * Talos OS (4)
> * Version 1.10 (110)
> * Cluster 0
> * Node 0

### 2. OS Configuration

| Field                      | Value                         |
| -------------------------- | ----------------------------- |
| Use CD/DVD disc image file | ✔️                            |
| Storage                    | local                         |
| ISO image                  | talos-linux.v1.10.6-amd64.iso |
| Guest OS Type              | Linux                         |
| Guest OS Version           | 6.x - 2.6 Kernel              |

### 3. System Configuration

| Field           | Value                |
| --------------- | -------------------- |
| Graphic card    | Default              |
| Machine         | Default (i440fx)     |
| BIOS (Firmware) | OVMF (UEFI)          |
| Add EFI Disk    | ✔️                   |
| EFI Storage     | nvme-lvm             |
| Format          | Raw disk image (raw) |
| Pre-Enroll keys | ❌                    |
| SCSI Controller | VirtIO SCSI single   |
| Qemu Agent      | ✔️                   |
| Add TPM         | ❌                    |

### 4. Disk Configuration

#### First Disk

> \[!NOTE]
> The first disk is used for the root partition (image and ephemeral volumes)

| Field                    | Value                |
| ------------------------ | -------------------- |
| Bus/Device               | SCSI 0               |
| SCSI Controller          | VirtIO SCSI single   |
| Storage                  | nvme-lvm             |
| Disk size (GiB)          | 32                   |
| Format                   | Raw disk image (raw) |
| Cache                    | Default (No cache)   |
| Discard                  | ❌                    |
| IO thread                | ✔️                   |
| SSD Emulation (advanced) | ❌                    |

#### Second Disk

> \[!NOTE]
> The second disk is used for the data partition (longhorn volumes)

| Field                    | Value                |
| ------------------------ | -------------------- |
| Bus/Device               | SCSI 1               |
| SCSI Controller          | VirtIO SCSI single   |
| Storage                  | nvme-lvm             |
| Disk size (GiB)          | 64                   |
| Format                   | Raw disk image (raw) |
| Cache                    | Default (No cache)   |
| Discard                  | ❌                    |
| IO thread                | ✔️                   |
| SSD Emulation (advanced) | ✔️                   |

### 5. CPU Configuration

| Field   | Value         |
| ------- | ------------- |
| Sockets | 1             |
| Cores   | 4             |
| Type    | x86-64-v2-AES |

### 6. Network Configuration

| Field    | Value                    |
| -------- | ------------------------ |
| Bridge   | vmbr1                    |
| VLAN Tag | 2                        |
| Model    | VirtIO (paravirtualized) |
| MAC addr | auto                     |
| Firewall | ✔️                       |

### 7. Post Installation

Before starting, some post-installation steps are required (for metadata purposes):

1. Add these labels to the VM:

* `amd64`
* `talos-linux`

2. Add this description:

```html
<div align='center'>
# 「 龙门 」- Lungmen

<br/>

Lungmen is a personal self-hosted platform for home services, designed to provide a complete ecosystem for media
management, life organization, and automation.

<br/>

See [README](https://github.com/chezmoi-sh/arcane/blob/main/projects/lungmen.akn/README.md) for more information.

</div>
```

## Verification

After VM creation, verify:

1. Successful VM startup
2. Talos Linux boot process initiation
3. Network connectivity
4. QEMU agent responsiveness

For next steps, refer to [BOOTSTRAP\_TALOS.md](./BOOTSTRAP_TALOS.md).

## References

* [Talos Linux Documentation](https://www.talos.dev/latest/introduction/getting-started/)
* [Proxmox VE Documentation](https://pve.proxmox.com/wiki/Main_Page)
* [QEMU Guest Agent Documentation](https://wiki.qemu.org/Features/GuestAgent)

***

<div align="right">
  <a href="./BOOTSTRAP_TALOS.md">Next: BOOTSTRAP_TALOS.md</a>
</div>
