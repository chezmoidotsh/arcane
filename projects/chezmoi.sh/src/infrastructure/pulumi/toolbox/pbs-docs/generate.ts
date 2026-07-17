import * as fs from "fs";
import * as path from "path";

import {
	extractAcls,
	extractApiTokens,
	extractDatastores,
	extractNamespaces,
	extractNotificationMatchers,
	extractNotificationTargets,
	extractPruneJobs,
	extractUsers,
	extractVerifyJobs,
} from "./extract";
import { render } from "./render";
import { readOptionalConfig, readStackExport } from "./stack-export";

// -----------------------------------------------------------------------------
// Regenerates `projects/chezmoi.sh/docs/PROXMOX_BACKUP_SERVER.md` from the
// *deployed* `chezmoi_sh.live` stack state -- run standalone (`mise run
// pbs:docs:generate`, chained onto `pulumi:apply`), not as part of `pulumi
// up`/`preview` itself. See `./extract.ts` for how resource state becomes
// plain data, and `../../stack/pbs/README.md` for the sections this document
// doesn't cover (the manual VM/OS install, the encryption keyfile/paperkey,
// and the Proxmox VE-side backup job definitions -- none of these are
// `@pulumi/pbs` resources, so this generator has nothing to read for them;
// see that README's "Intentionally not managed via Pulumi").
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
	// `toolbox/pbs-docs` -> project root (where Pulumi.yaml lives), resolved
	// from this file's own location so it doesn't depend on the caller's cwd.
	const projectRoot = path.resolve(__dirname, "../..");

	// `pbs:endpoint` is normally always set (see stack/pbs/README.md,
	// "Bootstrapping") -- this guard is a safety net for the rare case it
	// isn't (e.g. a fresh stack config, a corrupted config file): skip
	// gracefully instead of failing `mise run pulumi:apply`'s post-task for
	// the entire shared stack, which covers observability/omni/truenas/
	// zot-registry too, not just PBS.
	const endpoint = readOptionalConfig(projectRoot, "pbs:endpoint");
	if (!endpoint) {
		console.log(
			"pbs:endpoint is not set -- skipping docs/PROXMOX_BACKUP_SERVER.md regeneration.",
		);
		return;
	}

	const exported = readStackExport(projectRoot);
	const resources = exported.deployment.resources;

	const namespaces = extractNamespaces(resources);
	// Each datastore carries its own namespaces for the template -- extractors
	// stay single-purpose (one resource type each), this is where they're
	// joined for rendering. See partials/datastore.hbs.
	const datastores = extractDatastores(resources).map((store) => ({
		...store,
		namespaces: namespaces.filter((n) => n.store === store.name),
	}));

	const context = {
		endpoint,
		datastores,
		pruneJobs: extractPruneJobs(resources),
		verifyJobs: extractVerifyJobs(resources),
		notificationTargets: extractNotificationTargets(resources),
		notificationMatchers: extractNotificationMatchers(resources),
		users: extractUsers(resources),
		apiTokens: extractApiTokens(resources),
		acls: extractAcls(resources),
	};

	const docPath = path.resolve(
		projectRoot,
		"../../../docs/PROXMOX_BACKUP_SERVER.md",
	);
	fs.writeFileSync(docPath, render(context));
	console.log(`Wrote ${docPath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
