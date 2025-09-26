# Ansible Role: TrueNAS Audit Report

This role performs comprehensive state extraction and documentation for TrueNAS systems. It generates detailed YAML reports containing complete infrastructure configuration data for documentation, disaster recovery planning, and system analysis.

## Requirements

* TrueNAS Scale system with SSH access
* Python 3 on the control machine
* `midctl` command available on target system (included with TrueNAS Scale)

## Role Variables

Available variables are listed below, along with default values (see `defaults/main.yml`):

```yaml
# Output directory for generated reports (relative to playbook directory)
output_dir: "{{ playbook_dir }}/output"
```

## Dependencies

None.

## Example Playbook

```yaml
- hosts: truenas
  become: false
  gather_facts: true
  
  roles:
    - role: truenas.audit_report
```

## Example Inventory

```yaml
all:
  children:
    truenas:
      hosts:
        nas.example.com:
          ansible_host: nas.example.com
          ansible_user: root
          ansible_connection: ssh
          ansible_ssh_common_args: "-o StrictHostKeyChecking=no"
```

## Generated Output

The role generates comprehensive YAML reports containing:

* **System Information**: Hostname, version, uptime, timezone, services
* **Storage Infrastructure**: Physical disks with pool associations and hardware details
* **ZFS Pools**: Pool status, topology, and disk mapping with device identifiers
* **Dataset Hierarchy**: Recursive ZFS dataset tree with properties and integrated ACLs
* **Access Control**: Simplified ACL entries with user/group name resolution
* **Backup Configuration**: Snapshot tasks, replication, cloud sync, and rsync jobs
* **Network Shares**: SMB and NFS share configurations
* **User Management**: Local users and groups (non-system accounts)

### Sample Report Structure

```yaml
system:
  hostname: TrueNAS-Scale
  version: "25.04.2.1"
  uptime: "2 days, 23:10:58"
  
disks:
  - name: sda
    serial: "S6PUNM0T515508X"
    size: 931.5GB
    type: SSD
    model: Samsung_SSD_870_EVO_1TB
    pools: ["tank"]
    
zpools:
  tank:
    status: ONLINE
    healthy: true
    topology:
      data:
        - type: MIRROR
          disks:
            - uuid: "9759cb72-efd6-4fd9-9930-fea7b2476634"
              device: sda
              serial: "S6PUNM0T515508X"
              status: ONLINE

datasets:
  tank:
    compression: LZ4
    mountpoint: /mnt/tank
    type: FILESYSTEM
    acl:
      type: nfs4
      custom: true
      permissions:
        - who: group:administrators
          access: rwx
          flags: inherit
    datasets:
      media:
        compression: LZ4
        quota: 500GB
        datasets: {}
```

## Data Processing Features

This role includes several Python scripts that process raw TrueNAS data:

* **Disk-to-Pool Mapping**: Links physical disks to ZFS pools using device identifiers
* **ACL Simplification**: Converts complex ACL structures to human-readable format with user/group name resolution
* **Size Formatting**: Converts byte values to human-readable sizes (TB/GB/MB/KB)
* **Hierarchy Building**: Creates recursive dataset trees preserving ZFS structure
* **Data Cleaning**: Filters out inherit/none/null values for cleaner output

## Use Cases

* **Infrastructure Documentation**: Generate comprehensive system documentation
* **Disaster Recovery Planning**: Create detailed configuration snapshots
* **System Migration**: Document source system before migration
* **Compliance Auditing**: Generate audit reports for compliance requirements
* **AI-Assisted Operations**: Provide structured data for AI/LLM analysis
* **Change Management**: Track configuration changes over time

## License

MIT / BSD

## Author Information

This role was created as part of the [Arcane](https://github.com/chezmoidotsh/arcane) homelab infrastructure project.
