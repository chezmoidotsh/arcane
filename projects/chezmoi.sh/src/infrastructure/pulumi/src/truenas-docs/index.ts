import { LocalFile, must } from "@chezmoi.sh/pulumi-lib";
import type * as b2 from "@pulumi/b2";
import * as pulumi from "@pulumi/pulumi";
import type * as truenas from "@pulumi/truenas";
import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";
import { legacyTrueNASBackupBucket, trueNASBackupBucket } from "../backblaze";
import {
	builtInUsersGroup,
	mediaAcl,
	nobodyUser,
	userspaceSharedAcl,
} from "../truenas/acls";
import { granularCloudSyncTasks, legacyGlobalSync } from "../truenas/cloudsync";
import { networkConfig, networkInterfaces } from "../truenas/network";
import { services } from "../truenas/services";
import { nfsShares, smbShares } from "../truenas/shares";
import {
	homeAssistantBackupAcl,
	homeAssistantUser,
} from "../truenas/users/home-assistant";
import { immichAcl, immichUser } from "../truenas/users/immich";
import { paperlessAcl, paperlessUser } from "../truenas/users/paperless-ngx";
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

/** Renders one `truenas.User` (with its primary group, taken from `group` if a matching `truenas.Group` wasn't declared) into the plain-data shape the Permissions/Identities table expects. */
function identityData(user: truenas.User, primaryGroup?: truenas.Group) {
	return pulumi
		.all([
			user.username,
			user.uid,
			primaryGroup ? primaryGroup.gid : user.group,
			user.smb,
		])
		.apply(([username, uid, gid, smb]) => ({ username, uid, gid, smb }));
}

/**
 * Reduces a `FilesystemAcl`'s `dacls` down to an `ls -l`-style 9-character
 * mode string (owner/group/other, `rwx`/`-`) -- only the access-ACL entries
 * (`default: false`) count; the identical `default: true` entries exist
 * purely so files created later inherit the same policy, not to describe
 * the path itself.
 */
function modeString(
	dacls: {
		tag: string;
		default: boolean;
		permRead: boolean;
		permWrite: boolean;
		permExecute: boolean;
	}[],
): string {
	const triad = (tag: string) => {
		const entry = dacls.find((d) => d.tag === tag && !d.default);
		return `${entry?.permRead ? "r" : "-"}${entry?.permWrite ? "w" : "-"}${entry?.permExecute ? "x" : "-"}`;
	};
	return `${triad("USER_OBJ")}${triad("GROUP_OBJ")}${triad("OTHER")}`;
}

/**
 * Renders one `FilesystemAcl` into the plain-data shape the Permissions
 * table expects. `owner`/`group` are the *real* identity names -- a
 * `truenas.User`'s `.username` (own primary group created via
 * `groupCreate: true` matches the username, so the same value labels both
 * columns) or a `truenas.getUser`/`getGroup` lookup's `.username`/`.name`
 * for the built-in identities -- never a hand-typed string that could drift
 * from whichever account actually owns the path. The caller pairs each ACL
 * with its owning identity (it's the one that wired them together, in
 * `../truenas/acls.ts` or `../truenas/users/*.ts`); reverse-deriving that
 * pairing here from the ACL's numeric `uid`/`gid` alone would be far more
 * fragile than just asking the identity for its own name.
 */
