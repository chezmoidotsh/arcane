# Arcane wiki page templates

One skeleton per page type. Copy the one that fits, delete the comments, keep the section order. Every page ends with
`## Where to go next`. The rules behind them are in [style-guide.md](style-guide.md).

| Page type        | File name                        | Template                              |
| ---------------- | -------------------------------- | ------------------------------------- |
| Guide            | `Verb-Phrase.md`                 | [Guide](#guide)                       |
| Reference        | `Topic-Reference.md`             | [Reference](#reference)               |
| Procedure        | `Procedure-<ID>-Verb-Phrase.md`  | [Procedure](#procedure)               |
| ADR              | `ADR-NNN-Title.md`               | [ADR](#adr)                           |
| Post-mortem      | `Incident-YYYY-MM-DD-Title.md`   | [Post-mortem](#post-mortem)           |
| Experiment       | `Experiment-YYYY-MM-DD-Title.md` | [Experiment](#experiment)             |
| Project overview | `Project-<name>.md`              | [Project overview](#project-overview) |

Procedures, ADRs and post-mortems keep the detailed structure described in [procedure.md](procedure.md), [adr.md](adr.md) and
[postmortem.md](postmortem.md). The skeletons below fix the frame around them: title, short version, and `Where to go next`.

## Guide

A guide takes a reader from a starting point to a result. It links to references for values.

````markdown
# Bootstrap Lungmen

<!-- Short version: what the reader will have at the end, in one or two sentences. -->

Bring up the `lungmen.akn` cluster from an empty Proxmox host to a synced ArgoCD. About 45 minutes.

## Before you start

<!-- Prerequisites as a list or table: access, tools, state. Link, do not explain. -->

## Steps

### 1. Create the cluster in Omni

<!-- Command first, then what to expect, then what to do if it differs. -->

```sh
omnictl cluster template sync -f projects/lungmen.akn/src/infrastructure/omni/lungmen.clustertemplate.yaml
```

## Check the result

<!-- One command whose output proves the guide worked. -->

## Where to go next

- [Operate the cluster](Operate-Lungmen): day-two tasks.
- [IPAM](IPAM-Reference): the address plan used above.
````

## Reference

A reference answers "what is the value of X?". It is a table or a list, not a story, and it is the only place that states
those values.

````markdown
# IPAM Reference

<!-- Short version: what this page is the source of truth for. -->

Address plan for every VLAN and pool in the homelab. Verified against Proxmox SDN on 2026-10-11.

## VLANs

| VLAN | CIDR | Purpose |
| ---- | ---- | ------- |

## Where to go next

- [ADR-014 Network Topology](ADR-014-Network-Topology): why the network is split this way.
````

## Procedure

For a repeatable operation. Keep the structure from `.agents/skills/documentation-writer/references/procedure-template.md`
(metadata, prerequisites, numbered steps with expected output, rollback, history) and add the frame:

````markdown
# Procedure BKP-20260723-00 Restore CNPG From Object Store

<!-- Short version: when to use it and how long it takes. Then the sections of procedure.md. -->

## Where to go next

- [Incident 2026-05-30 CNPG WAL Disk Full](Incident-2026-05-30-CNPG-WAL-Disk-Full): a case where it was needed.
````

## ADR

Keep the front matter and sections from `.agents/skills/documentation-writer/references/adr-template.md`. A moved ADR keeps its
number, title, decision and changelog; only the frame is added.

````markdown
---
status: accepted
date: 2026-07-02
---

# ADR-015 Migrate Crossplane To Pulumi

<!-- sections from adr.md: Context, Decision, Consequences, Changelog -->

## Where to go next

- [ADR-014 Network Topology](ADR-014-Network-Topology): the decision this one builds on.
````

## Post-mortem

Keep the front matter and sections from `.agents/skills/documentation-writer/templates/postmortem.md` untouched (the scripts in
`.github/scripts/postmortem-*.py` read the front matter).

## Experiment

An experiment records a question, what was tried and what was concluded. The code stays in the repository.

````markdown
# Experiment 2026-06-17 Proxmox CSI And CCM

<!-- Short version: the question and the conclusion in two sentences. -->

## Question

## Setup

<!-- Link to the code in the repository, do not paste it. -->

## Results

## Conclusion

<!-- Adopted, rejected or inconclusive, and the ADR or issue it fed. -->

## Where to go next

- [ADR-015 Migrate Crossplane To Pulumi](ADR-015-Migrate-Crossplane-To-Pulumi): the decision this fed.
````

## Project overview

One per project under `projects/`. It states what the project is and links to everything operational. The project
`README.md` stays next to the code and links here.

````markdown
# Project rhodes.akn

<!-- Short version: what the project runs and who depends on it. -->

## What it runs

| Concern | Component |
| ------- | --------- |

## Operate it

| Task | Page |
| ---- | ---- |

## Where to go next

- [Recover Rhodes](Recover-Rhodes): disaster recovery.
````
