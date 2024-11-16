# Disaster Recovery Plan

## Introduction

The purpose of this document is to outline the steps and procedures necessary to recover from a disaster affecting
our systems. A Disaster Recovery Plan (DRP) is a documented, structured approach with instructions for responding to
unplanned incidents. This plan covers essential aspects such as hardware recovery, service restoration, and
infrastructure deployment to ensure continuity and minimize downtime.

This document is a living document and should be updated regularly to reflect changes in the system architecture,
new services, and lessons learned from testing and actual recovery scenarios.

## Scope

The scope of this document is limited to the recovery of the **nex·rpi** instance and its services. The **nex·rpi**
instance is the core of our system and contains all the necessary services to operate the rest of the system.

## Procedures

> \[!NOTE]
> The following procedures are not fully tested yet. They are just a draft of the potential steps that need to
> be taken in case of a disaster.\
> All commands that can be run on your local machine are compatible with the [`runme`](https://runme.dev/) CLI.

### 1. **nex·rpi** Disaster Recovery

Firstly, we need to recover the *nex·rpi* instance before anything else because it contains all the necessary
services that are required for the rest of the system to function properly *(aka. critical services)*.

#### 1.1. **nex·rpi** hardware recovery

In case of a hardware failure, we need to recover the **nex·rpi** instance by following the
[nex·rpi installation guide](projects/nex.rpi/docs/INSTALLATION.md).

#### 1.2. **nex·rpi** services and infrastucture recovery

When the **nex·rpi** instance is up and running, we need to bootstrap and deploy all the **nex·rpi** services.

1. Bootstrap the **nex·rpi** Kubernetes instance:

   ```bash {"category":"disaster-recovery-plan","name":"DRP/nex·rpi (bootstrap)"}
   pushd ${ATLAS_DIR}/projects/nex.rpi
   just kubernetes bootstrap
   popd
   ```

2. Deploy all the **nex·rpi** services:

   ```bash {"category":"disaster-recovery-plan","name":"DRP/nex·rpi"}
   pushd ${ATLAS_DIR}/projects/nex.rpi
   just kubernetes force-apply
   popd
   ```

3. Deploy all "static" secrets:

   ```bash {"category":"disaster-recovery-plan","name":"DRP/vault.chezmoi.sh"}
   pushd ${ATLAS_DIR}/projects/chezmoi.sh

   just vault generate-applyset || true

   just vault decrypt
   just vault sync
   popd
   ```

4. Deploy the **chezmoi.sh** infrastructure *(required by nex·rpi)*:

   ```bash {"category":"disaster-recovery-plan","name":"DRP/chezmoi.sh (crossplane)"}
   pushd ${ATLAS_DIR}/projects/chezmoi.sh
   just crossplane generate-applyset || true
   just crossplane force-apply
   popd
   ```

5. Deploy the **nex·rpi** infrastructure\*:
   ```bash {"category":"disaster-recovery-plan","name":"DRP/nex·rpi (crossplane)"}
   pushd ${ATLAS_DIR}/projects/nex.rpi
   just crossplane generate-applyset || true
   just crossplane force-apply
   popd
   ```
