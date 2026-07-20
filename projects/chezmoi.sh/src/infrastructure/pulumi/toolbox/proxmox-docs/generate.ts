import * as fs from "fs";
import * as path from "path";

import {
	deriveAccessSummary,
	deriveIdentities,
	derivePools,
	deriveSdn,
} from "./derive";
import {
	extractAcls,
	extractAcmeAccounts,
	extractAcmeCertificates,
	extractAcmeDnsPlugins,
	extractPoolMemberships,
	extractPools,
	extractRoles,
	extractSdnSubnets,
	extractSdnVnets,
	extractSdnZones,
	extractSecurityGroups,
	extractStoragePbs,
	extractTokens,
	extractUsers,
} from "./extract";
import { host } from "./host";
import { render } from "./render";
import { readOptionalConfig, readStackExport } from "./stack-export";

// -----------------------------------------------------------------------------
// Regenerates `projects/chezmoi.sh/docs/PROXMOX-VE.md` from the *deployed*
// `chezmoi_sh.live` stack state -- run standalone (`mise run
// proxmox:docs:generate`, chained onto `pulumi:apply`), not as part of `pulumi
// up`/`preview` itself.
//
// See `./extract/` for how resource state becomes plain data, `./derive.ts`
// for the cross-resource statements the prose is built on, and `./host.ts` for
// the handful of facts the provider cannot know.
//
// Prose that explains *one* resource lives in its own subject partial
// (`partials/<section>.<subject>.hbs`), included from the section
// partial inside that resource's loop iteration -- so it renders under the
// heading it belongs to and cannot leak onto a sibling declared later.
// -----------------------------------------------------------------------------

export function buildContext(
	resources: Parameters<typeof extractRoles>[0],
	endpoint: string,
) {
	const roles = extractRoles(resources);
	const users = extractUsers(resources);
	const tokens = extractTokens(resources);
	const acls = extractAcls(resources);

	const identities = deriveIdentities(users, tokens, acls);
	const access = deriveAccessSummary(identities, roles);

	const pools = derivePools(
		extractPools(resources),
		extractPoolMemberships(resources),
		acls,
	);
	const boundaryPools = pools.filter((p) => p.isBoundary);

	const vnets = extractSdnVnets(resources);
	const sdn = deriveSdn(
		extractSdnZones(resources),
		vnets,
		extractSdnSubnets(resources),
	);

	const accounts = extractAcmeAccounts(resources);
	const certificates = extractAcmeCertificates(resources);

	return {
		host,
		endpoint,
		roles,
		acls,
		access,
		pools,
		boundaryPools,
		boundaryPoolIds: boundaryPools.map((p) => `\`${p.poolId}\``),
		poolStorages: pools.flatMap((p) => p.storages.map((s) => `\`${s}\``)),
		// `sdn` is one row per subnet (the table); `sdnVnets` is one entry per
		// VNet (the prose), so a VNet's note renders once even when it carries
		// several subnets.
		sdn,
		sdnVnets: vnets,
		storages: extractStoragePbs(resources),
		accounts,
		// Certificates reference their account by name; the template looks the
		// account up to render its directory, so hand it a keyed map.
		accountsByName: Object.fromEntries(accounts.map((a) => [a.name, a])),
		dnsPlugins: extractAcmeDnsPlugins(resources),
		certificates,
		securityGroups: extractSecurityGroups(resources),
	};
}

async function main(): Promise<void> {
	// `toolbox/proxmox-docs` -> project root (where Pulumi.yaml lives),
	// resolved from this file's own location so it doesn't depend on the
	// caller's cwd.
	const projectRoot = path.resolve(__dirname, "../..");

	// `proxmox:endpoint` is normally always set (see
	// stack/proxmox/README.md, "Bootstrapping"). This guard is a safety net
	// for the rare case it isn't: skip gracefully rather than failing
	// `mise run pulumi:apply`'s post-task, which covers the entire shared
	// stack (observability/omni/truenas/zot-registry), not just Proxmox VE.
	const endpoint = readOptionalConfig(projectRoot, "proxmox:endpoint");
	if (!endpoint) {
		console.log(
			"proxmox:endpoint is not set -- skipping docs/PROXMOX-VE.md regeneration.",
		);
		return;
	}

	const exported = readStackExport(projectRoot);
	const context = buildContext(exported.deployment.resources, endpoint);

	const docPath = path.resolve(projectRoot, "../../../docs/PROXMOX-VE.md");
	fs.writeFileSync(docPath, render(context));
	console.log(`Wrote ${docPath}`);
}

if (require.main === module) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
