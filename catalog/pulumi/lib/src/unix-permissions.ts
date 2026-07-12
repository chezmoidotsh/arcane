/** One `rwx`-style permission triad -- what a single owner/group/other slot in a UNIX mode grants. */
export interface UnixPermissionTriad {
	read: boolean;
	write: boolean;
	execute: boolean;
}

/** A full 9-bit UNIX mode, split into its three triads -- the same breakdown `ls -l`/`chmod` use. */
export interface UnixPermissions {
	owner: UnixPermissionTriad;
	group: UnixPermissionTriad;
	other: UnixPermissionTriad;
}

const TRIAD_PATTERN = /^[r-][w-][x-]$/;

function parseTriad(triad: string): UnixPermissionTriad {
	if (!TRIAD_PATTERN.test(triad)) {
		throw new Error(
			`parseUnixMode(): invalid permission triad "${triad}" (expected 3 chars, each "r"/"-", "w"/"-", "x"/"-")`,
		);
	}
	return {
		read: triad[0] === "r",
		write: triad[1] === "w",
		execute: triad[2] === "x",
	};
}

/**
 * Parses a 9-character `ls -l`-style mode string (e.g. `"rwxrwxr-x"`) into
 * owner/group/other permission triads.
 *
 * This exists because filesystem ACL/permission APIs (this repository's
 * immediate use case: TrueNAS's `FilesystemAcl`, POSIX1E mode) typically
 * want owner/group/other permissions as separate read/write/execute
 * booleans, not as the string every UNIX tool (`chmod`, `ls -l`) already
 * uses to display and accept them. Writing `parseUnixMode("rwxrwxr-x")` at
 * a call site is both shorter and more immediately legible than spelling
 * out 9 individual booleans by hand -- and wrong-length or garbled input
 * (a typo'd triad, extra/missing characters) fails loudly here instead of
 * silently producing an ACL nobody intended.
 */
export function parseUnixMode(mode: string): UnixPermissions {
	if (mode.length !== 9) {
		throw new Error(
			`parseUnixMode(): expected a 9-character mode string (e.g. "rwxrwxr-x"), got "${mode}" (${mode.length} chars)`,
		);
	}
	return {
		owner: parseTriad(mode.slice(0, 3)),
		group: parseTriad(mode.slice(3, 6)),
		other: parseTriad(mode.slice(6, 9)),
	};
}
