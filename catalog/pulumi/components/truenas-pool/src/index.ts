// -----------------------------------------------------------------------------
// Public entry point -- re-exports the actual implementation, split by
// concern:
//   ./enums          closed-value truenas.Dataset arguments as TS enums
//   ./dataset        TrueNASDataset (one ZFS dataset node + its tree rendering)
//   ./topology       TrueNASTopology (pool vdev/disk diagram) + box drawing
//   ./pool           TrueNASPool (the ComponentResource itself)
//   ./truenas-api     read-only JSON-RPC client backing topology()/datasetsTree()
// -----------------------------------------------------------------------------

export * from "./dataset";
export * from "./enums";
export * from "./pool";
export * from "./topology";
export {
	fetchDatasets,
	fetchTopology,
	type TrueNASDatasetInfo,
	type TrueNASDatasetProperty,
	type TrueNASDiskInfo,
	type TrueNASPoolInfo,
	type TrueNASVdevNode,
} from "./truenas-api";
