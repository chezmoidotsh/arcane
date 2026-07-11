import { expect } from "chai";
import * as fs from "fs";
import * as Handlebars from "handlebars";
import { describe, it } from "mocha";
import * as path from "path";

import { registerHelpers } from "./helpers";

function render(context: unknown): string {
	const handlebars = Handlebars.create();
	registerHelpers(handlebars);

	const partialsDir = path.join(__dirname, "partials");
	for (const file of fs.readdirSync(partialsDir)) {
		const name = path.basename(file, ".hbs");
		handlebars.registerPartial(
			name,
			fs.readFileSync(path.join(partialsDir, file), "utf8"),
		);
	}

	const template = handlebars.compile(
		fs.readFileSync(path.join(__dirname, "template.hbs"), "utf8"),
	);
	return template(context);
}

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
		buckets: [
			{
				name: "nas-backup-50a30f2b",
				retentionDays: 7,
				lifecycleDeleteDays: 60,
				sync: {
					source: "/mnt/zp1hs01",
					direction: "PUSH",
					transferMode: "SYNC",
					schedule: { minute: "0", hour: "0", dom: "*", month: "*", dow: "0" },
				},
			},
			{
				name: "garage-backup-51891f906ced",
				retentionDays: 7,
				lifecycleDeleteDays: 60,
			},
		],
	},
	notBackedUpPools: ["zp1cs01"],
	enabledServiceNames: ["ssh", "cifs", "nfs"],
	disabledServiceNames: ["ftp"],
};

describe("TRUENAS.md template", () => {
	it("renders every section heading", () => {
		const md = render(fixtureContext);
		expect(md).to.include("# TrueNAS (`nas.chezmoi.sh`)");
		expect(md).to.include("## How it's managed");
		expect(md).to.include("## Network & services");
		expect(md).to.include("## Pools, disks & datasets");
		expect(md).to.include("## Shares");
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

	it("renders backups leading with the source path and a human-readable schedule", () => {
		const md = render(fixtureContext);
		expect(md).to.include("`/mnt/zp1hs01` is pushed there");
		expect(md).to.include("weekly, Sundays at 00:00");
		expect(md).to.include("PUSH/SYNC");
		expect(md).to.include("replicated by Garage");
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
});
