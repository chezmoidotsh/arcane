import { expect } from "chai";
import { describe, it } from "mocha";

import { render } from "./render";

const fixtureContext = {
	endpoint: "https://pbs.pve.chezmoi.sh:8007",
	datastores: [
		{
			name: "backups",
			comment: "Primary S3-backed datastore (Backblaze B2)",
			path: "/mnt/datastore/backups",
			s3Bucket: "pbs-vm-backup-fcc7acb9",
			s3Client: "backblaze-b2",
			gcSchedule: "Sun 04:00",
			notificationMode: "notification-system",
			disabled: false,
		},
	],
	pruneJobs: [
		{
			id: "backups-retention",
			store: "backups",
			schedule: "Mon..Sun 03:00",
			retentionSummary: "keep-daily=4, keep-weekly=2, keep-monthly=3",
			comment: "keep-daily=4, keep-weekly=2, keep-monthly=3",
		},
	],
	verifyJobs: [
		{
			id: "backups-weekly-verify",
			store: "backups",
			schedule: "Sun 03:30",
			ignoreVerified: true,
			outdatedAfter: 30,
			comment: "Weekly checksum verification",
		},
	],
	notificationTargets: [
		{
			name: "slack-notifications",
			kind: "Webhook",
			comment:
				"Slack #notifications -- shared with observability's Alertmanager",
		},
	],
	notificationMatchers: [
		{
			name: "slack-all-datastore-events",
			mode: "all",
			matchSeverities: ["info", "notice", "warning", "error"],
			targets: ["slack-notifications"],
			comment: "Routes all datastore prune/verify/GC notifications to Slack",
		},
	],
	users: [
		{
			userid: "pve-backup@pbs",
			comment: "Proxmox VE storage integration -- pushes LXC/VM backups",
			enabled: true,
		},
	],
	apiTokens: [
		{
			tokenid: "pve-backup@pbs!pve-storage",
			userid: "pve-backup@pbs",
			tokenName: "pve-storage",
			comment: "Used by /etc/pve/storage.cfg's `pbs` storage entry",
			enabled: true,
		},
	],
	acls: [
		{
			path: "/datastore/backups",
			ugid: "pve-backup@pbs!pve-storage",
			roleId: "DatastoreBackup",
			propagate: true,
		},
	],
};

describe("PROXMOX_BACKUP_SERVER.md template", () => {
	it("renders every section heading", () => {
		const md = render(fixtureContext);
		expect(md).to.include("# Proxmox Backup Server (pbs.pve.chezmoi.sh)");
		expect(md).to.include("## Key terms");
		expect(md).to.include("## How it's managed");
		expect(md).to.include("## Datastore");
		expect(md).to.include("## Retention & verification");
		expect(md).to.include("## Notifications");
		expect(md).to.include("## Access");
		expect(md).to.include("## Configuring Proxmox VE to use this datastore");
	});

	it("explains the key PBS terms before diving into specifics", () => {
		const md = render(fixtureContext);
		expect(md).to.include("**Datastore** — the top-level backup repository");
		expect(md).to.include("**Garbage collection (GC)**");
	});

	it("explains how to add the datastore as Proxmox VE storage, including the port", () => {
		const md = render(fixtureContext);
		expect(md).to.include("pvesm add pbs pbs-backups");
		expect(md).to.include("--datastore backups");
		expect(md).to.include("--username pve-backup@pbs");
		expect(md).to.include("--port 8007");
	});

	it("renders the overview before How it's managed", () => {
		const md = render(fixtureContext);
		const overviewIndex = md.indexOf("household's Proxmox Backup Server");
		const managedIndex = md.indexOf("## How it's managed");
		expect(overviewIndex).to.be.greaterThan(-1);
		expect(overviewIndex).to.be.lessThan(managedIndex);
	});

	it("mentions the reachable endpoint and datastore count from real data", () => {
		const md = render(fixtureContext);
		expect(md).to.include("https://pbs.pve.chezmoi.sh:8007");
		expect(md).to.include("1 datastore detailed");
	});

	it("renders the datastore's S3 backend and schedules, never a raw secret", () => {
		const md = render(fixtureContext);
		expect(md).to.include("### `backups`");
		expect(md).to.include("bucket `pbs-vm-backup-fcc7acb9`");
		expect(md).to.include("**Garbage collection**: `Sun 04:00`");
	});

	it("renders the prune job's precomputed retention summary verbatim", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"`backups-retention` on `backups`, schedule `Mon..Sun 03:00`: keep-daily=4, keep-weekly=2, keep-monthly=3",
		);
	});

	it("renders the verify job's outdated-after note", () => {
		const md = render(fixtureContext);
		expect(md).to.include("skips backups re-verified within the last 30 days");
	});

	it("names notification targets and routing without ever printing a URL", () => {
		const md = render(fixtureContext);
		expect(md).to.include("`slack-notifications` (Webhook)");
		expect(md).to.include("all of [info, notice, warning and error]");
		expect(md).to.not.include("hooks.slack.com");
	});

	it("renders users, tokens, and ACLs, never a token secret", () => {
		const md = render(fixtureContext);
		expect(md).to.include("`pve-backup@pbs`");
		expect(md).to.include("`pve-backup@pbs!pve-storage`");
		expect(md).to.include(
			"| `/datastore/backups` | `pve-backup@pbs!pve-storage` | `DatastoreBackup` | yes |",
		);
	});

	it("marks a disabled datastore", () => {
		const md = render({
			...fixtureContext,
			datastores: [{ ...fixtureContext.datastores[0], disabled: true }],
		});
		expect(md).to.include("### `backups` _(disabled)_");
	});
});
