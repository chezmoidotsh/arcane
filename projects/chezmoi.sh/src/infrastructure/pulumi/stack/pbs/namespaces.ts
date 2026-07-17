import * as pbs from "@pulumi/pbs";

import { backupsDatastore } from "./datastore";

// -----------------------------------------------------------------------------
// Namespaces -- separate the two backup workloads sharing this datastore
// -----------------------------------------------------------------------------
// PBS namespaces are a path prefix within a datastore (`<store>:<namespace>`),
// not a separate storage location -- same S3 bucket, same GC, independent
// prune/verify scoping if a job's own `namespace` filter targets one of them
// (see ./jobs.ts; both jobs are currently datastore-wide, covering every
// namespace). Splitting `vms`/`pvcs` up front means job scoping, browsing,
// and access control can be tightened per workload later without moving any
// data around.
//
// `vms`: whole-VM backups Proxmox VE's own storage integration pushes for
// the `talos` pool.
export const vmsNamespace = new pbs.Namespace(
	"pbs-namespace-vms",
	{
		store: backupsDatastore.name,
		namespace: "vms",
		// comment: "Whole-VM backups (Proxmox VE talos pool)",
	},
	{ parent: backupsDatastore },
);

// `kubernetes-volumes`: per-volume backups of the individual CSI-provisioned
// virtual disks backing Kubernetes PersistentVolumeClaims -- finer-grained
// than `vms`, useful for restoring a single workload's data without a full
// VM restore.
export const pvcsNamespace = new pbs.Namespace(
	"pbs-namespace-kubernetes-volumes",
	{
		store: backupsDatastore.name,
		namespace: "kubernetes-volumes",
		// comment: "Per-volume backups of CSI-provisioned PersistentVolumeClaims",
	},
	{ parent: backupsDatastore },
);