function aclData(row: {
	acl: truenas.FilesystemAcl;
	owner: pulumi.Input<string>;
	group: pulumi.Input<string>;
}) {
	return pulumi
		.all([row.acl.path, row.acl.dacls, row.acl.acltype, row.owner, row.group])
		.apply(([path, dacls, acltype, owner, group]) => ({
			path: path.replace(/^\/mnt\//, ""),
			owner,
			group,
			mode: modeString(dacls),
			acltype,
		}));
}

/**
 * `.apply((t) => t.toString())` here, not after `pulumi.all` combines it with
 * the other pool -- `TrueNASTopology` is a class instance, and combining
 * Outputs through `pulumi.all` doesn't preserve its prototype (only plain
 * data), so calling `.toString()` after the fact silently falls back to
 * `Object.prototype.toString()` (`"[object Object]"`) instead of the real
 * ASCII diagram.
 */
function poolData(pool: typeof zp1cs01 | typeof zp1hs01) {
	return pulumi
		.all([pool.topology().apply((t) => t.toString()), pool.datasetsTree()])
		.apply(([topology, datasetsTree]) => ({
			name: pool.name,
			topology,
			datasetsTree,
		}));
}

/**
 * Renders one CloudSync task (granular job or the legacy global sync) into
 * the plain-data shape the template expects. Split into two `pulumi.all`
 * calls of 5 elements each -- `pulumi.all`'s typed-tuple overloads stop at 8
 * elements, and this task combines 10 Outputs of mixed types; past that
 * limit it silently falls back to its single-type-array overload and every
 * destructured field becomes untyped.
 */
function jobData(task: truenas.CloudSync) {
	return pulumi
		.all([
			pulumi.all([
				task.description,
				task.path,
				task.direction,
				task.transferMode,
				task.enabled,
			]),
			pulumi.all([
				task.scheduleMinute,
				task.scheduleHour,
				task.scheduleDom,
				task.scheduleMonth,
				task.scheduleDow,
			]),
		])
		.apply(
			([
				[description, source, direction, transferMode, enabled],
				[minute, hour, dom, month, dow],
			]) => ({
				description,
				source,
				direction,
				transferMode,
				enabled,
				schedule: { minute, hour, dom, month, dow },
			}),
		);
}

/** Renders one B2 bucket's File Lock retention + lifecycle prune window into the plain-data shape the template expects. */
function bucketData(bucket: b2.Bucket) {
	return pulumi
		.all([
			bucket.bucketName,
			bucket.fileLockConfigurations,
			bucket.lifecycleRules,
		])
		.apply(([name, lockConfigs, lifecycleRules]) => {
			const retention = must(
				must(lockConfigs, `${name}: no fileLockConfigurations`)[0]
					.defaultRetention,
				`${name}: no defaultRetention`,
			);
			return {
				name,
				retentionDays: must(retention.period, `${name}: no retention period`)
					.duration,
				lifecycleDeleteDays: must(
					lifecycleRules,
					`${name}: no lifecycleRules`,
				)[0].daysFromHidingToDeleting,
			};
		});
}

function backupsData() {
	return pulumi
		.all([
			pulumi.all(granularCloudSyncTasks.map(jobData)),
			jobData(legacyGlobalSync),
			bucketData(legacyTrueNASBackupBucket),
			bucketData(trueNASBackupBucket),
		])
		.apply(([jobs, legacyGlobalSyncDoc, legacyBucket, currentBucket]) => ({
			destination: "Backblaze B2",
			jobs,
			legacyGlobalSync: legacyGlobalSyncDoc,
			buckets: [legacyBucket, currentBucket],
		}));
}

/**
 * Pool names that no B2 job syncs from (`job.source` is `/mnt/<pool>/...`)
 * -- called out explicitly in the Backups section instead of only being
 * inferable by comparing pool names against job sources by hand.
 */
function notBackedUpPools(backups: {
	jobs: { source: string }[];
	legacyGlobalSync: { source: string };
}): string[] {
	const backedUpPoolNames = new Set(
		[backups.legacyGlobalSync, ...backups.jobs].map(
			(j) => j.source.replace(/^\/mnt\//, "").split("/")[0],
		),
	);
	return [zp1cs01.name, zp1hs01.name].filter((n) => !backedUpPoolNames.has(n));
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

// `owner`/`group` per row are derived from the real identity that owns
// each path, never a hardcoded string -- see `aclData()`. Accounts created
// with `groupCreate: true` (every `truenas.User` in `../truenas/users/`)
// get a primary group matching their own username, so `user.username`
// labels both columns for those; the two ownerless datasets use the real
// built-in `nobody`/`builtin_users` names from `../truenas/acls.ts`.
const nobodyUsername = nobodyUser.then((u) => u.username);
const builtInUsersGroupName = builtInUsersGroup.then((g) => g.name);

const aclRows = [
	{ acl: mediaAcl, owner: nobodyUsername, group: builtInUsersGroupName },
	{
		acl: userspaceSharedAcl,
		owner: nobodyUsername,
		group: builtInUsersGroupName,
	},
	{
		acl: homeAssistantBackupAcl,
		owner: homeAssistantUser.username,
		group: homeAssistantUser.username,
	},
	{ acl: immichAcl, owner: immichUser.username, group: immichUser.username },
	{
		acl: paperlessAcl,
		owner: paperlessUser.username,
		group: paperlessUser.username,
	},
];

const content = pulumi
	.all([
		poolData(zp1cs01),
		poolData(zp1hs01),
		pulumi.all(nfsShares.map(nfsShareData)),
		pulumi.all(smbShares.map(smbShareData)),
		backupsData(),
		pulumi.all([
			identityData(homeAssistantUser),
			identityData(immichUser),
			identityData(paperlessUser),
		]),
		pulumi.all(aclRows.map(aclData)),
	])
	.apply(
		([
			zp1cs01Doc,
			zp1hs01Doc,
			nfsSharesData,
			smbSharesData,
			backups,
			identities,
			acls,
		]) =>
			template({
				pools: [zp1cs01Doc, zp1hs01Doc],
				nfsShares: nfsSharesData,
				smbShares: smbSharesData,
				network: {
					hostname: networkConfig.hostname,
					gateway: networkConfig.gateway,
					nameservers: networkConfig.nameservers,
					interfaces: networkInterfaces,
				},
				backups,
				notBackedUpPools: notBackedUpPools(backups),
				enabledServiceNames,
				disabledServiceNames,
				identities,
				acls,
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
