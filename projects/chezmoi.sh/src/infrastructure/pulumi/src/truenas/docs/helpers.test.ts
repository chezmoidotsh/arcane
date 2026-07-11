import { expect } from "chai";
import { describe, it } from "mocha";

import { cronToHuman } from "./helpers";

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

	it("falls back to the raw cron fields for unrecognized shapes", () => {
		expect(cronToHuman("0", "0", "1", "1", "*")).to.equal("0 0 1 1 * (cron)");
	});
});
