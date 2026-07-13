import { expect } from "chai";
import { describe, it } from "mocha";

import {
	computeNotBackedUpPools,
	extractAclAssignments,
	extractAclTemplates,
	extractBuckets,
	extractCloudSyncJobs,
	extractIdentities,
	extractLegacyGlobalSync,
	extractNetwork,
	extractNfsShares,
	extractPoolNames,
	extractScrubTasks,
	extractServices,
	extractSmbShares,
	extractSnapshotTasks,
	hasAncestorType,
	logicalName,
	resourcesOfType,
	typeChain,
} from "./extract";
import type { ExportedResource } from "./stack-export";

/**
 * A small, hand-trimmed fixture shaped like a real `pulumi stack export`
 * (URNs, type tokens and output field names copied verbatim from an actual
 * export of the `chezmoi_sh.live` stack) -- not the live stack itself, so
 * these tests never touch the network or `child_process`.
 */
const STACK_URN =
	"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::pulumi:pulumi:Stack::chezmoi-sh-infra-chezmoi_sh.live";

const resources: ExportedResource[] = [
	{
		urn: STACK_URN,
		type: "pulumi:pulumi:Stack",
		outputs: {
			nfs4AclAssignments: [
				{ dataset: "zp1cs01/media", template: "NFSV4_SMB_ALL" },
				{
					dataset: "zp1hs01/applications/managed/app.immich",
					template: "NFSV4_MANAGED_APPLICATION",
				},
			],
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool::zp1cs01",
		type: "chezmoi:truenas:Pool",
		parent: STACK_URN,
		outputs: {},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool::zp1hs01",
		type: "chezmoi:truenas:Pool",
		parent: STACK_URN,
		outputs: {},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/dataset:Dataset$truenas:index/shareNfs:ShareNfs::nfs-share-movies",
		type: "truenas:index/shareNfs:ShareNfs",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/dataset:Dataset::zp1cs01-media-movies",
		outputs: {
			comment: "Films (Jellyfin)",
			enabled: true,
			hosts: ["10.0.3.195"], // never read by any extractor -- IP allowlisting stays NAS-side, doc-invisible on purpose
			mapallGroup: "nogroup",
			mapallUser: "nobody",
			readonly: true,
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/shareSmb:ShareSmb::smb-share-mes-documents",
		type: "truenas:index/shareSmb:ShareSmb",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset::zp1hs01-userspace",
		outputs: {
			// TrueNAS-side display name -- deliberately different from the
			// resource's own logical name, to prove extractSmbShares ignores it.
			name: "Mes Documents",
			comment: "Documents personnels",
			enabled: true,
			purpose: "PRIVATE_DATASETS_SHARE",
			readonly: false,
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::random:index/randomPassword:RandomPassword$truenas:index/user:User::user-home-assistant",
		type: "truenas:index/user:User",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::random:index/randomPassword:RandomPassword::password-home-assistant",
		outputs: {
			username: "home-assistant",
			uid: 30001,
			group: 137,
			smb: true,
			// Secret-shaped output, as a real un-`--show-secrets`-ed export would
			// carry it -- no extractor should ever read this as plain data.
			password: {
				"4dabf18193072939515e22adb298388d": "1b47061264138c4ac30d75fd1eb44270",
				ciphertext: "v1:fake:fake==",
			},
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/filesystemAclTemplate:FilesystemAclTemplate::acl-template-nfs4-smb-all",
		type: "truenas:index/filesystemAclTemplate:FilesystemAclTemplate",
		parent: STACK_URN,
		outputs: {
			name: "NFSV4_SMB_ALL",
			acltype: "NFS4",
			comment: "Every local SMB account gets read+write.",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/cloudSync:CloudSync::nas-backup-cloudsync",
		type: "truenas:index/cloudSync:CloudSync",
		parent: STACK_URN,
		outputs: {
			description: "Backblaze B2 - zp1hs01 sync",
			direction: "PUSH",
			enabled: true,
			path: "/mnt/zp1hs01",
			scheduleDom: "*",
			scheduleDow: "0",
			scheduleHour: "2",
			scheduleMinute: "0",
			scheduleMonth: "*",
			transferMode: "SYNC",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/dataset:Dataset$truenas:index/cloudSync:CloudSync::cs-b2-zp1hs01-zp1hs01-applications/truenas",
		type: "truenas:index/cloudSync:CloudSync",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/dataset:Dataset::zp1hs01-applications-truenas",
		outputs: {
			description: "B2 — Weekly sync of TrueNAS applications",
			direction: "PUSH",
			enabled: true,
			path: "/mnt/zp1hs01/applications/truenas",
			scheduleDom: "*",
			scheduleDow: "0",
			scheduleHour: "2",
			scheduleMinute: "0",
			scheduleMonth: "*",
			transferMode: "SYNC",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::b2:index/bucket:Bucket::nas-backup",
		type: "b2:index/bucket:Bucket",
		parent: STACK_URN,
		outputs: {
			bucketName: "nas-backup-50a30f2b",
			fileLockConfigurations: [
				{ defaultRetention: { period: { duration: 7, unit: "days" } } },
			],
			lifecycleRules: [{ daysFromHidingToDeleting: 60 }],
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/scrubTask:ScrubTask::zp1hs01-scrub",
		type: "truenas:index/scrubTask:ScrubTask",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool::zp1hs01",
		outputs: {
			poolName: "zp1hs01",
			threshold: 35,
			enabled: true,
			scheduleMinute: "00",
			scheduleHour: "00",
			scheduleDom: "*",
			scheduleMonth: "*",
			scheduleDow: "7",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/snapshotTask:SnapshotTask::zp1hs01-snapshot",
		type: "truenas:index/snapshotTask:SnapshotTask",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool::zp1hs01",
		outputs: {
			dataset: "zp1hs01",
			recursive: true,
			lifetimeValue: 4,
			lifetimeUnit: "WEEK",
			enabled: true,
			scheduleMinute: "0",
			scheduleHour: "3",
			scheduleDom: "*",
			scheduleMonth: "*",
			scheduleDow: "0",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/dataset:Dataset$truenas:index/snapshotTask:SnapshotTask::zp1hs01-snapshot-app-immich",
		type: "truenas:index/snapshotTask:SnapshotTask",
		parent:
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/dataset:Dataset::zp1hs01-applications-managed-app.immich",
		outputs: {
			dataset: "zp1hs01/applications/managed/app.immich",
			recursive: false,
			lifetimeValue: 8,
			lifetimeUnit: "DAY",
			enabled: true,
			scheduleMinute: "0",
			scheduleHour: "0",
			scheduleDom: "*",
			scheduleMonth: "*",
			scheduleDow: "*",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/networkConfig:NetworkConfig::network-config",
		type: "truenas:index/networkConfig:NetworkConfig",
		parent: STACK_URN,
		outputs: {
			hostname: "nas.chezmoi.sh",
			ipv4gateway: "10.0.0.1",
			nameserver1: "10.0.0.1",
			nameserver2: "9.9.9.9",
			nameserver3: "",
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/networkInterface:NetworkInterface::network-interface-ens18",
		type: "truenas:index/networkInterface:NetworkInterface",
		parent: STACK_URN,
		outputs: {
			name: "ens18",
			mtu: 1500,
			aliases: [
				{ address: "10.0.0.30", netmask: 22, type: "INET" },
				{ address: "10.0.0.31", netmask: 22, type: "INET" },
			],
		},
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/service:Service::service-nfs",
		type: "truenas:index/service:Service",
		parent: STACK_URN,
		outputs: { service: "nfs", enable: true, state: "RUNNING" },
	},
	{
		urn: "urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/service:Service::service-snmp",
		type: "truenas:index/service:Service",
		parent: STACK_URN,
		outputs: { service: "snmp", enable: false, state: "STOPPED" },
	},
];

describe("URN helpers", () => {
	it("logicalName() reads the last ::-segment regardless of parenting depth", () => {
		expect(
			logicalName(
				"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/shareSmb:ShareSmb::smb-share-mes-documents",
			),
		).to.equal("smb-share-mes-documents");
		expect(logicalName(STACK_URN)).to.equal("chezmoi-sh-infra-chezmoi_sh.live");
	});

	it("typeChain() splits the $-separated ancestor-to-self chain", () => {
		expect(
			typeChain(
				"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/shareNfs:ShareNfs::nfs-share-movies",
			),
		).to.deep.equal([
			"chezmoi:truenas:Pool",
			"truenas:index/dataset:Dataset",
			"truenas:index/shareNfs:ShareNfs",
		]);
	});

	it("hasAncestorType() is true when the type is a strict ancestor, false for the resource's own type or an unrelated one", () => {
		const urn =
			"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::chezmoi:truenas:Pool$truenas:index/dataset:Dataset$truenas:index/cloudSync:CloudSync::cs-b2-zp1hs01-zp1hs01-applications/truenas";
		expect(hasAncestorType(urn, "chezmoi:truenas:Pool")).to.be.true;
		expect(hasAncestorType(urn, "truenas:index/cloudSync:CloudSync")).to.be
			.false;
		expect(hasAncestorType(STACK_URN, "chezmoi:truenas:Pool")).to.be.false;
	});
});

describe("resourcesOfType()", () => {
	it("filters by exact type token", () => {
		expect(
			resourcesOfType(resources, "truenas:index/service:Service"),
		).to.have.lengthOf(2);
		expect(
			resourcesOfType(resources, "truenas:index/user:User"),
		).to.have.lengthOf(1);
	});
});

describe("extractNfsShares()", () => {
	it("uses the resource's own logical name, not any output field", () => {
		const [share] = extractNfsShares(resources);
		expect(share).to.deep.equal({
			name: "nfs-share-movies",
			comment: "Films (Jellyfin)",
			mapallUser: "nobody",
			enabled: true,
			readonly: true,
		});
	});
});

describe("extractSmbShares()", () => {
	it("uses the resource's own logical name, ignoring outputs.name (the TrueNAS-side display name)", () => {
		const [share] = extractSmbShares(resources);
		expect(share.name).to.equal("smb-share-mes-documents");
		expect(share.purpose).to.equal("PRIVATE_DATASETS_SHARE");
	});
});

describe("extractIdentities()", () => {
	it("reads gid straight from outputs.group, and never reads the secret password field", () => {
		const [identity] = extractIdentities(resources);
		expect(identity).to.deep.equal({
			username: "home-assistant",
			uid: 30001,
			gid: 137,
			smb: true,
		});
	});
});

describe("extractAclTemplates()", () => {
	it("extracts name/acltype/comment", () => {
		expect(extractAclTemplates(resources)).to.deep.equal([
			{
				name: "NFSV4_SMB_ALL",
				acltype: "NFS4",
				comment: "Every local SMB account gets read+write.",
			},
		]);
	});
});

describe("extractAclAssignments()", () => {
	it("reads the nfs4AclAssignments stack output verbatim", () => {
		const stackOutputs = resources.find((r) => r.type === "pulumi:pulumi:Stack")
			?.outputs as Record<string, unknown>;
		expect(extractAclAssignments(stackOutputs)).to.deep.equal([
			{ dataset: "zp1cs01/media", template: "NFSV4_SMB_ALL" },
			{
				dataset: "zp1hs01/applications/managed/app.immich",
				template: "NFSV4_MANAGED_APPLICATION",
			},
		]);
	});

	it("defaults to an empty array when the output is absent", () => {
		expect(extractAclAssignments({})).to.deep.equal([]);
	});
});

describe("extractCloudSyncJobs() / extractLegacyGlobalSync()", () => {
	it("splits granular (pool-ancestored) jobs from the legacy whole-pool sync, renaming path to source", () => {
		const jobs = extractCloudSyncJobs(resources);
		expect(jobs).to.have.lengthOf(1);
		expect(jobs[0]).to.deep.equal({
			description: "B2 — Weekly sync of TrueNAS applications",
			source: "/mnt/zp1hs01/applications/truenas",
			direction: "PUSH",
			transferMode: "SYNC",
			enabled: true,
			schedule: { minute: "0", hour: "2", dom: "*", month: "*", dow: "0" },
		});

		const legacy = extractLegacyGlobalSync(resources);
		expect(legacy.source).to.equal("/mnt/zp1hs01");
		expect(legacy.description).to.equal("Backblaze B2 - zp1hs01 sync");
	});

	it("throws when no legacy global sync exists in state", () => {
		expect(() =>
			extractLegacyGlobalSync(
				resources.filter(
					(r) =>
						r.urn !==
						"urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::truenas:index/cloudSync:CloudSync::nas-backup-cloudsync",
				),
			),
		).to.throw("No legacy global CloudSync task found in stack state");
	});
});

describe("extractBuckets()", () => {
	it("unwraps the nested file-lock retention and lifecycle prune window", () => {
		expect(extractBuckets(resources)).to.deep.equal([
			{
				name: "nas-backup-50a30f2b",
				retentionDays: 7,
				lifecycleDeleteDays: 60,
			},
		]);
	});
});

describe("extractPoolNames()", () => {
	it("reads pool names from each chezmoi:truenas:Pool instance's own URN (the component registers no outputs)", () => {
		expect(extractPoolNames(resources).sort()).to.deep.equal([
			"zp1cs01",
			"zp1hs01",
		]);
	});
});

describe("extractScrubTasks()", () => {
	it("reads poolName from the resource's own read-only output, not URN ancestry", () => {
		expect(extractScrubTasks(resources)).to.deep.equal([
			{
				poolName: "zp1hs01",
				thresholdDays: 35,
				enabled: true,
				schedule: {
					minute: "00",
					hour: "00",
					dom: "*",
					month: "*",
					dow: "7",
				},
			},
		]);
	});
});

describe("extractSnapshotTasks()", () => {
	it("flags the whole-pool task via wholePool, sorted with the pool root before its children", () => {
		const tasks = extractSnapshotTasks(resources);
		expect(tasks).to.have.lengthOf(2);
		expect(tasks[0]).to.deep.equal({
			dataset: "zp1hs01",
			wholePool: true,
			recursive: true,
			lifetimeValue: 4,
			lifetimeUnit: "WEEK",
			enabled: true,
			schedule: { minute: "0", hour: "3", dom: "*", month: "*", dow: "0" },
		});
		expect(tasks[1]).to.deep.equal({
			dataset: "zp1hs01/applications/managed/app.immich",
			wholePool: false,
			recursive: false,
			lifetimeValue: 8,
			lifetimeUnit: "DAY",
			enabled: true,
			schedule: { minute: "0", hour: "0", dom: "*", month: "*", dow: "*" },
		});
	});
});

describe("extractNetwork()", () => {
	it("maps NetworkConfig + every NetworkInterface, dropping empty nameservers", () => {
		expect(extractNetwork(resources)).to.deep.equal({
			hostname: "nas.chezmoi.sh",
			gateway: "10.0.0.1",
			nameservers: ["10.0.0.1", "9.9.9.9"],
			interfaces: [
				{
					name: "ens18",
					mtu: 1500,
					aliases: [
						{ address: "10.0.0.30", netmask: 22 },
						{ address: "10.0.0.31", netmask: 22 },
					],
				},
			],
		});
	});
});

describe("extractServices()", () => {
	it("splits services into enabled/disabled by outputs.enable", () => {
		expect(extractServices(resources)).to.deep.equal({
			enabledServiceNames: ["nfs"],
			disabledServiceNames: ["snmp"],
		});
	});
});

describe("computeNotBackedUpPools()", () => {
	it("flags a pool with no granular job and no legacy sync covering it", () => {
		const jobs = extractCloudSyncJobs(resources);
		const legacy = extractLegacyGlobalSync(resources);
		expect(
			computeNotBackedUpPools(["zp1cs01", "zp1hs01"], jobs, legacy),
		).to.deep.equal(["zp1cs01"]);
	});
});
