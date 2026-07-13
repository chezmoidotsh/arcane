// -----------------------------------------------------------------------------
// Minimal TrueNAS SCALE JSON-RPC 2.0 client, read-only.
// -----------------------------------------------------------------------------
// Neither the managed `truenas.Pool`/`truenas.Dataset` resources nor their
// data sources (PjSalty/terraform-provider-truenas) round-trip pool topology
// or dataset encryption status at all -- confirmed empirically on 2026-07-10:
// `pulumi import truenas:index/pool:Pool` only ever yields `{name}`, and
// `truenas.Dataset`'s schema has no encryption field whatsoever. That's a
// deliberate design choice on the provider's side (avoids modeling the
// deeply-nested discriminated-union topology schema), not a bug to work
// around in the resource layer.
//
// TrueNAS SCALE's REST v2.0 gateway is being phased out in favor of JSON-RPC
// 2.0 over WebSocket (confirmed: 25.10.4 still serves both, but the new
// provider's own wsclient dropped REST entirely: "v2.0 ships WebSocket as the
// *only* transport, the v1.x REST client was deleted as part of the
// cutover"). This client talks JSON-RPC directly against `wss://<host>/api/current`
// so the component doesn't depend on a transport TrueNAS itself is retiring.
//
// `pool.query` / `pool.dataset.query` are the same underlying middleware
// methods the REST gateway (and the TrueNAS web UI) call -- real JSON, no
// Go `%v` debug-string to parse.

/** One node of a pool's physical vdev tree (`pool.query`'s `topology` field). */
export interface TrueNASVdevNode {
	name: string;
	type: string;
	path: string | null;
	guid: string;
	status: string;
	stats: { size: number };
	children?: TrueNASVdevNode[];
	/** Real device name (e.g. "sdc") on a leaf DISK node -- absent on MIRROR/RAIDZ/STRIPE group nodes. */
	disk?: string | null;
}

/** `pool.query` result, keyed by vdev category (data/cache/log/spare/special/dedup). */
export interface TrueNASPoolInfo {
	id: number;
	name: string;
	topology: Record<string, TrueNASVdevNode[] | undefined>;
}

/** `disk.query` result -- only the fields the topology diagram uses. */
export interface TrueNASDiskInfo {
	name: string;
	type: string; // "SSD" | "HDD"
	model: string;
}

/** A ZFS property as `pool.dataset.query` reports it: local value, or inherited/default with its source. */
export interface TrueNASDatasetProperty<T> {
	parsed: T | null;
	rawvalue: string;
	value: string | null;
	source: string;
}

/** One node of a pool's dataset tree (`pool.dataset.query`'s result, nested via `children`). */
export interface TrueNASDatasetInfo {
	id: string;
	name: string;
	pool: string;
	type: string;
	/** Bare boolean/string fields -- unlike the ZFS properties below, these aren't local/inherited. */
	encrypted: boolean;
	encryption_root: string | null;
	quota?: TrueNASDatasetProperty<number>;
	readonly?: TrueNASDatasetProperty<boolean>;
	deduplication?: TrueNASDatasetProperty<string>;
	/** `comments` lives here as a ZFS user-property, not a top-level field. */
	user_properties?: Record<string, TrueNASDatasetProperty<string>>;
	children?: TrueNASDatasetInfo[];
}

interface JsonRpcMessage {
	jsonrpc: "2.0";
	id?: string;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

/** One authenticated JSON-RPC 2.0 call over a short-lived WebSocket connection. */
function wsQuery<T>(
	apiKey: string,
	wsUrl: string,
	method: string,
	params: unknown[],
): Promise<T> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		const authId = crypto.randomUUID();
		const queryId = crypto.randomUUID();

		ws.addEventListener("open", () => {
			ws.send(
				JSON.stringify({
					jsonrpc: "2.0",
					method: "auth.login_with_api_key",
					params: [apiKey],
					id: authId,
				}),
			);
		});

		ws.addEventListener("message", (event) => {
			const msg = JSON.parse(event.data.toString()) as JsonRpcMessage;
			if (msg.id === authId) {
				if (msg.error || msg.result !== true) {
					reject(
						new Error(
							`auth.login_with_api_key failed: ${JSON.stringify(msg.error ?? msg.result)}`,
						),
					);
					ws.close();
					return;
				}
				ws.send(
					JSON.stringify({ jsonrpc: "2.0", method, params, id: queryId }),
				);
			} else if (msg.id === queryId) {
				if (msg.error) {
					reject(new Error(`${method} failed: ${JSON.stringify(msg.error)}`));
				} else {
					resolve(msg.result as T);
				}
				ws.close();
			}
		});

		ws.addEventListener("error", () =>
			reject(new Error(`WebSocket connection to ${wsUrl} failed`)),
		);
	});
}

/** What `TrueNASPool.topology()` resolves from. */
export interface TrueNASTopologyState {
	pool?: TrueNASPoolInfo;
	disks: TrueNASDiskInfo[];
}

const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_BASE_DELAY_MS = 500;

/**
 * Retries a flaky JSON-RPC round-trip (each attempt is its own fresh
 * WebSocket connection) with exponential backoff before giving up -- a
 * transient timeout/auth hiccup on one attempt shouldn't be enough to
 * degrade these outputs and poison stack state with an empty/partial value
 * (see the callers below for what "degrade" means here).
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	attempts: number,
	baseDelayMs: number,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			if (attempt < attempts - 1) {
				await new Promise((resolve) =>
					setTimeout(resolve, baseDelayMs * 2 ** attempt),
				);
			}
		}
	}
	throw lastError;
}

/**
 * Fetches pool topology + disk inventory for `poolName` over JSON-RPC,
 * retrying transient failures (see `withRetry`). Never throws: if every
 * attempt fails, returns `{ disks: [] }` so `TrueNASPool.topology()` can
 * degrade to its placeholder instead of failing the whole `pulumi up`.
 */
export async function fetchTopology(
	url: string,
	apiKey: string,
	poolName: string,
): Promise<TrueNASTopologyState> {
	const wsUrl = `wss://${new URL(url).host}/api/current`;
	try {
		return await withRetry(
			async () => {
				const [pools, disks] = await Promise.all([
					wsQuery<TrueNASPoolInfo[]>(apiKey, wsUrl, "pool.query", [
						[["name", "=", poolName]],
					]),
					wsQuery<TrueNASDiskInfo[]>(apiKey, wsUrl, "disk.query", [[]]),
				]);
				return { pool: pools[0], disks };
			},
			FETCH_RETRY_ATTEMPTS,
			FETCH_RETRY_BASE_DELAY_MS,
		);
	} catch {
		return { disks: [] };
	}
}

/**
 * Fetches the dataset tree for `poolName` over JSON-RPC, retrying transient
 * failures (see `withRetry`). Never throws: if every attempt fails, returns
 * `[]` so `TrueNASPool.datasetsTree()` can degrade to blank info/description
 * columns instead of failing the whole `pulumi up`.
 */
export async function fetchDatasets(
	url: string,
	apiKey: string,
	poolName: string,
): Promise<TrueNASDatasetInfo[]> {
	const wsUrl = `wss://${new URL(url).host}/api/current`;
	try {
		return await withRetry(
			() =>
				wsQuery<TrueNASDatasetInfo[]>(apiKey, wsUrl, "pool.dataset.query", [
					[["pool", "=", poolName]],
				]),
			FETCH_RETRY_ATTEMPTS,
			FETCH_RETRY_BASE_DELAY_MS,
		);
	} catch {
		return [];
	}
}
