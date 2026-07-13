import type * as Handlebars from "handlebars";

const DOW_NAMES = [
	"Sundays",
	"Mondays",
	"Tuesdays",
	"Wednesdays",
	"Thursdays",
	"Fridays",
	"Saturdays",
];

/**
 * Renders a TrueNAS/cron-style `scheduleMinute`/`scheduleHour`/`scheduleDom`/
 * `scheduleMonth`/`scheduleDow` quintet as a short human sentence. Only
 * recognizes the shapes actually used in this stack (daily, weekly on one
 * weekday, monthly on one day of month) -- anything else falls back to the
 * raw cron fields rather than guessing.
 */
export function cronToHuman(
	minute: string,
	hour: string,
	dom: string,
	month: string,
	dow: string,
): string {
	const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

	if (dom === "*" && month === "*" && dow === "*") {
		return `daily at ${time}`;
	}
	if (dom === "*" && month === "*" && /^[0-6]$/.test(dow)) {
		return `weekly, ${DOW_NAMES[Number(dow)]} at ${time}`;
	}
	if (dow === "*" && month === "*" && /^\d+$/.test(dom)) {
		return `monthly on day ${dom} at ${time}`;
	}
	return `${minute} ${hour} ${dom} ${month} ${dow} (cron)`;
}

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
	handlebars.registerHelper(
		"cronToHuman",
		(minute: string, hour: string, dom: string, month: string, dow: string) =>
			cronToHuman(minute, hour, dom, month, dow),
	);
	handlebars.registerHelper("humanList", (arr: unknown[]) => humanList(arr));
	handlebars.registerHelper("isSingular", (arr: unknown[]) => isSingular(arr));
}
