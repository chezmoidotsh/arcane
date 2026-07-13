/**
 * Narrows `value` to `T`, or throws if it's `undefined` — a terser
 * alternative to an `if (x === undefined) throw ...` guard at call sites
 * that unwrap an optional lookup, e.g. `must(pool.get(path)).resource`.
 */
export function must<T>(value: T | undefined, message?: string): T {
	if (value === undefined) {
		throw new Error(message ?? "must(): value is undefined");
	}
	return value;
}
