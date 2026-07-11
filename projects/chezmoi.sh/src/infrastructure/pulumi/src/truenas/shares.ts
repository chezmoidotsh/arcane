import { must } from "@chezmoi.sh/pulumi-lib";
import type { TrueNASPool } from "@chezmoi.sh/pulumi-truenas-pool";
import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";

import { zp1cs01 } from "./zpools/zp1cs01";
import { zp1hs01 } from "./zpools/zp1hs01";

/**
 * Resolves the real dataset at `datasetPath` in `pool` (e.g. `media/animes`)
 * and returns the share's `path` (that dataset's live mount point, plus any
 * `subpath` segments for shares rooted in an unmodeled sub-folder) together
 * with resource options that parent the share under that dataset.
 *
 * `aliases` is required here: these shares were originally declared with no
 * parent, so adding one changes their URN -- without the alias, Pulumi would
 * plan a destructive delete+recreate of each share instead of an in-place
 * update.
 */
function under(pool: TrueNASPool, datasetPath: string, ...subpath: string[]) {
	const dataset = must(
		pool.get(datasetPath)?.resource,
		`Unknown dataset "${datasetPath}" in pool "${pool.name}"`,
	);
	return {
		path: subpath.length
			? pulumi.interpolate`${dataset.mountPoint}/${subpath.join("/")}`
			: dataset.mountPoint,
		opts: {
			parent: dataset,
			aliases: [{ parent: pulumi.rootStackResource }],
		} satisfies pulumi.CustomResourceOptions,
	};
}

// --- NFS -------------------------------------------------------------------
// `hosts` (IP allowlist) is deliberately not managed here, to match SMB
// below -- neither protocol's IP restrictions are driven through Pulumi.
// `ignoreChanges` keeps Pulumi from touching whatever's actually configured
// on the NAS.

new truenas.NfsConfig("nfs-config", {
	servers: 4,
	allowNonroot: false,
	protocols: ["NFSV4"],
	bindips: ["10.0.0.30"],
});

new truenas.ShareNfs(
	"nfs-share-animes",
	{
		path: under(zp1cs01, "media/animes").path,
		comment: "Dossier partagé des animés",
		mapallUser: "nobody",
		mapallGroup: "nogroup",
		enabled: true,
	},
	{ ...under(zp1cs01, "media/animes").opts, ignoreChanges: ["hosts"] },
);

new truenas.ShareNfs(
	"nfs-share-movies",
	{
		path: under(zp1cs01, "media/movies").path,
		comment: "Dossier partagé des films",
		mapallUser: "nobody",
		mapallGroup: "nogroup",
		enabled: true,
	},
	{ ...under(zp1cs01, "media/movies").opts, ignoreChanges: ["hosts"] },
);

new truenas.ShareNfs(
	"nfs-share-musics",
	{
		path: under(zp1cs01, "media/musics").path,
		comment: "Dossier partagé des musiques",
		mapallUser: "nobody",
		mapallGroup: "nogroup",
		enabled: true,
	},
	{ ...under(zp1cs01, "media/musics").opts, ignoreChanges: ["hosts"] },
);

new truenas.ShareNfs(
	"nfs-share-tvshows",
	{
		path: under(zp1cs01, "media/tvshows").path,
		comment: "Dossier partagé des séries TVs",
		mapallUser: "nobody",
		mapallGroup: "nogroup",
		enabled: true,
	},
	{ ...under(zp1cs01, "media/tvshows").opts, ignoreChanges: ["hosts"] },
);

new truenas.ShareNfs(
	"nfs-share-documents-shared",
	{
		path: under(zp1hs01, "documents", "shared").path,
		comment: "Dossier partagé de nos documents (Paperless)",
		readonly: true,
		mapallUser: "paperless-ngx",
		mapallGroup: "paperless-ngx",
		enabled: true,
	},
	{
		...under(zp1hs01, "documents", "shared").opts,
		ignoreChanges: ["hosts"],
	},
);

