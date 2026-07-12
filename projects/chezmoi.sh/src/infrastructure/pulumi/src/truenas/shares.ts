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
 *
 * Exported for `../acls.ts`, which needs the same dataset path/opts
 * resolution to parent `FilesystemAcl` resources under their dataset.
 */
export function under(
	pool: TrueNASPool,
	datasetPath: string,
	...subpath: string[]
) {
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

// Exports the resources themselves (not a hand-maintained plain-data
// summary) -- the doc generator (../truenas-docs) is responsible for pulling
// whatever fields it needs out of these.
export const nfsShares = [
	new truenas.ShareNfs(
		"nfs-share-animes",
		{
			path: under(zp1cs01, "media/animes").path,
			comment: "Animés (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ ...under(zp1cs01, "media/animes").opts, ignoreChanges: ["hosts"] },
	),

	new truenas.ShareNfs(
		"nfs-share-movies",
		{
			path: under(zp1cs01, "media/movies").path,
			comment: "Films (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ ...under(zp1cs01, "media/movies").opts, ignoreChanges: ["hosts"] },
	),

	new truenas.ShareNfs(
		"nfs-share-musics",
		{
			path: under(zp1cs01, "media/musics").path,
			comment: "Musiques (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ ...under(zp1cs01, "media/musics").opts, ignoreChanges: ["hosts"] },
	),

	new truenas.ShareNfs(
		"nfs-share-tvshows",
		{
			path: under(zp1cs01, "media/tvshows").path,
			comment: "Séries TV (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ ...under(zp1cs01, "media/tvshows").opts, ignoreChanges: ["hosts"] },
	),

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
	),
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

export const smbShares = [
	// --- Media shares --------------------------------------------------------
	new truenas.ShareSmb(
		"smb-share-films",
		{
			name: "Films",
			path: under(zp1cs01, "media/movies").path,
			purpose: "LEGACY_SHARE",
			comment: "Accès aux films de la médiathèque",
			enabled: true,
		},
		under(zp1cs01, "media/movies").opts,
	),

	new truenas.ShareSmb(
		"smb-share-animes",
		{
			name: "Animes",
			path: under(zp1cs01, "media/animes").path,
			purpose: "LEGACY_SHARE",
			comment: "Accès aux animés de la médiathèque",
			enabled: true,
		},
		under(zp1cs01, "media/animes").opts,
	),

	new truenas.ShareSmb(
		"smb-share-series-tv",
		{
			name: "Series TV",
			path: under(zp1cs01, "media/tvshows").path,
			purpose: "LEGACY_SHARE",
			comment: "Accès aux séries TV/streaming de la médiathèque",
			enabled: true,
		},
		under(zp1cs01, "media/tvshows").opts,
	),

	new truenas.ShareSmb(
		"smb-share-livres",
		{
			name: "Livres",
			path: under(zp1cs01, "media/books").path,
			purpose: "DEFAULT_SHARE",
			comment: "Accès aux livres de la médiathèque",
			enabled: true,
		},
		under(zp1cs01, "media/books").opts,
	),

	new truenas.ShareSmb(
		"smb-share-musique",
		{
			name: "Musiques",
			path: under(zp1cs01, "media/musics").path,
			purpose: "DEFAULT_SHARE",
			comment: "Accès aux musiques de la médiathèque",
			enabled: true,
		},
		under(zp1cs01, "media/musics").opts,
	),

	// --- Userspace shares ----------------------------------------------------
	new truenas.ShareSmb(
		"smb-share-mes-documents",
		{
			name: "Mes Documents",
			path: under(zp1hs01, "userspace").path,
			purpose: "PRIVATE_DATASETS_SHARE",
			comment: "Documents personnels",
			enabled: true,
		},
		under(zp1hs01, "userspace").opts,
	),

	new truenas.ShareSmb(
		"smb-share-shared-documents",
		{
			name: "Documents partagés",
			path: under(zp1hs01, "userspace/shared").path,
			purpose: "LEGACY_SHARE",
			comment: "Documents partagés",
			enabled: true,
		},
		under(zp1hs01, "userspace").opts,
	),

	// --- Application shares ----------------------------------------------------
	new truenas.ShareSmb(
		"smb-share-hass-chezmoi-sh",
		{
			name: "hass.chezmoi.sh",
			path: under(zp1hs01, "backups/hass.chezmoi.sh").path,
			purpose: "DEFAULT_SHARE",
			comment: "Sauvegardes Home Assistant",
			browsable: false,
			enabled: true,
		},
		under(zp1hs01, "backups/hass.chezmoi.sh").opts,
	),

	new truenas.ShareSmb(
		"smb-share-application-immich",
		{
			name: "application-immich",
			path: under(zp1hs01, "applications/managed/app.immich").path,
			purpose: "LEGACY_SHARE",
			comment: "Stockage applicatif Immich (Kubernetes)",
			browsable: false,
			enabled: true,
		},
		under(zp1hs01, "applications/managed/app.immich").opts,
	),

	new truenas.ShareSmb(
		"smb-share-application-paperless",
		{
			name: "application-paperless",
			path: under(zp1hs01, "applications/managed/com.paperless-ngx").path,
			purpose: "LEGACY_SHARE",
			comment: "Stockage applicatif Paperless-ngx (Kubernetes)",
			browsable: false,
			enabled: true,
		},
		under(zp1hs01, "applications/managed/com.paperless-ngx").opts,
	),
];
