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
 * Runs `pulumi stack export` in `cwd` and parses its JSON output. Never passes
 * `--show-secrets` -- this is the property that keeps every extractor under
 * `./extract/` safe by construction: any secret output (a `UserToken`'s value,
 * `StoragePbs`'s password/encryptionKey) comes back as an opaque
 * `{ciphertext: "..."}` marker rather than plaintext.
 *
 * Secrecy by omission is layered on top of that: `AcmeDnsPlugin`'s `data` map
 * holds the Cloudflare API token, and the provider does *not* mark it as a
 * secret output, so it would come back in plaintext here. No extractor reads
 * it -- see `./extract/acme-dns-plugin.ts`.
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
 * Reads one stack config value (e.g. `proxmox:endpoint`) via `pulumi config get
 * <key>`. Unlike `pulumi config`'s masked list view, targeting a single key
 * returns its real value. Only used for non-secret connection details --
 * this stack's actual credentials never live in Pulumi config at all (they are
 * supplied as environment variables per invocation, see
 * `../../stack/proxmox/README.md`).
 */
export function readConfig(cwd: string, key: string): string {
	return execFileSync("pulumi", ["config", "get", key], {
		cwd,
		encoding: "utf8",
	}).trim();
}

/**
 * Same as `readConfig`, but returns `undefined` instead of throwing when `key`
 * isn't set -- lets `generate.ts` skip cleanly if `proxmox:endpoint` is ever
 * unset, instead of crashing `mise run pulumi:apply`, whose post-task chain
 * covers the whole shared stack (observability/omni/truenas/zot-registry), not
 * just Proxmox VE.
 */
export function readOptionalConfig(
	cwd: string,
	key: string,
): string | undefined {
	try {
		return readConfig(cwd, key) || undefined;
	} catch {
		return undefined;
	}
}
