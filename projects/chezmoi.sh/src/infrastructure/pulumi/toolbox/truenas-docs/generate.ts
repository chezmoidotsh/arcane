import {
	buildDatasetTree,
	collectDatasetRows,
	type DatasetTree,
	fetchDatasets,
	fetchTopology,
	renderRows,
	type TrueNASDataset,
	type TrueNASDatasetInfo,
	TrueNASTopology,
} from "@chezmoi.sh/pulumi-truenas-pool";
import * as fs from "fs";
import * as path from "path";

import {
	computeNotBackedUpPools,
	extractAclAssignments,
	extractAclTemplates,
	extractBuckets,
	extractCloudSyncJobs,
	extractIdentities,
	extractLegacyGlobalSync,
	extractNetwork,
	extractNfsShares,
	extractPoolNames,
	extractScrubTasks,
	extractServices,
	extractSmbShares,
	extractSnapshotTasks,
	resourcesOfType,
} from "./extract";
import { humanList } from "./helpers";
import { render } from "./render";
import {
	type ExportedResource,
	readConfig,
	readStackExport,
} from "./stack-export";

// -----------------------------------------------------------------------------
// Regenerates `projects/chezmoi.sh/docs/TRUENAS.md` from the *deployed*
// `chezmoi_sh.live` stack state -- run standalone (`mise run
// truenas:docs:generate`, chained onto `pulumi:apply`), not as part of
// `pulumi up`/`preview` itself. See `./extract.ts` for how resource state
// becomes plain data, and `../../stack/truenas/index.ts` for the one section
// (NFS4 ACL assignments) that has no infrastructure resource of its own and
// so travels as a stack output instead.
// -----------------------------------------------------------------------------

/** Flattens a live `pool.dataset.query` result into a lookup keyed by full dataset name (e.g. `zp1cs01/media/inbox`), regardless of its own nesting. */
function flattenLiveDatasets(
	nodes: TrueNASDatasetInfo[],
	acc: Map<string, TrueNASDatasetInfo> = new Map(),
): Map<string, TrueNASDatasetInfo> {
	for (const node of nodes) {
		acc.set(node.name, node);
		if (node.children) flattenLiveDatasets(node.children, acc);
	}
	return acc;
}

/** Attaches live dataset state onto a `TrueNASDataset` tree built by `buildDatasetTree`, matched by full pool-relative name -- the same matching `TrueNASPool.datasetsTree()` itself uses. */
function attachLive(
	node: TrueNASDataset,
	fullPath: string,
	liveByName: Map<string, TrueNASDatasetInfo>,
): void {
	node.live = liveByName.get(fullPath);
	for (const child of node.children) {
		attachLive(child, `${fullPath}/${child.path}`, liveByName);
	}
}

interface PoolDoc {
	name: string;
	topology: string;
	datasetsTree: string;
}

/**
 * Renders one pool's topology diagram + dataset tree, both fetched live from
 * the NAS (never from Pulumi state -- see `@chezmoi.sh/pulumi-truenas-pool`'s
 * own README for why). The dataset tree is filtered down to exactly the
 * datasets this stack manages (`truenas:index/dataset:Dataset` resources
 * whose own `pool` output matches `poolName`), matching what
 * `TrueNASPool.datasetsTree()` already shows today -- a dataset that exists
 * physically on the NAS but isn't Pulumi-managed stays invisible here too.
 */
async function buildPoolDoc(
	poolName: string,
	resources: ExportedResource[],
	url: string,
	apiKey: string,
): Promise<PoolDoc> {
	const { pool, disks } = await fetchTopology(url, apiKey, poolName);
	const topology = new TrueNASTopology(pool, disks).toString();

	// Sorted so sibling datasets at the same depth render in a stable order
	// across reruns -- `pulumi stack export`'s own resource order reflects
	// incidental state-file order, not a curated one.
	const managedFullPaths = resourcesOfType(
		resources,
		"truenas:index/dataset:Dataset",
	)
		.filter((r) => r.outputs?.pool === poolName)
		.map((r) => (r.outputs?.mountPoint as string).replace(/^\/mnt\//, ""))
		.sort();

	const tree: DatasetTree = Object.fromEntries(
		managedFullPaths.map((full) => [`/${full.slice(poolName.length + 1)}`, {}]),
	);
	const roots = buildDatasetTree(tree);

	const live = await fetchDatasets(url, apiKey, poolName);
	const liveByName = flattenLiveDatasets(live);
	for (const root of roots) {
		attachLive(root, `${poolName}/${root.path}`, liveByName);
	}

	const rows = roots.flatMap((node, i) =>
		collectDatasetRows(node, "", i === roots.length - 1),
	);
	const datasetsTree = [poolName, renderRows(rows)].filter(Boolean).join("\n");

	return { name: poolName, topology, datasetsTree };
}

async function main(): Promise<void> {
	// `toolbox/truenas-docs` -> project root (where Pulumi.yaml lives), resolved
	// from this file's own location so it doesn't depend on the caller's cwd.
	const projectRoot = path.resolve(__dirname, "../..");

	const exported = readStackExport(projectRoot);
	const resources = exported.deployment.resources;
	const stackOutputs =
		resources.find((r) => r.type === "pulumi:pulumi:Stack")?.outputs ?? {};

	const url = readConfig(projectRoot, "truenas:url");
	const apiKey = readConfig(projectRoot, "truenas:apiKey");

	const poolNames = extractPoolNames(resources);
	const pools = await Promise.all(
		poolNames.map((name) => buildPoolDoc(name, resources, url, apiKey)),
	);

	const jobs = extractCloudSyncJobs(resources);
	const legacyGlobalSync = extractLegacyGlobalSync(resources);

	const context = {
		pools,
		// `poolsList` is pre-formatted (not left to the template) so its backticks
		// survive Handlebars' default HTML-escaping of `{{ }}` expressions --
		// `{{{poolsList}}}` (triple-stache) renders it unescaped.
		poolsList: humanList(poolNames.map((name) => `\`${name}\``)),
		nfsShares: extractNfsShares(resources),
		smbShares: extractSmbShares(resources),
		network: extractNetwork(resources),
		scrubTasks: extractScrubTasks(resources),
		snapshotTasks: extractSnapshotTasks(resources),
		backups: {
			destination: "Backblaze B2",
			jobs,
			legacyGlobalSync,
			buckets: extractBuckets(resources),
		},
		notBackedUpPools: computeNotBackedUpPools(
			poolNames,
			jobs,
			legacyGlobalSync,
		),
		...extractServices(resources),
		identities: extractIdentities(resources),
		aclTemplates: extractAclTemplates(resources),
		aclAssignments: extractAclAssignments(stackOutputs),
	};

	const docPath = path.resolve(projectRoot, "../../../docs/TRUENAS.md");
	fs.writeFileSync(docPath, render(context));
	console.log(`Wrote ${docPath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
