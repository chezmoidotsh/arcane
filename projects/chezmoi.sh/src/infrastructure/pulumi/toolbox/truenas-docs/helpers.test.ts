import { expect } from "chai";
import { describe, it } from "mocha";

import { cronToEach, cronToHuman, retentionLabel } from "./helpers";

describe("cronToHuman", () => {
	it("renders the real nas-backup-cloudsync schedule as weekly", () => {
		// backups.ts CLOUDSYNC_SCHEDULE
		expect(cronToHuman("0", "0", "*", "*", "0")).to.equal(
			"weekly, Sundays at 00:00",
		);
	});

	it("renders the real smart-test cronjob schedule as daily", () => {
		// jobs.ts smart-test
		expect(cronToHuman("00", "0", "*", "*", "*")).to.equal("daily at 00:00");
	});

	it("renders a specific day-of-month as monthly", () => {
		expect(cronToHuman("30", "3", "15", "*", "*")).to.equal(
			"monthly on day 15 at 03:30",
		);
	});

	it("treats dow=7 as Sunday, same as dow=0", () => {
		// zpools/const.ts SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET uses "7"
		expect(cronToHuman("00", "00", "*", "*", "7")).to.equal(
			"weekly, Sundays at 00:00",
		);
	});

	it("falls back to the raw cron fields for unrecognized shapes", () => {
		expect(cronToHuman("0", "0", "1", "1", "*")).to.equal("0 0 1 1 * (cron)");
	});
});

describe("cronToEach", () => {
	it("renders a weekly schedule as an 'Each <day>' bullet lead-in", () => {
		expect(cronToEach("0", "2", "*", "*", "0")).to.equal(
			"Each Sunday at 02:00",
		);
	});

	it("treats dow=7 as Sunday, same as dow=0", () => {
		expect(cronToEach("00", "00", "*", "*", "7")).to.equal(
			"Each Sunday at 00:00",
		);
	});

	it("renders a daily schedule", () => {
		expect(cronToEach("0", "1", "*", "*", "*")).to.equal("Each day at 01:00");
	});

	it("renders a specific day-of-month as monthly", () => {
		expect(cronToEach("30", "3", "15", "*", "*")).to.equal(
			"On day 15 of each month at 03:30",
		);
	});

	it("falls back to the raw cron fields for unrecognized shapes", () => {
		expect(cronToEach("0", "0", "1", "1", "*")).to.equal("0 0 1 1 * (cron)");
	});
});

describe("retentionLabel", () => {
	it("renders a lifetimeValue/lifetimeUnit pair as a compound adjective", () => {
		expect(retentionLabel(4, "WEEK")).to.equal("4-week");
		expect(retentionLabel(8, "DAY")).to.equal("8-day");
	});
});
