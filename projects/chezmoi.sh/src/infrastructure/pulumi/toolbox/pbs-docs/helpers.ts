import type * as Handlebars from "handlebars";

/**
 * Joins an array as a prose list: `"a"`, `"a and b"`, `"a, b and c"`. Empty
 * arrays render as `"none"` so a sentence built around this never reads as
 * if something was omitted by mistake.
 */
export function humanList(arr: unknown[]): string {
	if (arr.length === 0) return "none";
	if (arr.length === 1) return String(arr[0]);
	return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}

/** True when `arr` has exactly one element -- for `is`/`are` agreement in templates. */
export function isSingular(arr: unknown[]): boolean {
	return arr.length === 1;
}

/** Registers this module's helpers on `handlebars`. */
export function registerHelpers(handlebars: typeof Handlebars): void {
	handlebars.registerHelper("humanList", (arr: unknown[]) => humanList(arr));
	handlebars.registerHelper("isSingular", (arr: unknown[]) => isSingular(arr));
}
