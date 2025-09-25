# TrueNAS Scale Ansible Collection

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![TrueNAS Scale](https://img.shields.io/badge/TrueNAS-Scale-green)
![Ansible](https://img.shields.io/badge/Ansible-2.9+-red)

This collection provides Ansible modules for managing TrueNAS Scale systems, with a focus on essential dataset management and core services.

## 🔄 Fork Rationale

This collection is a **focused fork** of the excellent [arensb.truenas](https://github.com/arensb/ansible-truenas) collection, adapted specifically for TrueNAS Scale environments and critical infrastructure use cases.

### Why Fork?

#### 🎯 **TrueNAS Scale Compatibility**

* **Original Challenge**: The original collection supports both TrueNAS CORE and Scale, but has some compatibility issues with Scale-specific middleware changes
* **Our Solution**: Focused exclusively on TrueNAS Scale with `midclt` as the only communication method
* **Benefit**: Guaranteed compatibility with TrueNAS Scale's middleware architecture

#### 🛡️ **Critical Infrastructure Control**

* **Need**: NAS systems are critical infrastructure components requiring absolute reliability
* **Approach**: Full control over the codebase allows for:
  * Custom validation and error handling
  * Immediate fixes for Scale-specific issues
  * Controlled updates aligned with infrastructure needs
  * Security audits and compliance requirements

#### 🚀 **Streamlined Operations**

* **Focus**: Essential operations for dataset management and core services
* **Excluded**: Complex operations better handled through TrueNAS WebUI:
  * Certificate management (context-dependent)
  * Hardware monitoring (SMART tests)
  * Network interface configuration (infrastructure-specific)
  * Service management (manual verification preferred)
  * System maintenance tasks (scrub scheduling)

### Key Differences from Original

| Aspect                 | Original (arensb.truenas)  | This Fork (chezmoidotsh.truenas\_scale) |
| ---------------------- | -------------------------- | --------------------------------------- |
| **Communication**      | HTTP API + midclt          | midclt only                             |
| **Scope**              | Full feature set           | Essential operations only               |
| **Dataset Management** | Single `filesystem` module | Separate `dataset` and `zvol` modules   |
| **Target Platform**    | TrueNAS CORE + Scale       | TrueNAS Scale only                      |
| **Maintenance**        | Community-driven           | Infrastructure-specific                 |

## 🏗️ Architecture

### Module Organization

```text
plugins/modules/
├── user.py                 # User account management
├── group.py                # Group management  
├── dataset.py              # ZFS datasets (FILESYSTEM)
├── zvol.py                 # ZFS volumes (VOLUME)
├── sharing_nfs.py          # NFS share configuration
├── sharing_smb.py          # SMB share configuration
├── truenas_facts.py        # System information gathering
└── pool_snapshot_task.py   # Snapshot task management
```

### Communication Layer

* **Exclusive midclt usage**: All modules communicate via the `midclt` command-line tool
* **No HTTP API dependency**: Eliminates potential REST API compatibility issues
* **Native Scale integration**: Leverages TrueNAS Scale's preferred middleware interface

## 📦 Installation

### Local Collection

This collection is designed for local use within infrastructure-as-code repositories:

```yaml
# ansible.cfg
[defaults]
collections_paths = ./catalog/ansible/modules
```

### Requirements

* **TrueNAS Scale**: 22.02 or later
* **Ansible**: 2.9 or later
* **Python**: 3.8+ on TrueNAS Scale system
* **Access**: SSH access to TrueNAS Scale with sudo privileges

## 🚀 Usage Examples

### Dataset Management

```yaml
- name: Create ZFS dataset
  chezmoidotsh.truenas_scale.dataset:
    name: pool/data/documents
    compression: lz4
    recordsize: 128K
    quota: 100GB

- name: Create ZFS volume for VM
  chezmoidotsh.truenas_scale.zvol:
    name: pool/vms/ubuntu-01
    volsize: 50GB
    volblocksize: 64K
```

### User and Group Management

```yaml
- name: Create service user
  chezmoidotsh.truenas_scale.user:
    name: mediaserver
    group: media
    home: /mnt/pool/services/media
    shell: /usr/sbin/nologin

- name: Create media group
  chezmoidotsh.truenas_scale.group:
    name: media
    gid: 8675309
```

### Sharing Configuration

```yaml
- name: Configure NFS export
  chezmoidotsh.truenas_scale.sharing_nfs:
    path: /mnt/pool/shared
    comment: "Shared storage"
    networks:
      - 192.168.1.0/24
    
- name: Configure SMB share
  chezmoidotsh.truenas_scale.sharing_smb:
    name: documents
    path: /mnt/pool/data/documents
    comment: "Document storage"
```

## 🔒 Security Considerations

### Access Control

* **Principle of least privilege**: Modules only expose necessary functionality
* **Input validation**: Comprehensive parameter validation and sanitization
* **Error handling**: Detailed error messages without exposing sensitive information

### Audit Trail

* **Change tracking**: All module executions are logged via Ansible
* **State management**: Idempotent operations with clear state reporting
* **Rollback capability**: Support for configuration rollback through version control

## 🛠️ Development

### Testing

```bash
# Syntax validation
ansible-playbook --syntax-check playbook.yml

# Dry run
ansible-playbook --check playbook.yml

# Execution with verbose logging
ansible-playbook -vvv playbook.yml
```

### Contributing

This is a focused fork for specific infrastructure needs. For general TrueNAS Ansible support, please consider contributing to the original [arensb.truenas](https://github.com/arensb/ansible-truenas) collection.

## 📄 License

This collection is licensed under the Apache 2.0 License, maintaining compatibility with the original work.

## 🙏 Acknowledgments

This work is built upon the excellent foundation provided by:

* **Andrew Arensburger** - Original collection creator
* **Ed Hull** - Significant contributions
* **Steven Ellis** - Core functionality development
* **Paul Heidenreich** - Feature development
* **Gustavo Campos** - Module enhancements
* **kamransaeed** - Bug fixes and improvements

All original copyright notices and attribution have been preserved in the source code.

## 📞 Support

This collection is maintained for specific infrastructure requirements. For general TrueNAS Ansible support, please refer to:

* [Original Collection](https://github.com/arensb/ansible-truenas)
* [TrueNAS Forums](https://www.truenas.com/community/)
* [TrueNAS Documentation](https://www.truenas.com/docs/)

For infrastructure-specific issues, please use the project's issue tracking system.
