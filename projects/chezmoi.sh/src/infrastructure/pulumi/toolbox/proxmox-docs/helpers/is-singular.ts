/** True when `arr` has exactly one element -- for `is`/`are` and plural-`s` agreement in templates. */
export function isSingular(arr: unknown[]): boolean {
	return (arr?.length ?? 0) === 1;
}
