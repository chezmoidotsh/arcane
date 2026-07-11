import { LocalFile } from "@chezmoi.sh/pulumi-lib";
import * as pulumi from "@pulumi/pulumi";
import type * as truenas from "@pulumi/truenas";
import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";

import { backupSummary } from "../backups";
import { networkConfig, networkInterfaces } from "../truenas/network";
import { services } from "../truenas/services";
import { nfsShares, smbShares } from "../truenas/shares";
import { zp1cs01 } from "../truenas/zpools/zp1cs01";
import { zp1hs01 } from "../truenas/zpools/zp1hs01";
import { registerHelpers } from "./helpers";

/**
 * `nfsShares`/`smbShares` export the actual `truenas.ShareNfs`/`ShareSmb`
 * resources (not a hand-maintained plain-data summary) -- these two pull
 * just the fields the template needs back out of each resource's Outputs.
 * The resource's own logical name isn't one of its Outputs (NFS shares
 * don't even have a `name` field), so it's recovered from `urn`, whose last
 * `::`-separated segment is always that logical name regardless of parenting.
 */
function resourceName(urn: pulumi.Output<string>): pulumi.Output<string> {
	return urn.apply((u) => u.split("::").pop() as string);
}

function nfsShareData(share: truenas.ShareNfs) {
	return pulumi
		.all([
			resourceName(share.urn),
			share.comment,
			share.mapallUser,
			share.enabled,
			share.readonly,
		])
		.apply(([name, comment, mapallUser, enabled, readonly]) => ({
			name,
			comment,
			mapallUser,
			enabled,
			readonly,
		}));
}

function smbShareData(share: truenas.ShareSmb) {
	return pulumi
		.all([
			resourceName(share.urn),
			share.comment,
			share.purpose,
			share.enabled,
			share.readonly,
		])
		.apply(([name, comment, purpose, enabled, readonly]) => ({
			name,
			comment,
			purpose,
			enabled,
			readonly,
		}));
}

// Generates `projects/chezmoi.sh/docs/TRUENAS.md` from this stack's own
// as-code TrueNAS config, so the doc can't silently drift from what's
// actually declared here. Only `topology()`/`datasetsTree()` need a live
// fetch (see ../../../../catalog/pulumi/components/truenas-pool); everything
// else (shares/network/services/backups) is already plain data.

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

const enabledServiceNames = services
	.filter((s) => s.enabled)
	.map((s) => s.service);
const disabledServiceNames = services
	.filter((s) => !s.enabled)
	.map((s) => s.service);

// Pool names that no B2 bucket syncs from (`sync.source` is `/mnt/<pool>`)
// -- called out explicitly in the Backups section instead of only being
// inferable by comparing pool names against bucket sources by hand.
const backedUpPoolNames = new Set(
	backupSummary.buckets
		.filter((b) => b.sync)
		.map((b) => b.sync!.source.replace(/^\/mnt\//, "")),
);
const notBackedUpPools = [zp1cs01.name, zp1hs01.name].filter(
	(name) => !backedUpPoolNames.has(name),
);

const content = pulumi
	.all([
		// `.apply((t) => t.toString())` here, not after `pulumi.all` combines
		// them -- `TrueNASTopology` is a class instance, and combining Outputs
		// through `pulumi.all` doesn't preserve its prototype (only plain
		// data), so calling `.toString()` after the fact silently falls back
		// to `Object.prototype.toString()` (`"[object Object]"`) instead of
		// the real ASCII diagram.
		zp1cs01.topology().apply((t) => t.toString()),
		zp1cs01.datasetsTree(),
		zp1hs01.topology().apply((t) => t.toString()),
		zp1hs01.datasetsTree(),
		pulumi.all(nfsShares.map(nfsShareData)),
		pulumi.all(smbShares.map(smbShareData)),
	])
	.apply(
		([
			zp1cs01Topology,
			zp1cs01DatasetsTree,
			zp1hs01Topology,
			zp1hs01DatasetsTree,
			nfsSharesData,
			smbSharesData,
		]) =>
			template({
				pools: [
					{
						name: zp1cs01.name,
						topology: zp1cs01Topology,
						datasetsTree: zp1cs01DatasetsTree,
					},
					{
						name: zp1hs01.name,
						topology: zp1hs01Topology,
						datasetsTree: zp1hs01DatasetsTree,
					},
				],
				nfsShares: nfsSharesData,
				smbShares: smbSharesData,
				network: {
					hostname: networkConfig.hostname,
					gateway: networkConfig.gateway,
					nameservers: networkConfig.nameservers,
					interfaces: networkInterfaces,
				},
				backups: backupSummary,
				notBackedUpPools,
				enabledServiceNames,
				disabledServiceNames,
			}),
	);

// Pulumi's nodejs runtime always executes this program from the directory
// containing Pulumi.yaml (this stack's own project root), so `process.cwd()`
// here reliably resolves to `.../pulumi`, landing on
// `projects/chezmoi.sh/docs/TRUENAS.md`.
new LocalFile("truenas-doc", {
	path: path.resolve(process.cwd(), "../../../docs/TRUENAS.md"),
	content,
});
