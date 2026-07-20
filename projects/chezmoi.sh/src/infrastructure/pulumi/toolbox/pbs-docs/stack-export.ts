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
 * output (e.g. an `pbs.ApiToken`'s `value`) comes back as an opaque
 * `{ciphertext: "..."}` marker, never plaintext. Some fields the provider
 * itself does *not* mark secret (e.g. `pbs.WebhookNotification`'s `url`, a
 * Slack incoming-webhook URL that is sensitive in practice) are additionally
 * never read by `./extract.ts` at all -- see its own comment on
 * `extractNotificationTargets`.
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
 * Reads one stack config value (e.g. `pbs:endpoint`) via `pulumi config get
 * <key>`. Unlike `pulumi config`'s masked list view, targeting one key like
 * this always returns its real, decrypted value. Only used here for
 * `pbs:endpoint`, which isn't a secret -- `index.ts` never reads
 * `pbs:apiToken`.
 */
export function readConfig(cwd: string, key: string): string {
	return execFileSync("pulumi", ["config", "get", key], {
		cwd,
		encoding: "utf8",
	}).trim();
}

/**
 * Same as `readConfig`, but returns `undefined` instead of throwing when
 * `key` isn't set -- lets `index.ts` skip cleanly if `pbs:endpoint` is
 * ever unset, instead of crashing `mise run pbs:docs:generate`, which is
 * chained onto `pulumi:apply` for the whole shared stack
 * (`observability`/`omni`/`truenas`/`zot-registry`, not just PBS).
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
