import { execFileSync } from "child_process";

/** One resource as `pulumi stack export` reports it -- only the fields this package actually reads. */
export interface ExportedResource {
	urn: string;
	type: string;
	parent?: string;
	outputs?: Record<string, unknown>;
}

export interface StackExport {
	deployment: {
		resources: ExportedResource[];
	};
}

/**
 * Runs `pulumi stack export` in `cwd` and parses its JSON output. Never
 * passes `--show-secrets` -- this is the one property that keeps every
 * `extract*` function in `./extract.ts` safe by construction: any secret
 * output (e.g. a `truenas.User`'s `password`) comes back as an opaque
 * `{ciphertext: "..."}` marker, never plaintext.
 */
export function readStackExport(cwd: string): StackExport {
	const raw = execFileSync("pulumi", ["stack", "export"], {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return JSON.parse(raw) as StackExport;
}

/**
 * Reads one stack config value (e.g. `truenas:url`, `truenas:apiKey`) via
 * `pulumi config get <key>`. Unlike `pulumi config`'s masked list view,
 * targeting one key like this always returns its real, decrypted value --
 * there's no separate "give me the secret" flag to opt into (confirmed:
 * this CLI version doesn't even have a `--show-secrets` flag on `get`).
 * That's fine here: the only secret this package ever reads is
 * `truenas:apiKey`, needed for `generate.ts`'s live topology/dataset-tree
 * JSON-RPC fetch -- it's never used for the resource-state export above,
 * which stays safe by construction via `readStackExport()` never requesting
 * secrets in the first place.
 */
export function readConfig(cwd: string, key: string): string {
	return execFileSync("pulumi", ["config", "get", key], {
		cwd,
		encoding: "utf8",
	}).trim();
}
