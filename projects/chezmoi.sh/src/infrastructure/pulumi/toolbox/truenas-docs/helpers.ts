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

const DOW_NAMES_SINGULAR = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

/**
 * Renders a TrueNAS/cron-style `scheduleMinute`/`scheduleHour`/`scheduleDom`/
 * `scheduleMonth`/`scheduleDow` quintet as a short human sentence. Only
 * recognizes the shapes actually used in this stack (daily, weekly on one
 * weekday, monthly on one day of month) -- anything else falls back to the
 * raw cron fields rather than guessing.
 *
 * `dow` accepts both `0` and `7` for Sunday -- TrueNAS's own `ScrubTask`
 * resources use `7` (see `zpools/const.ts`'s `SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET`)
 * while `SnapshotTask`/`CloudSync` use `0`, and both are valid cron.
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
	if (dom === "*" && month === "*" && /^[0-7]$/.test(dow)) {
		return `weekly, ${DOW_NAMES[Number(dow) % 7]} at ${time}`;
	}
	if (dow === "*" && month === "*" && /^\d+$/.test(dom)) {
		return `monthly on day ${dom} at ${time}`;
	}
	return `${minute} ${hour} ${dom} ${month} ${dow} (cron)`;
}

/**
 * Renders the same cron quintet as `cronToHuman`, but as the `"Each <day> at
 * HH:MM"` lead-in used by the Backups section's per-job bullet list, instead
 * of a clause meant to sit mid-sentence.
 */
export function cronToEach(
	minute: string,
	hour: string,
	dom: string,
	month: string,
	dow: string,
): string {
	const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

	if (dom === "*" && month === "*" && dow === "*") {
		return `Each day at ${time}`;
	}
	if (dom === "*" && month === "*" && /^[0-7]$/.test(dow)) {
		return `Each ${DOW_NAMES_SINGULAR[Number(dow) % 7]} at ${time}`;
	}
	if (dow === "*" && month === "*" && /^\d+$/.test(dom)) {
		return `On day ${dom} of each month at ${time}`;
	}
	return `${minute} ${hour} ${dom} ${month} ${dow} (cron)`;
}

/** Renders a `SnapshotTask`'s `lifetimeValue`/`lifetimeUnit` pair as a compound adjective, e.g. `(4, "WEEK")` -> `"4-week"`. */
export function retentionLabel(value: number, unit: string): string {
	return `${value}-${unit.toLowerCase()}`;
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
	handlebars.registerHelper(
		"cronToEach",
		(minute: string, hour: string, dom: string, month: string, dow: string) =>
			cronToEach(minute, hour, dom, month, dow),
	);
	handlebars.registerHelper("retentionLabel", (value: number, unit: string) =>
		retentionLabel(value, unit),
	);
	handlebars.registerHelper("humanList", (arr: unknown[]) => humanList(arr));
	handlebars.registerHelper("isSingular", (arr: unknown[]) => isSingular(arr));
}
