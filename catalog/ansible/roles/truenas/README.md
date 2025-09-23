# TrueNAS Ansible Roles

This directory contains Ansible roles specific to TrueNAS management and operations.

## Available Roles

### `audit_report`

Comprehensive TrueNAS state extraction and documentation role. Creates detailed YAML reports of the complete NAS configuration including:

* System information and services
* ZFS pools and dataset hierarchies
* Disk topology and hardware details
* ACLs with user/group name resolution
* Backup configuration (snapshots, replication, sync tasks)
* SMB/NFS shares and network configuration

**Use cases:**

* Infrastructure documentation for humans and AI assistants
* Disaster recovery planning
* System migration preparation
* Compliance and audit requirements
