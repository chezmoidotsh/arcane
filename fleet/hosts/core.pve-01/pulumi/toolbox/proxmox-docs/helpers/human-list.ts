/**
 * Joins an array as a prose list: `"a"`, `"a and b"`, `"a, b and c"`. Empty
 * arrays render as `"none"` so a sentence built around this never reads as if
 * something was omitted by mistake.
 */
export function humanList(arr: unknown[]): string {
	if (!arr || arr.length === 0) return "none";
	if (arr.length === 1) return String(arr[0]);
	return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}
