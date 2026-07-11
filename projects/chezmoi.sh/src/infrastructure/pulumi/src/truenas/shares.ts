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

new truenas.NfsConfig("nfs-config", {
	servers: 4,
	allowNonroot: false,
	protocols: ["NFSV4"],
	bindips: ["10.0.0.30"],
});

// The 4 media shares below are RW with `mapallUser: "nobody"` (not readonly)
// because a media manager writes/renames files on them (library import,
// organization), not just serves them. `hosts` lists two trusted LAN
// devices that both need that write access.
{
	const { path, opts } = under(zp1cs01, "media/animes");
	new truenas.ShareNfs(
		"nfs-share-animes",
		{
			path,
			comment: "Dossier partagé des animés",
			hosts: ["10.0.3.195", "192.168.10.100"],
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media/movies");
	new truenas.ShareNfs(
		"nfs-share-movies",
		{
			path,
			comment: "Dossier partagé des films",
			hosts: ["10.0.3.195", "192.168.10.100"],
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media/musics");
	new truenas.ShareNfs(
		"nfs-share-musics",
		{
			path,
			comment: "Dossier partagé des musiques",
			hosts: ["10.0.3.195", "192.168.10.100"],
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media/tvshows");
	new truenas.ShareNfs(
		"nfs-share-tvshows",
		{
			path,
			comment: "Dossier partagé des séries TVs",
			hosts: ["10.0.3.195", "192.168.10.100"],
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "documents", "shared");
	new truenas.ShareNfs(
		"nfs-share-documents-shared",
		{
			path,
			comment: "Dossier partagé de nos documents (Paperless)",
			hosts: ["10.0.3.195"],
			readonly: true,
			mapallUser: "paperless-ngx",
			mapallGroup: "paperless-ngx",
			enabled: true,
		},
		opts,
	);
}

// RW, unlike its documents-shared sibling above: Paperless imports/consumes
// files directly from this dataset, so it needs write access here.
{
	const { path, opts } = under(
		zp1hs01,
		"documents",
		"alexandre",
		"Documents administratifs",
	);
	new truenas.ShareNfs(
		"nfs-share-documents-alexandre-admin",
		{
			path,
			comment: "Documents personnels d'alexandre (Paperless)",
			hosts: ["10.0.3.195"],
			mapallUser: "paperless-ngx",
			mapallGroup: "paperless-ngx",
			enabled: true,
		},
		opts,
	);
}

// --- SMB ---------------------------------------------------------------
// `hostsallow`/`auxsmbconf`/`timemachine_quota` aren't in this provider's
// `ShareSmb` schema -- IP restrictions on the cold-backup shares and the
// Time Machine quota below aren't represented here.

new truenas.SmbConfig("smb-config", {
	netbiosname: "truenas",
	description: "TrueNAS Server",
	aaplExtensions: true, // Apple SMB2/3 extensions -- used by the Time Machine share
});

{
	const { path, opts } = under(zp1cs01, "media/movies");
	new truenas.ShareSmb(
		"smb-share-films",
		{
			name: "Films",
			path,
			purpose: "LEGACY_SHARE",
			comment: "Dossier partagé des films",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media/animes");
	new truenas.ShareSmb(
		"smb-share-animes",
		{
			name: "Animes",
			path,
			purpose: "LEGACY_SHARE",
			comment: "Dossier partagé des séries animés",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media/tvshows");
	new truenas.ShareSmb(
		"smb-share-series-tv",
		{
			name: "Series TV",
			path,
			purpose: "LEGACY_SHARE",
			comment: "Dossier partagé des séries TV",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "documents");
	new truenas.ShareSmb(
		"smb-share-mes-documents",
		{
			name: "Mes documents",
			path,
			purpose: "PRIVATE_DATASETS_SHARE",
			comment: "Documents personnels",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "documents", "shared");
	new truenas.ShareSmb(
		"smb-share-public",
		{
			name: "Public",
			path,
			purpose: "DEFAULT_SHARE",
			comment: "Documents partagés",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media/books");
	new truenas.ShareSmb(
		"smb-share-livres",
		{
			name: "Livres",
			path,
			purpose: "DEFAULT_SHARE",
			comment: "Dossier partagé des livres",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "backups/hass.chezmoi.sh");
	new truenas.ShareSmb(
		"smb-share-hass-chezmoi-sh",
		{
			name: "hass.chezmoi.sh",
			path,
			purpose: "DEFAULT_SHARE",
			comment: "Dossier de backup pour Home Assistant",
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1cs01, "media");
	// Disabled: read-only cold-backup mirror.
	new truenas.ShareSmb(
		"smb-share-cold-media",
		{
			name: "mnt-zp1cs01-media",
			path,
			purpose: "LEGACY_SHARE",
			comment: "RO access to all media (cold backup only)",
			readonly: true,
			enabled: false,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "documents");
	// Disabled: read-only cold-backup mirror.
	new truenas.ShareSmb(
		"smb-share-cold-documents",
		{
			name: "mnt-zp1hs01-documents",
			path,
			purpose: "LEGACY_SHARE",
			comment: "RO access to all documents (cold backup only)",
			readonly: true,
			enabled: false,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "applications/immich");
	new truenas.ShareSmb(
		"smb-share-application-immich",
		{
			name: "application-immich",
			path,
			purpose: "LEGACY_SHARE",
			comment: "Immich application storage",
			browsable: false,
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "applications/paperless");
	new truenas.ShareSmb(
		"smb-share-application-paperless",
		{
			name: "application-paperless",
			path,
			purpose: "LEGACY_SHARE",
			comment: "Paperless application storage",
			browsable: false,
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "applications/silverbullet");
	new truenas.ShareSmb(
		"smb-share-application-silverbullet",
		{
			name: "application-silverbullet",
			path,
			purpose: "LEGACY_SHARE",
			comment: "Silverbullet application storage",
			browsable: false,
			enabled: true,
		},
		opts,
	);
}

{
	const { path, opts } = under(zp1hs01, "backups/timemachine.apple.com");
	new truenas.ShareSmb(
		"smb-share-timemachine",
		{
			name: "timemachine.apple.com",
			path,
			purpose: "TIMEMACHINE_SHARE",
			comment: "Apple Time Machine Backups",
			enabled: true,
		},
		opts,
	);
}
