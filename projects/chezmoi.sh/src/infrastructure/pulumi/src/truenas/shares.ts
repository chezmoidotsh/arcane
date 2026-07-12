import * as truenas from "@pulumi/truenas";

import { zp1cs01 } from "./zpools/zp1cs01";
import { zp1hs01 } from "./zpools/zp1hs01";

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
			path: zp1cs01.get("media/animes").resource.mountPoint,
			comment: "Animés (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/animes").resource, ignoreChanges: ["hosts"] },
	),

	new truenas.ShareNfs(
		"nfs-share-movies",
		{
			path: zp1cs01.get("media/movies").resource.mountPoint,
			comment: "Films (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/movies").resource, ignoreChanges: ["hosts"] },
	),

	new truenas.ShareNfs(
		"nfs-share-musics",
		{
			path: zp1cs01.get("media/musics").resource.mountPoint,
			comment: "Musiques (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/musics").resource, ignoreChanges: ["hosts"] },
	),

	new truenas.ShareNfs(
		"nfs-share-tvshows",
		{
			path: zp1cs01.get("media/tvshows").resource.mountPoint,
			comment: "Séries TV (Jellyfin)",
			readonly: true,
			mapallUser: "nobody",
			mapallGroup: "nogroup",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/tvshows").resource, ignoreChanges: ["hosts"] },
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
			path: zp1cs01.get("media/movies").resource.mountPoint,
			purpose: "LEGACY_SHARE",
			comment: "Accès aux films de la médiathèque",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/movies").resource },
	),

	new truenas.ShareSmb(
		"smb-share-animes",
		{
			name: "Animes",
			path: zp1cs01.get("media/animes").resource.mountPoint,
			purpose: "LEGACY_SHARE",
			comment: "Accès aux animés de la médiathèque",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/animes").resource },
	),

	new truenas.ShareSmb(
		"smb-share-series-tv",
		{
			name: "Series TV",
			path: zp1cs01.get("media/tvshows").resource.mountPoint,
			purpose: "LEGACY_SHARE",
			comment: "Accès aux séries TV/streaming de la médiathèque",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/tvshows").resource },
	),

	new truenas.ShareSmb(
		"smb-share-livres",
		{
			name: "Livres",
			path: zp1cs01.get("media/books").resource.mountPoint,
			purpose: "DEFAULT_SHARE",
			comment: "Accès aux livres de la médiathèque",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/books").resource },
	),

	new truenas.ShareSmb(
		"smb-share-musique",
		{
			name: "Musiques",
			path: zp1cs01.get("media/musics").resource.mountPoint,
			purpose: "DEFAULT_SHARE",
			comment: "Accès aux musiques de la médiathèque",
			enabled: true,
		},
		{ parent: zp1cs01.get("media/musics").resource },
	),

	// --- Userspace shares ----------------------------------------------------
	new truenas.ShareSmb(
		"smb-share-mes-documents",
		{
			name: "Mes Documents",
			path: zp1hs01.get("userspace").resource.mountPoint,
			purpose: "PRIVATE_DATASETS_SHARE",
			comment: "Documents personnels",
			enabled: true,
		},
		{ parent: zp1hs01.get("userspace").resource },
	),

	new truenas.ShareSmb(
		"smb-share-shared-documents",
		{
			name: "Documents partagés",
			path: zp1hs01.get("userspace/shared").resource.mountPoint,
			purpose: "LEGACY_SHARE",
			comment: "Documents partagés",
			enabled: true,
		},
		{ parent: zp1hs01.get("userspace").resource },
	),

	// --- Application shares ----------------------------------------------------
	new truenas.ShareSmb(
		"smb-share-hass-chezmoi-sh",
		{
			name: "hass.chezmoi.sh",
			path: zp1hs01.get("backups/hass.chezmoi.sh").resource.mountPoint,
			purpose: "DEFAULT_SHARE",
			comment: "Sauvegardes Home Assistant",
			browsable: false,
			enabled: true,
		},
		{ parent: zp1hs01.get("backups/hass.chezmoi.sh").resource },
	),

	new truenas.ShareSmb(
		"smb-share-application-immich",
		{
			name: "application-immich",
			path: zp1hs01.get("applications/managed/app.immich").resource.mountPoint,
			purpose: "LEGACY_SHARE",
			comment: "Stockage applicatif Immich (Kubernetes)",
			browsable: false,
			enabled: true,
		},
		{ parent: zp1hs01.get("applications/managed/app.immich").resource },
	),

	new truenas.ShareSmb(
		"smb-share-application-paperless",
		{
			name: "application-paperless",
			path: zp1hs01.get("applications/managed/com.paperless-ngx").resource
				.mountPoint,
			purpose: "LEGACY_SHARE",
			comment: "Stockage applicatif Paperless-ngx (Kubernetes)",
			browsable: false,
			enabled: true,
		},
		{ parent: zp1hs01.get("applications/managed/com.paperless-ngx").resource },
	),
];