// RW, unlike its documents-shared sibling above: Paperless imports/consumes
// files directly from this dataset, so it needs write access here.
new truenas.ShareNfs(
	"nfs-share-documents-alexandre-admin",
	{
		path: under(zp1hs01, "documents", "alexandre", "Documents administratifs")
			.path,
		comment: "Documents personnels d'alexandre (Paperless)",
		mapallUser: "paperless-ngx",
		mapallGroup: "paperless-ngx",
		enabled: true,
	},
	{
		...under(zp1hs01, "documents", "alexandre", "Documents administratifs")
			.opts,
		ignoreChanges: ["hosts"],
	},
);

export const nfsShares = [
	{
		name: "nfs-share-animes",
		comment: "Dossier partagé des animés",
		mapallUser: "nobody",
		enabled: true,
	},
	{
		name: "nfs-share-movies",
		comment: "Dossier partagé des films",
		mapallUser: "nobody",
		enabled: true,
	},
	{
		name: "nfs-share-musics",
		comment: "Dossier partagé des musiques",
		mapallUser: "nobody",
		enabled: true,
	},
	{
		name: "nfs-share-tvshows",
		comment: "Dossier partagé des séries TVs",
		mapallUser: "nobody",
		enabled: true,
	},
	{
		name: "nfs-share-documents-shared",
		comment: "Dossier partagé de nos documents (Paperless)",
		mapallUser: "paperless-ngx",
		readonly: true,
		enabled: true,
	},
	{
		name: "nfs-share-documents-alexandre-admin",
		comment: "Documents personnels d'alexandre (Paperless)",
		mapallUser: "paperless-ngx",
		enabled: true,
	},
];

// --- SMB ---------------------------------------------------------------
// `hostsallow`/`auxsmbconf`/`timemachine_quota` aren't in this provider's
// `ShareSmb` schema -- IP restrictions on the cold-backup shares and the
// Time Machine quota below aren't represented here.

new truenas.SmbConfig("smb-config", {
	netbiosname: "truenas",
	description: "TrueNAS Server",
	aaplExtensions: true, // Apple SMB2/3 extensions -- used by the Time Machine share
});

new truenas.ShareSmb(
	"smb-share-films",
	{
		name: "Films",
		path: under(zp1cs01, "media/movies").path,
		purpose: "LEGACY_SHARE",
		comment: "Dossier partagé des films",
		enabled: true,
	},
	under(zp1cs01, "media/movies").opts,
);

new truenas.ShareSmb(
	"smb-share-animes",
	{
		name: "Animes",
		path: under(zp1cs01, "media/animes").path,
		purpose: "LEGACY_SHARE",
		comment: "Dossier partagé des séries animés",
		enabled: true,
	},
	under(zp1cs01, "media/animes").opts,
);

new truenas.ShareSmb(
	"smb-share-series-tv",
	{
		name: "Series TV",
		path: under(zp1cs01, "media/tvshows").path,
		purpose: "LEGACY_SHARE",
		comment: "Dossier partagé des séries TV",
		enabled: true,
	},
	under(zp1cs01, "media/tvshows").opts,
);

new truenas.ShareSmb(
	"smb-share-mes-documents",
	{
		name: "Mes documents",
		path: under(zp1hs01, "documents").path,
		purpose: "PRIVATE_DATASETS_SHARE",
		comment: "Documents personnels",
		enabled: true,
	},
	under(zp1hs01, "documents").opts,
);

new truenas.ShareSmb(
	"smb-share-public",
	{
		name: "Public",
		path: under(zp1hs01, "documents", "shared").path,
		purpose: "DEFAULT_SHARE",
		comment: "Documents partagés",
		enabled: true,
	},
	under(zp1hs01, "documents", "shared").opts,
);

new truenas.ShareSmb(
	"smb-share-livres",
	{
		name: "Livres",
		path: under(zp1cs01, "media/books").path,
		purpose: "DEFAULT_SHARE",
		comment: "Dossier partagé des livres",
		enabled: true,
	},
	under(zp1cs01, "media/books").opts,
);

