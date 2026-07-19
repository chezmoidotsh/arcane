import { expect } from "chai";
import { describe, it } from "mocha";

import {
	extractAcls,
	extractApiTokens,
	extractDatastores,
	extractNotificationMatchers,
	extractNotificationTargets,
	extractPruneJobs,
	extractUsers,
	extractVerifyJobs,
	logicalName,
	resourcesOfType,
} from "./extract";
import type { ExportedResource } from "./stack-export";

/**
 * A small, hand-trimmed fixture shaped like a real `pulumi stack export`
 * (type tokens and output field names copied verbatim from
 * `catalog/pulumi/sdks/proxmox-backup-server/*.ts`) -- not the live stack itself, so these
 * tests never touch the network or `child_process`.
 */
const STACK_URN =
	"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pulumi:pulumi:Stack::chezmoi-sh-infra-chezmoi_sh.live";

const resources: ExportedResource[] = [
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/datastore:Datastore::pbs-datastore-backups",
		type: "pbs:index/datastore:Datastore",
		parent: STACK_URN,
		outputs: {
			name: "backups",
			comment: "Primary S3-backed datastore (Backblaze B2)",
			path: "/mnt/datastore/backups",
			s3Bucket: "pbs-vm-backup-fcc7acb9",
			s3Client: "backblaze-b2",
			gcSchedule: "Sun 04:00",
			notificationMode: "notification-system",
			disabled: false,
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/pruneJob:PruneJob::pbs-prune-backups",
		type: "pbs:index/pruneJob:PruneJob",
		parent: STACK_URN,
		outputs: {
			pruneJobId: "backups-retention",
			store: "backups",
			schedule: "Mon..Sun 03:00",
			keepDaily: 4,
			keepWeekly: 2,
			keepMonthly: 3,
			comment: "keep-daily=4, keep-weekly=2, keep-monthly=3",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/verifyJob:VerifyJob::pbs-verify-backups",
		type: "pbs:index/verifyJob:VerifyJob",
		parent: STACK_URN,
		outputs: {
			verifyJobId: "backups-weekly-verify",
			store: "backups",
			schedule: "Sun 03:30",
			ignoreVerified: true,
			outdatedAfter: 30,
			comment: "Weekly checksum verification",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/webhookNotification:WebhookNotification::pbs-notify-slack",
		type: "pbs:index/webhookNotification:WebhookNotification",
		parent: STACK_URN,
		outputs: {
			name: "slack-notifications",
			// A real export would also carry `url` in plaintext (see
			// ./extract.ts's comment on extractNotificationTargets) -- included
			// here to prove the extractor never reads it.
			url: "https://hooks.slack.com/services/T000/B000/should-never-appear-in-doc",
			method: "post",
			comment:
				"Slack #notifications -- shared with observability's Alertmanager",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/notificationMatcher:NotificationMatcher::pbs-notify-slack-matcher",
		type: "pbs:index/notificationMatcher:NotificationMatcher",
		parent: STACK_URN,
		outputs: {
			name: "slack-all-datastore-events",
			mode: "all",
			matchSeverities: ["info", "notice", "warning", "error"],
			targets: ["slack-notifications"],
			comment: "Routes all datastore prune/verify/GC notifications to Slack",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/user:User::pbs-user-pve-backup",
		type: "pbs:index/user:User",
		parent: STACK_URN,
		outputs: {
			userid: "pve-backup@pbs",
			comment: "Proxmox VE storage integration -- pushes LXC/VM backups",
			enable: true,
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/apiToken:ApiToken::pbs-token-pve-backup",
		type: "pbs:index/apiToken:ApiToken",
		parent: STACK_URN,
		outputs: {
			userid: "pve-backup@pbs",
			tokenName: "pve-storage",
			tokenid: "pve-backup@pbs!pve-storage",
			comment: "Used by /etc/pve/storage.cfg's `pbs` storage entry",
			enable: true,
			// A real export would also carry `value` as ciphertext (the provider
			// marks it an additional secret output) -- never read by the extractor.
			value: {
				"4dabf18193072939515e22adb298388d": "1b47061264138c4ac30d75fd1eb44270",
			},
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pbs:index/acl:Acl::pbs-acl-pve-backup",
		type: "pbs:index/acl:Acl",
		parent: STACK_URN,
		outputs: {
			path: "/datastore/backups",
			ugid: "pve-backup@pbs!pve-storage",
			roleId: "DatastoreBackup",
			propagate: true,
		},
	},
];

describe("logicalName", () => {
	it("returns the last URN segment", () => {
		expect(logicalName(resources[0].urn)).to.equal("pbs-datastore-backups");
	});
});

describe("resourcesOfType", () => {
	it("filters by exact type token", () => {
		expect(
			resourcesOfType(resources, "pbs:index/datastore:Datastore"),
		).to.have.lengthOf(1);
		expect(resourcesOfType(resources, "pbs:index/user:User")).to.have.lengthOf(
			1,
		);
	});
});

describe("extractDatastores", () => {
	it("extracts name, S3 backend, and schedule fields", () => {
		const [datastore] = extractDatastores(resources);
		expect(datastore.name).to.equal("backups");
		expect(datastore.s3Bucket).to.equal("pbs-vm-backup-fcc7acb9");
		expect(datastore.s3Client).to.equal("backblaze-b2");
		expect(datastore.gcSchedule).to.equal("Sun 04:00");
	});
});

describe("extractPruneJobs", () => {
	it("builds a retention summary from only the set keep* fields", () => {
		const [job] = extractPruneJobs(resources);
		expect(job.id).to.equal("backups-retention");
		expect(job.retentionSummary).to.equal(
			"keep-daily=4, keep-weekly=2, keep-monthly=3",
		);
	});

	it("falls back to a no-limit message when no keep* field is set", () => {
		const bare: ExportedResource = {
			urn: "urn:pulumi:x::y::pbs:index/pruneJob:PruneJob::bare",
			type: "pbs:index/pruneJob:PruneJob",
			outputs: { pruneJobId: "bare", store: "backups", schedule: "daily" },
		};
		const [job] = extractPruneJobs([bare]);
		expect(job.retentionSummary).to.equal("no retention limit set");
	});
});

describe("extractVerifyJobs", () => {
	it("extracts schedule and outdated-after fields", () => {
		const [job] = extractVerifyJobs(resources);
		expect(job.id).to.equal("backups-weekly-verify");
		expect(job.ignoreVerified).to.equal(true);
		expect(job.outdatedAfter).to.equal(30);
	});
});

describe("extractNotificationTargets", () => {
	it("extracts name and kind, never the endpoint URL", () => {
		const [target] = extractNotificationTargets(resources);
		expect(target.name).to.equal("slack-notifications");
		expect(target.kind).to.equal("Webhook");
		expect(target).to.not.have.property("url");
	});
});

describe("extractNotificationMatchers", () => {
	it("extracts routing fields", () => {
		const [matcher] = extractNotificationMatchers(resources);
		expect(matcher.mode).to.equal("all");
		expect(matcher.matchSeverities).to.include("error");
		expect(matcher.targets).to.deep.equal(["slack-notifications"]);
	});
});

describe("extractUsers", () => {
	it("extracts userid and enabled state", () => {
		const [user] = extractUsers(resources);
		expect(user.userid).to.equal("pve-backup@pbs");
		expect(user.enabled).to.equal(true);
	});
});

describe("extractApiTokens", () => {
	it("extracts tokenid, never the one-time secret value", () => {
		const [token] = extractApiTokens(resources);
		expect(token.tokenid).to.equal("pve-backup@pbs!pve-storage");
		expect(token).to.not.have.property("value");
	});
});

describe("extractAcls", () => {
	it("extracts path/grantee/role bindings", () => {
		const [acl] = extractAcls(resources);
		expect(acl.path).to.equal("/datastore/backups");
		expect(acl.ugid).to.equal("pve-backup@pbs!pve-storage");
		expect(acl.roleId).to.equal("DatastoreBackup");
		expect(acl.propagate).to.equal(true);
	});
});
