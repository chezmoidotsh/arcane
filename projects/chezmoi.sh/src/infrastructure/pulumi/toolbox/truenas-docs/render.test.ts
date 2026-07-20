import { expect } from "chai";
import { describe, it } from "mocha";

import { render } from "./render";

const fixtureContext = {
	builtAt: "2026-07-13T12:34:56.789Z",
	pools: [
		{
			name: "zp1cs01",
			topology: "```text\n[fake topology diagram]\n```",
			datasetsTree: "zp1cs01\n└─ media",
		},
	],
	scrubTasks: [
		{
			poolName: "zp1cs01",
			thresholdDays: 35,
			enabled: true,
			schedule: { minute: "00", hour: "00", dom: "*", month: "*", dow: "7" },
		},
	],
	snapshotTasks: [
		{
			dataset: "zp1cs01",
			wholePool: true,
			recursive: true,
			lifetimeValue: 4,
			lifetimeUnit: "WEEK",
			enabled: true,
			schedule: { minute: "0", hour: "3", dom: "*", month: "*", dow: "0" },
		},
		{
			dataset: "zp1cs01/media",
			wholePool: false,
			recursive: false,
			lifetimeValue: 8,
			lifetimeUnit: "DAY",
			enabled: true,
			schedule: { minute: "0", hour: "0", dom: "*", month: "*", dow: "*" },
		},
	],
	nfsShares: [
		{
			name: "nfs-share-animes",
			comment: "Dossier partagé des animés",
			mapallUser: "nobody",
			enabled: true,
		},
		{
			name: "nfs-share-documents-shared",
			comment: "Documents personnels d'alexandre",
			readonly: true,
			mapallUser: "paperless-ngx",
			enabled: true,
		},
		{
			name: "nfs-share-disabled-example",
			comment: "Example disabled share",
			enabled: false,
		},
	],
	smbShares: [
		{
			name: "smb-share-films",
			comment: "Dossier partagé des films",
			purpose: "LEGACY_SHARE",
			enabled: true,
		},
	],
	network: {
		hostname: "nas.chezmoi.sh",
		gateway: "10.0.0.1",
		nameservers: ["10.0.0.1", "9.9.9.9"],
		interfaces: [
			{
				name: "ens18",
				mtu: 1500,
				aliases: [{ address: "10.0.0.30", netmask: 22 }],
			},
			{
				name: "ens27",
				mtu: 1500,
				aliases: [{ address: "172.31.255.253", netmask: 30 }],
			},
		],
	},
	backups: {
		destination: "Backblaze B2",
		jobs: [
			{
				description: "Daily sync of users' spaces (shared excluded)",
				source: "/mnt/zp1hs01/userspace",
				direction: "PUSH",
				transferMode: "SYNC",
				enabled: false,
				schedule: { minute: "0", hour: "1", dom: "*", month: "*", dow: "*" },
			},
			{
				description: "Weekly sync of immich.app application",
				source: "/mnt/zp1hs01/applications/managed/app.immich",
				direction: "PUSH",
				transferMode: "SYNC",
				enabled: false,
				schedule: { minute: "0", hour: "2", dom: "*", month: "*", dow: "0" },
			},
		],
		legacyGlobalSync: {
			description: "Backblaze B2 - zp1hs01 sync",
			source: "/mnt/zp1hs01",
			direction: "PUSH",
			transferMode: "SYNC",
			enabled: false,
			schedule: { minute: "0", hour: "2", dom: "*", month: "*", dow: "0" },
		},
		buckets: [
			{
				name: "nas-backup-50a30f2b",
				retentionDays: 7,
				lifecycleDeleteDays: 60,
			},
			{
				// File lock enabled but no default retention configured on the
				// B2 side — the generator must render the gap, not crash on it.
				name: "nas-backup-4e6b1351",
				lifecycleDeleteDays: 60,
			},
		],
	},
	notBackedUpPools: ["zp1cs01"],
	enabledServiceNames: ["ssh", "cifs", "nfs"],
	disabledServiceNames: ["ftp"],
	identities: [
		{ username: "home-assistant", uid: 30001, gid: 30001, smb: true },
		{ username: "immich", uid: 30002, gid: 30002, smb: true },
	],
	aclTemplates: [
		{
			name: "NFSV4_MANAGED_APPLICATION",
			acltype: "NFS4",
			comment: "Owner gets read+write, nobody else has any access.",
		},
		{
			name: "NFSV4_SMB_ALL",
			acltype: "NFS4",
			comment: "Every local SMB account gets read+write.",
		},
	],
	aclAssignments: [
		{ dataset: "zp1cs01/media", template: "NFSV4_SMB_ALL" },
		{
			dataset: "zp1hs01/backups/hass.chezmoi.sh",
			template: "NFSV4_MANAGED_APPLICATION",
		},
	],
};

