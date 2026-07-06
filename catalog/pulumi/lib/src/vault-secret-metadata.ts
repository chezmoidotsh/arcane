import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";

/**
 * The four {@link vault.kv.SecretV2} `customMetadata.data` fields every secret
 * pushed to Vault in this stack shares — the ones that are identical across
 * every call site or derivable from the credential itself.
 *
 * The per-secret `description` and `application` fields stay at the call site;
 * spread this object alongside them:
 *
 * ```ts
 * customMetadata: {
 *   data: {
 *     description: "...",
 *     application: "...",
 *     ...vaultSecretMetadata(token),
 *   },
 * },
 * ```
 */
export interface VaultSecretMetadata {
	/** Repo-relative path of the file that pushed the secret (auto-detected). */
	"created-by": string;
	/** Second path segment of the caller's repo-relative path (e.g. `amiya.akn`). */
	owner: string;
	/** The single fixed sentence describing what rotation does. */
	"renewal-process": string;
	/** The exact `pulumi up --replace` command targeting the credential's URN. */
	"x-renewal-cmd": pulumi.Output<string>;
}

/** The one sentence every pushed secret uses for its `renewal-process` field. */
const RENEWAL_PROCESS =
	"Rotate the credential below; this secret's value is recomputed from it " +
	"and picks up the new one automatically on the next `pulumi up`.";

/**
 * Walk up from `filePath` until a directory containing a workspace/repo marker
 * (`.git` or `pnpm-workspace.yaml`) is found, and return it. Throws loudly if
 * none is found before the filesystem root — a secret pushed with a wrong
 * `created-by` is worse than a stack that fails to evaluate.
 */
function findRepoRoot(filePath: string): string {
	let dir = path.dirname(path.resolve(filePath));
	while (true) {
		if (
			fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
			fs.existsSync(path.join(dir, ".git"))
		) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error(
				"vaultSecretMetadata: could not locate the repository root " +
					"(no `pnpm-workspace.yaml` or `.git` found walking up from " +
					`${filePath}). This helper assumes it runs inside a full repo ` +
					`checkout with unbundled ts-node sources.`,
			);
		}
		dir = parent;
	}
}

/** True when `filePath` sits anywhere under a `node_modules` directory. */
function isInsideNodeModules(filePath: string): boolean {
	return filePath.split(path.sep).includes("node_modules");
}

/**
 * Derives the owner token from a repo-relative path.
 *
 * Rule: take the second path segment (index 1). For `projects/<project>/…`
 * this yields the project name (e.g. `amiya.akn`). For other paths such as
 * `catalog/pulumi/…` it yields the second-level directory (e.g. `pulumi`).
 * Falls back to the first segment when the path is a single component.
 */
function ownerFromRepoRelativePath(repoRelativePath: string): string {
	const parts = repoRelativePath.split("/");
	return parts.length >= 2 ? parts[1] : parts[0];
}

/**
 * Returns the repo-relative path of the file that called {@link vaultSecretMetadata}
 * — i.e. the call site pushing the secret — by inspecting the V8 call stack.
 *
 * Frames are skipped when they are native/undefined, `node:`-prefixed, inside
 * `node_modules` (which covers this library itself when installed via `file:`),
 * or belong to this module (`__filename`). The first surviving frame is the
 * caller's source file. Works both in-package (relative import during this
 * library's own tests) and installed (via `file:` in a consuming stack).
 */
function callerRepoRelativePath(): string {
	// prepareStackTrace is a global V8 hook; scope the override tightly and
	// restore it even if a frame accessor throws.
	const previous = Error.prepareStackTrace;
	const here = path.resolve(__filename);
	let stack: NodeJS.CallSite[];
	try {
		Error.prepareStackTrace = (_error, callSites) => callSites;
		stack = (new Error() as unknown as { stack: NodeJS.CallSite[] }).stack;
	} finally {
		Error.prepareStackTrace = previous;
	}

	for (const frame of stack) {
		const file = frame.getFileName();
		if (!file) continue;
		if (file.startsWith("node:")) continue;
		const resolved = path.resolve(file);
		if (resolved === here) continue;
		if (isInsideNodeModules(resolved)) continue;
		const root = findRepoRoot(resolved);
		return path.relative(root, resolved).split(path.sep).join("/");
	}
	throw new Error(
		"vaultSecretMetadata: could not determine the calling file from the stack. " +
			"This helper assumes unbundled ts-node/CommonJS execution; if the stack " +
			"is bundled the call-site frames collapse and `created-by` cannot resolve.",
	);
}

/**
 * Build the three shared `customMetadata.data` fields for a secret pushed to
 * Vault, from the credential resource that backs it.
 *
 * @param source The Pulumi resource whose value is being pushed. Parent the
 *   `vault.kv.SecretV2` to this same resource so the secret shares its lifecycle.
 * @param opts.renewalUrn Override the URN used in `x-renewal-cmd`. Defaults to
 *   `source.urn`. Pass this when `source` is a `ComponentResource` that
 *   encapsulates the real replace target (e.g. `Dns01TokenComponent` → its
 *   exposed `tokenUrn`), since `pulumi up --replace` on a component URN does
 *   not reliably rotate its children.
 */
export function vaultSecretMetadata(
	source: pulumi.Resource,
	opts?: { renewalUrn?: pulumi.Input<pulumi.URN> },
): VaultSecretMetadata {
	const createdBy = callerRepoRelativePath();
	return {
		"created-by": createdBy,
		owner: ownerFromRepoRelativePath(createdBy),
		"renewal-process": RENEWAL_PROCESS,
		"x-renewal-cmd": pulumi.interpolate`pulumi up --replace '${
			opts?.renewalUrn ?? source.urn
		}'`,
	};
}
