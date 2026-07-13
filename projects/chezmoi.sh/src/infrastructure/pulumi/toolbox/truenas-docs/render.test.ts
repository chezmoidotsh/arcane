import { expect } from "chai";
import { describe, it } from "mocha";

import { render } from "./render";

const fixtureContext = {
	pools: [
		{
			name: "zp1cs01",
			topology: "```text\n[fake topology diagram]\n```",
			datasetsTree: "zp1cs01\n└─ media",
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
				name: "nas-backup-4e6b1351",
				retentionDays: 7,
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
		expect(md).to.include("# TrueNAS (`nas.chezmoi.sh`)");
		expect(md).to.include("## How it's managed");
		expect(md).to.include("## Network & services");
		expect(md).to.include("## Pools, disks & datasets");
		expect(md).to.include("## Shares");
		expect(md).to.include("## Permissions");
		expect(md).to.include("## Backups");
		expect(md).to.include("## Security notes");
	});

	it("renders the overview before How it's managed", () => {
		const md = render(fixtureContext);
		const overviewIndex = md.indexOf("`nas.chezmoi.sh` is the home NAS");
		const managedIndex = md.indexOf("## How it's managed");
		expect(overviewIndex).to.be.greaterThan(-1);
		expect(overviewIndex).to.be.lessThan(managedIndex);
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
			"- `nfs-share-animes` (Dossier partagé des animés) --\n  read/write, mapped to `nobody`",
		);
		expect(md).to.include(
			"- `nfs-share-documents-shared` (Documents personnels d'alexandre) --\n  read-only, mapped to `paperless-ngx`",
		);
		expect(md).to.not.include("10.0.3.195");
	});

	it("marks a disabled NFS share", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"- `nfs-share-disabled-example` (Example disabled share) --\n  read/write, disabled",
		);
	});

	it("explains the SMB purpose presets and renders shares as a bullet list", () => {
		const md = render(fixtureContext);
		expect(md).to.include("`DEFAULT_SHARE` is the");
		expect(md).to.include(
			"- `smb-share-films` (Dossier partagé des films) -- LEGACY_SHARE",
		);
	});

	it("renders network & services as prose naming every interface", () => {
		const md = render(fixtureContext);
		expect(md).to.include(
			"`nas.chezmoi.sh` sits behind gateway `10.0.0.1` and resolves\nDNS through 10.0.0.1 and 9.9.9.9.",
		);
		expect(md).to.include("`ens18` at `10.0.0.30/22` (MTU 1500)");
		expect(md).to.include("`ens27` at `172.31.255.253/30` (MTU 1500)");
		expect(md).to.include("ssh, cifs and nfs\nare enabled; ftp stay off.");
	});

	it("renders backup jobs with source paths and human-readable schedules", () => {
		const md = render(fixtureContext);
		expect(md).to.include("`/mnt/zp1hs01/userspace`");
		expect(md).to.include("daily at 01:00");
		expect(md).to.include("PUSH/SYNC");
		expect(md).to.include("*(disabled)*");
		expect(md).to.include("legacy global sync of `/mnt/zp1hs01`");
	});

	it("calls out pools that aren't included in the off-site sync", () => {
		const md = render(fixtureContext);
		expect(md).to.include("zp1cs01 isn't included in this off-site sync.");
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
