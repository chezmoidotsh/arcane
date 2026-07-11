// -----------------------------------------------------------------------------
// `TrueNASPool`: groups a `TrueNASDataset` tree under an existing physical
// pool, and is the only place that actually reaches out to TrueNAS over
// JSON-RPC (see ./truenas-api) -- `topology()`/`datasetsTree()` fetch once,
// then delegate all rendering to ./topology and ./dataset respectively.
// -----------------------------------------------------------------------------

import * as pulumi from "@pulumi/pulumi";

import { collectDatasetRows, renderRows, type TrueNASDataset } from "./dataset";
import { TrueNASTopology } from "./topology";
import {
	fetchDatasets,
	fetchTopology,
	type TrueNASDatasetInfo,
} from "./truenas-api";

/** Flattens a `pool.dataset.query` tree into a lookup keyed by full dataset name (e.g. `zp1cs01/media/inbox`). */
function flattenDatasetInfo(
	datasets: TrueNASDatasetInfo[],
	acc: Map<string, TrueNASDatasetInfo> = new Map(),
): Map<string, TrueNASDatasetInfo> {
	for (const ds of datasets) {
		acc.set(ds.name, ds);
		if (ds.children) flattenDatasetInfo(ds.children, acc);
	}
	return acc;
}

/**
 * Groups a `TrueNASDataset` tree under an existing, physical TrueNAS pool
 * name. It never creates a `truenas.Pool` resource — the pool (and its disk
 * topology) already exists physically; this only builds and manages the
 * dataset hierarchy under it.
 */
export class TrueNASPool extends pulumi.ComponentResource {
	private readonly byPath = new Map<string, TrueNASDataset>();
	private topologyOutput?: pulumi.Output<TrueNASTopology>;
	private datasetsTreeOutput?: pulumi.Output<string>;

	constructor(
		public readonly name: string,
		public readonly datasets: TrueNASDataset[] = [],
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("chezmoi:truenas:Pool", name, {}, opts);

		for (const dataset of datasets) {
			dataset.materialize(name, undefined, this);
			dataset.index(dataset.path, this.byPath);
		}

		this.registerOutputs({});
	}

	/** Returns the dataset registered at `relativePath` (e.g. `media/animes`), if any. */
	public get(relativePath: string): TrueNASDataset | undefined {
		return this.byPath.get(relativePath);
	}

	/**
	 * Fetches this pool's physical vdev topology + disk inventory, resolved
	 * into a `TrueNASTopology`. Memoized -- callers in `index.ts` invoke this
	 * twice per pool (once for the topology diagram output, once for the disk
	 * models output); without caching that meant two independent live
	 * WebSocket round-trips per pool per `preview`/`up`.
	 */
	public topology(): pulumi.Output<TrueNASTopology> {
		if (!this.topologyOutput) {
			const config = new pulumi.Config("truenas");
			const url = config.require("url");
			const apiKey = config.requireSecret("apiKey");

			const result = apiKey.apply(async (key) => {
				const { pool, disks } = await fetchTopology(url, key, this.name);
				return new TrueNASTopology(pool, disks);
			});

			// `TrueNASTopology` never carries the API key itself, only data fetched
			// using it -- see the same note on `datasetsTree()` below for why `unsecret`
			// is needed here despite that.
			this.topologyOutput = pulumi.unsecret(result);
		}
		return this.topologyOutput;
	}

	/**
	 * Fetches live dataset state (quota/encrypted/comments/...), attaches it to
	 * every `TrueNASDataset` in this pool's tree (so each one's own `toString()`
	 * reflects it afterwards too), and returns the full tree — pool name as
	 * root, every top-level dataset (and its descendants) below, columns
	 * aligned across the whole pool (not just within one subtree, unlike
	 * calling `toString()` directly on an individual `TrueNASDataset`). No
	 * title. Memoized -- see the note on `topology()` above; guards against
	 * the same redundant-fetch trap if a future caller ever reads this twice.
	 */
	public datasetsTree(): pulumi.Output<string> {
		if (!this.datasetsTreeOutput) {
			const config = new pulumi.Config("truenas");
			const url = config.require("url");
			const apiKey = config.requireSecret("apiKey");

			const tree = apiKey.apply(async (key) => {
				const live = await fetchDatasets(url, key, this.name);
				const liveByName = flattenDatasetInfo(live);
				for (const dataset of this.datasets) {
					dataset.attachLive(`${this.name}/${dataset.path}`, liveByName);
				}

				const rows = this.datasets.flatMap((dataset, i) =>
					collectDatasetRows(dataset, "", i === this.datasets.length - 1),
				);
				return [this.name, renderRows(rows)].filter(Boolean).join("\n");
			});

			// The rendered tree never contains the API key itself, only data fetched
			// using it -- `apiKey.apply()` marks the result secret regardless (Pulumi
			// propagates secret-ness to anything derived from a secret Output, with
			// no data-flow analysis of what the result actually contains), which
			// would otherwise mask this documentation output and encrypt it in state
			// for no reason. `unsecret` only lifts that derived marking; `apiKey`
			// itself stays secret.
			this.datasetsTreeOutput = pulumi.unsecret(tree);
		}
		return this.datasetsTreeOutput;
	}
}
