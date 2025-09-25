# Ansible Role: Application Datasets

Creates complete storage infrastructure for TrueNAS applications including ZFS datasets, service accounts, and secure SMB shares.

## Overview

This role provides a standardized approach to setting up application storage on TrueNAS Scale by automating the creation of:

1. **ZFS Dataset** with optimized properties for the application type
2. **Service Account** (user/group) with security hardening
3. **SMB Share** with authentication and stealth configuration
4. **ACL Management** (planned - currently in development)

The role follows a convention-over-configuration approach, requiring minimal input while providing comprehensive customization options through dataset overrides.

## Requirements

* TrueNAS Scale system with SSH root access
* `chezmoidotsh.truenas_scale` Ansible collection
* Python 3 on the control machine

## Role Variables

### Required Variables

```yaml
# Parent dataset path (must already exist)
application_root_dataset: "tank/applications"

# Application identification
application_name: "MyApp"        # Application name (required)
application_uid: 2000            # User/Group UID/GID
```

### Optional Variables

```yaml
# Dataset customization
application_dataset_overrides: {}  # ZFS property overrides
state: present                     # present|absent (default: present)
```

## Dataset Property Overrides

The `application_dataset_overrides` parameter accepts any ZFS dataset property. Below are the most commonly used properties organized by category:

### Storage & Performance

```yaml
quota: "50G"              # Maximum space limit
refquota: "40G"           # Space limit excluding snapshots
reservation: "10G"        # Guaranteed minimum space
recordsize: "1M"          # Block size optimization
```

### Compression & Efficiency

```yaml
compression: "ZSTD-3"     # Compression algorithm
# Options: LZ4 (fast, low CPU), ZSTD-3 (balanced), GZIP-6 (high compression)
deduplication: on         # Remove duplicate blocks (CPU intensive)
copies: 2                 # Number of data copies (1-3)
```

### Access & Security

```yaml
atime: off                # Disable access time tracking (performance)
exec: off                 # Disable binary execution (security)
readonly: on              # Make dataset read-only
```

### Data Integrity

```yaml
sync: "ALWAYS"            # Write synchronization
# Options: STANDARD (balanced), ALWAYS (integrity), DISABLED (performance)
checksum: "SHA256"        # Checksum algorithm
```

## Application-Specific Examples

### Photo/Video Storage (Immich, PhotoPrism)

```yaml
application_dataset_overrides:
  recordsize: "1M"          # Optimized for large media files
  compression: "LZ4"        # Fast compression for media
  quota: "500G"             # Storage limit
  atime: off                # Performance optimization
```

### Database Applications (PostgreSQL, MySQL)

```yaml
application_dataset_overrides:
  recordsize: "16K"         # Database page size alignment
  sync: "ALWAYS"            # Maximum data integrity
  compression: "ZSTD-3"     # Better compression for structured data
  copies: 2                 # Data redundancy
```

### Backup Storage (Restic, Borg)

```yaml
application_dataset_overrides:
  compression: "ZSTD-3"     # High compression for backups
  deduplication: on         # Remove duplicate backup blocks
  recordsize: "1M"          # Large backup file optimization
  quota: "1T"               # Backup space allocation
```

### Development/Build Storage

```yaml
application_dataset_overrides:
  recordsize: "128K"        # Mixed file sizes
  compression: "LZ4"        # Fast compression for builds
  atime: off                # Performance for frequent access
  exec: on                  # Allow binary execution
```

## Security Features

The role implements security hardening by default:

### Service Account Security

* **No-login shell** (`/usr/sbin/nologin`) prevents interactive access
* **No home directory** (`/nonexistent`) prevents home directory attacks
* **Explicit group management** avoids privilege escalation
* **SMB authentication enabled** for network access

### SMB Share Security

* **Not browsable** (stealth mode) - hidden from network discovery
* **No guest access** - authentication required
* **User-specific access** (planned with ACL implementation)

## Example Playbooks

### Basic Application Setup

```yaml
- hosts: truenas
  tasks:
    - name: Configure Nextcloud storage
      ansible.builtin.import_role:
        name: application_datasets
      vars:
        application_root_dataset: "tank/applications"
        application_name: "Nextcloud"
        application_uid: 30001
```

### Advanced Configuration with Overrides

```yaml
- hosts: truenas
  tasks:
    - name: Configure Immich photo storage
      ansible.builtin.import_role:
        name: application_datasets
      vars:
        application_root_dataset: "storage/apps"
        application_name: "Immich"
        application_uid: 30002
        application_dataset_overrides:
          recordsize: "1M"
          compression: "LZ4"
          quota: "2T"
          atime: off
```

### Remove Application Storage

```yaml
- hosts: truenas
  tasks:
    - name: Remove old application
      ansible.builtin.import_role:
        name: application_datasets
      vars:
        application_root_dataset: "tank/applications"
        application_name: "OldApp"
        application_uid: 30003
        state: absent
```

## Tags

Selective execution is supported through the following tags:

* `datasets` - ZFS dataset operations only
* `users` - User and group management only
* `shares` - SMB share configuration only
* `applications` - All application-related tasks (default)
* `smb` - SMB-specific operations

### Tag Usage Examples

```bash
# Create only the dataset
ansible-playbook playbook.yaml --tags datasets

# Configure users and SMB shares
ansible-playbook playbook.yaml --tags users,shares

# Full application setup
ansible-playbook playbook.yaml --tags applications
```

## Generated Resources

The role automatically creates standardized resources:

| Resource Type  | Generated Name/Path                    | Description                        |
| -------------- | -------------------------------------- | ---------------------------------- |
| **Dataset**    | `{root_dataset}/{app_name_lower}`      | ZFS dataset with custom properties |
| **User**       | `{app_name_lower}`                     | Service account with UID           |
| **Group**      | `{app_name_lower}`                     | Primary group with GID             |
| **SMB Share**  | `application-{app_name_lower}`         | Secure network share               |
| **Mount Path** | `/mnt/{root_dataset}/{app_name_lower}` | Dataset mount point                |

### Example: Immich Application

```yaml
# Input variables
application_root_dataset: "tank/applications"
application_name: "Immich"
application_uid: 30001

# Generated resources
Dataset: tank/applications/immich
User/Group: immich (UID/GID: 30001)
SMB Share: application-immich
Mount Path: /mnt/tank/applications/immich
Comment: "Immich application storage"
```

## Planned Features

### ACL Management (In Development)

Future versions will include comprehensive ACL management:

* NFSv4 ACLs with inheritance control
* Fine-grained permission management
* Audit trail support
* Integration with SMB user restrictions

## Dependencies

This role has no external dependencies beyond the required Ansible collection.

## Compatibility

* **TrueNAS Scale**: All versions
* **Ansible**: 2.1+
* **Python**: 3.x on control machine

## License

Apache-2.0

## Author Information

This role was created by Alexandre Nicolaie as part of the [Arcane](https://github.com/chezmoidotsh/arcane) homelab infrastructure project.

For issues and contributions, please visit the project repository.