describe("TRUENAS.md template", () => {
	it("renders every section heading", () => {
		const md = render(fixtureContext);
		expect(md).to.include('<h1 align="center">');
		expect(md).to.include("TrueNAS SCALE - Home NAS");
		expect(md).to.include("## Quick reference");
		expect(md).to.include("## How it's managed");
		expect(md).to.include("## Network & services");
		expect(md).to.include("## Pools, disks & datasets");
		expect(md).to.include("## Applications (Garage & Nginx Proxy Manager)");
		expect(md).to.include("## Shares");
		expect(md).to.include("## Permissions");
		expect(md).to.include("## Backups");
		expect(md).to.include("## Security notes");
		expect(md).to.include("## Procedures");
		expect(md).to.include("### Key terms");
	});

	it("explains the key ZFS terms in the appendix, after the procedures", () => {
		const md = render(fixtureContext);
		expect(md).to.include("**Pool** — a group of physical disks");
		expect(md).to.include("**Snapshot** — an instant, read-only");
		expect(md).to.include("**Scrub** — reads every block in a pool");
		expect(md.indexOf("## Procedures")).to.be.lessThan(
			md.indexOf("### Key terms"),
		);
	});

	it("documents Garage as the Pulumi state dependency", () => {
		const md = render(fixtureContext);
		expect(md).to.include("Pulumi state of every stack in this repository");
		expect(md).to.include("fr.deuxfleurs.garage");
	});

	it("renders the overview before How it's managed", () => {
		const md = render(fixtureContext);
		const overviewIndex = md.indexOf("`nas.chezmoi.sh` is the household NAS");
		const managedIndex = md.indexOf("## How it's managed");
		expect(overviewIndex).to.be.greaterThan(-1);
		expect(overviewIndex).to.be.lessThan(managedIndex);
	});

	it("mentions Proxmox and states the pool count from real data", () => {
		const md = render(fixtureContext);
		expect(md).to.include("virtual machine on Proxmox");
		expect(md).to.include("1 ZFS pool detailed");
		expect(md).to.not.include("&#x60;");
	});

	it("does not mention that anything was imported into state", () => {
		const md = render(fixtureContext);
		expect(md.toLowerCase()).to.not.include("imported");
	});

	it("injects the pre-rendered topology unescaped, and fences the dataset tree", () => {
		const md = render(fixtureContext);
		expect(md).to.include("[fake topology diagram]");
		expect(md).to.include("```text\nzp1cs01\n└─ media\n```");
	});

	it("renders NFS shares as a bullet list, without any host information", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"- `nfs-share-animes` (Dossier partagé des animés) —\n  read/write, mapped to `nobody`",
		);
		expect(md).to.include(
			"- `nfs-share-documents-shared` (Documents personnels d'alexandre) —\n  read-only, mapped to `paperless-ngx`",
		);
		expect(md).to.not.include("10.0.3.195");
	});

	it("marks a disabled NFS share", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"- `nfs-share-disabled-example` (Example disabled share) —\n  read/write, disabled",
		);
	});

	it("explains the SMB purpose presets one per line and renders shares as a bullet list", () => {
		const md = render(fixtureContext);
		expect(md).to.include("**`DEFAULT_SHARE`** — the general-purpose preset.");
		expect(md).to.include(
			"- `smb-share-films` (Dossier partagé des films) — **LEGACY_SHARE**",
		);
	});

	it("omits the NFS/SMB subsection entirely when its share list is empty", () => {
		// "### NFS\n" (not just "### NFS") to avoid a false match against the
		// unrelated "### NFS4 ACL templates" heading in the Permissions section.
		const md = render({ ...fixtureContext, nfsShares: [] });
		expect(md).to.not.include("### NFS\n");
		expect(md).to.include("### SMB");
		expect(md).to.include("SMB is the only share protocol in use right now");

		const mdNoSmb = render({ ...fixtureContext, smbShares: [] });
		expect(mdNoSmb).to.not.include("### SMB");
		expect(mdNoSmb).to.include("### NFS\n");
		expect(mdNoSmb).to.include(
			"NFS is the only share protocol in use right now",
		);
	});

	it("renders network & services as prose naming every interface", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"`nas.chezmoi.sh` sits behind gateway `10.0.0.1` and resolves\nDNS through 10.0.0.1 and 9.9.9.9.",
		);
		expect(md).to.include("`ens18` at `10.0.0.30/22` _(MTU 1500)_");
		expect(md).to.include("`ens27` at `172.31.255.253/30` _(MTU 1500)_");
		expect(md).to.include("ssh, cifs and nfs\nare enabled; ftp stay off.");
	});

	it("renders backup jobs with source paths and human-readable schedules", () => {
		const md = render(fixtureContext);
		expect(md).to.include("`/mnt/zp1hs01/userspace`");
		expect(md).to.include("Each day at 01:00");
		expect(md).to.include("PUSH & SYNC");
		expect(md).to.include("*(disabled)*");
		expect(md).to.include("legacy whole-pool sync of `/mnt/zp1hs01`");
	});

	it("renders the three backup layers with real scrub/snapshot schedules", () => {
		const md = render(fixtureContext);
		expect(md).to.include("### Layer 1: Bitrot detection (scrubbing)");
		expect(md).to.include(
			"Each Sunday at 00:00**:\n  scrub `zp1cs01` (35-day alert threshold)",
		);
		expect(md).to.include(
			"### Layer 2: Accidental-deletion protection (snapshots)",
		);
		expect(md).to.include(
			"Each Sunday at 03:00**:\n  recursive snapshot of `zp1cs01` (whole pool),\n  4-week retention",
		);
		expect(md).to.include(
			"Each day at 00:00**:\n  snapshot of `zp1cs01/media`,\n  8-day retention",
		);
		expect(md).to.include("### Layer 3: Site-loss protection (remote sync)");
	});

	it("renders each bucket's file-lock retention, including its absence", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"`nas-backup-50a30f2b` -- 7-day file lock retention, 60-day",
		);
		expect(md).to.include(
			"`nas-backup-4e6b1351` -- file lock **deliberately neutralized**",
		);
	});

	it("calls out pools that aren't included in the off-site sync", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"zp1cs01 isn't included in this off-site sync — a\ndeliberate trade-off, not an oversight",
		);
	});

	it("keeps a single, unified note about share IP restrictions", () => {
		const md = render(fixtureContext);
		expect(md).to.not.include("show-secrets");
		expect(md).to.include("Share IP restrictions live entirely on the NAS");
	});

	it("renders identities as a table", () => {
		const md = render(fixtureContext);
		expect(md).to.include("| `home-assistant` | 30001 | 30001 | yes |");
		expect(md).to.include("| `immich` | 30002 | 30002 | yes |");
	});

	it("renders NFS4 ACL templates and dataset assignments as tables", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"| `NFSV4_MANAGED_APPLICATION` | NFS4 | Owner gets read+write, nobody else has any access. |",
		);
		expect(md).to.include(
			"| `NFSV4_SMB_ALL` | NFS4 | Every local SMB account gets read+write. |",
		);
		expect(md).to.include("| `zp1cs01/media` | `NFSV4_SMB_ALL` |");
		expect(md).to.include(
			"| `zp1hs01/backups/hass.chezmoi.sh` | `NFSV4_MANAGED_APPLICATION` |",
		);
	});

	it("explains permissions are a manual guide, not something Pulumi applies", () => {
		const md = render(fixtureContext);
		expect(md).to.include("cannot apply filesystem ACLs to a dataset");
		expect(md).to.include("Apply the matching template to each dataset below");
	});
});
