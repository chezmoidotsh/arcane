# Arcane page templates

One template per page type. Copy it, delete the comments, keep the section order. Every page ends with
`## Where to go next`. Where a page lives and how it is named is in the [style guide](style-guide.md#naming-and-navigation).

| Page type        | Template                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Guide            | [Guide](#guide), below                                                                                                                        |
| Reference        | [Reference](#reference), below                                                                                                                |
| Procedure        | [procedure-template.md](procedure-template.md), with the rules in [procedure.md](procedure.md)                                                |
| ADR              | [adr-template.md](adr-template.md), with the rules in [adr.md](adr.md)                                                                        |
| Post-mortem      | [postmortem.md](../templates/postmortem.md) or [postmortem-lite.md](../templates/postmortem-lite.md), rules in [postmortem.md](postmortem.md) |
| Experiment       | [Experiment](#experiment), below                                                                                                              |
| Project overview | [Project overview](#project-overview), below                                                                                                  |

A procedure, an ADR or a post-mortem also gets the shared frame: a title that matches the file name, a short first
paragraph, and `## Where to go next` as the last section.

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

- [Operate the cluster](Operate-Lungmen.md): day-two tasks.
- [IPAM](../reference/IPAM-Reference.md): the address plan used above.
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

- [ADR-014 Network Topology](../decisions/ADR-014-Network-Topology.md): why the network is split this way.
````

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

- [ADR-015 Migrate Crossplane To Pulumi](../decisions/ADR-015-Migrate-Crossplane-To-Pulumi.md): the decision this fed.
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

- [Recover Rhodes](../guides/Recover-Rhodes.md): disaster recovery.
````