new truenas.ShareSmb(
	"smb-share-hass-chezmoi-sh",
	{
		name: "hass.chezmoi.sh",
		path: under(zp1hs01, "backups/hass.chezmoi.sh").path,
		purpose: "DEFAULT_SHARE",
		comment: "Dossier de backup pour Home Assistant",
		enabled: true,
	},
	under(zp1hs01, "backups/hass.chezmoi.sh").opts,
);

// Disabled: read-only cold-backup mirror.
new truenas.ShareSmb(
	"smb-share-cold-media",
	{
		name: "mnt-zp1cs01-media",
		path: under(zp1cs01, "media").path,
		purpose: "LEGACY_SHARE",
		comment: "RO access to all media (cold backup only)",
		readonly: true,
		enabled: false,
	},
	under(zp1cs01, "media").opts,
);

// Disabled: read-only cold-backup mirror.
new truenas.ShareSmb(
	"smb-share-cold-documents",
	{
		name: "mnt-zp1hs01-documents",
		path: under(zp1hs01, "documents").path,
		purpose: "LEGACY_SHARE",
		comment: "RO access to all documents (cold backup only)",
		readonly: true,
		enabled: false,
	},
	under(zp1hs01, "documents").opts,
);

new truenas.ShareSmb(
	"smb-share-application-immich",
	{
		name: "application-immich",
		path: under(zp1hs01, "applications/immich").path,
		purpose: "LEGACY_SHARE",
		comment: "Immich application storage",
		browsable: false,
		enabled: true,
	},
	under(zp1hs01, "applications/immich").opts,
);

new truenas.ShareSmb(
	"smb-share-application-paperless",
	{
		name: "application-paperless",
		path: under(zp1hs01, "applications/paperless").path,
		purpose: "LEGACY_SHARE",
		comment: "Paperless application storage",
		browsable: false,
		enabled: true,
	},
	under(zp1hs01, "applications/paperless").opts,
);

new truenas.ShareSmb(
	"smb-share-application-silverbullet",
	{
		name: "application-silverbullet",
		path: under(zp1hs01, "applications/silverbullet").path,
		purpose: "LEGACY_SHARE",
		comment: "Silverbullet application storage",
		browsable: false,
		enabled: true,
	},
	under(zp1hs01, "applications/silverbullet").opts,
);

new truenas.ShareSmb(
	"smb-share-timemachine",
	{
		name: "timemachine.apple.com",
		path: under(zp1hs01, "backups/timemachine.apple.com").path,
		purpose: "TIMEMACHINE_SHARE",
		comment: "Apple Time Machine Backups",
		enabled: true,
	},
	under(zp1hs01, "backups/timemachine.apple.com").opts,
);

export const smbShares = [
	{
		name: "smb-share-films",
		comment: "Dossier partagé des films",
		purpose: "LEGACY_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-animes",
		comment: "Dossier partagé des séries animés",
		purpose: "LEGACY_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-series-tv",
		comment: "Dossier partagé des séries TV",
		purpose: "LEGACY_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-mes-documents",
		comment: "Documents personnels",
		purpose: "PRIVATE_DATASETS_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-public",
		comment: "Documents partagés",
		purpose: "DEFAULT_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-livres",
		comment: "Dossier partagé des livres",
		purpose: "DEFAULT_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-hass-chezmoi-sh",
		comment: "Dossier de backup pour Home Assistant",
		purpose: "DEFAULT_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-cold-media",
		comment: "RO access to all media (cold backup only)",
		purpose: "LEGACY_SHARE",
		readonly: true,
		enabled: false,
	},
	{
		name: "smb-share-cold-documents",
		comment: "RO access to all documents (cold backup only)",
		purpose: "LEGACY_SHARE",
		readonly: true,
		enabled: false,
	},
	{
		name: "smb-share-application-immich",
		comment: "Immich application storage",
		purpose: "LEGACY_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-application-paperless",
		comment: "Paperless application storage",
		purpose: "LEGACY_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-application-silverbullet",
		comment: "Silverbullet application storage",
		purpose: "LEGACY_SHARE",
		enabled: true,
	},
	{
		name: "smb-share-timemachine",
		comment: "Apple Time Machine Backups",
		purpose: "TIMEMACHINE_SHARE",
		enabled: true,
	},
];
