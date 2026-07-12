// -----------------------------------------------------------------------------
// Shared TrueNAS schedule presets for `ScrubTask`/`SnapshotTask` resources.
// Centralizes the cron-like fields (`scheduleMinute`/`scheduleHour`/
// `scheduleDom`/`scheduleMonth`/`scheduleDow`) as reusable objects instead of
// repeating raw cron fields at every call site across zpool files. Spread a
// preset into a task's args, e.g.:
//   new truenas.ScrubTask("...", { ...SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET, ... })
// -----------------------------------------------------------------------------

/**
 * Weekly, Sunday at midnight (cron equivalent: 0 0 * * 0).
 *
 * Note: uses `scheduleDow: "7"` for Sunday, not `"0"` as in the snapshot
 * presets below — this mirrors the raw value already used by this pool's
 * existing scrub task, kept as-is to avoid an unwanted resource replacement.
 */
export const SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET = {
	scheduleMinute: "00",
	scheduleHour: "00",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "7",
};

/** Weekly, Sunday at 03:00 (cron equivalent: 0 3 * * 0). */
export const SNAPSHOT_WEEKLY_SUNDAY_3AM_PRESET = {
	scheduleMinute: "0",
	scheduleHour: "3",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "0",
};

/** Daily, at midnight (cron equivalent: 0 0 * * *). */
export const SNAPSHOT_DAILY_MIDNIGHT_PRESET = {
	scheduleMinute: "0",
	scheduleHour: "0",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "*",
};

/** Hourly, on the hour (cron equivalent: 0 * * * *). */
export const SNAPSHOT_HOURLY_PRESET = {
	scheduleMinute: "0",
	scheduleHour: "*",
	scheduleDom: "*",
	scheduleMonth: "*",
	scheduleDow: "*",
};

/** Naming schema shared by every `SnapshotTask` (e.g. `auto-2026-07-11_00-00`). */
export const SNAPSHOT_NAMING_SCHEMA = "auto-%Y-%m-%d_%H-%M";
