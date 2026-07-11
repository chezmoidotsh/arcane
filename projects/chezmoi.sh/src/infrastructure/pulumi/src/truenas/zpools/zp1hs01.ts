import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import {
	Compression,
	OnOffInherit,
	RecordSize,
	TrueNASDataset,
	TrueNASPool,
} from "@chezmoi.sh/pulumi-truenas-pool";
import * as truenas from "@pulumi/truenas";

// --- zp1hs01: applications / backups / documents -------------------------

export const zp1hs01 = new TrueNASPool("zp1hs01", [
	new TrueNASDataset(
		"applications",
		{
			atime: OnOffInherit.Off,
			compression: Compression.Lz4,
			comments: "Dataset TrueNAS réservé pour les applications hébergées",
		},
		[
			new TrueNASDataset("immich", {
				comments: "Dataset TrueNAS réservé pour Immich",
				quota: 50 * ByteSize.Gi, // 50G
				recordSize: RecordSize.Size1M,
			}),
			new TrueNASDataset("paperless", {
				comments: "Dataset TrueNAS réservé pour Paperless",
				quota: 10 * ByteSize.Gi,
			}), // 10G
			new TrueNASDataset("silverbullet", {
				comments: "Dataset TrueNAS réservé pour Silverbullet",
				quota: 5 * ByteSize.Gi, // 5G
			}),
			new TrueNASDataset(
				"truenas",
				{
					atime: OnOffInherit.Off,
					comments:
						"Dataset TrueNAS réservé pour les applications hébergées dans TrueNAS",
				},
				[
					new TrueNASDataset("com.nginxproxymanager", {
						atime: OnOffInherit.Off,
						comments: "Dataset TrueNAS réservé pour NPM (proxy)",
					}),
					new TrueNASDataset("fr.deuxfleurs.garage", {
						atime: OnOffInherit.Off,
						comments: "Dataset TrueNAS réservé pour Garage (S3)",
					}),
				],
			),
		],
	),
	new TrueNASDataset(
		"backups",
		{
			comments: "Dataset TrueNAS réservé pour les backups",
			quota: 100 * ByteSize.Gi,
		}, // 100G
		[
			new TrueNASDataset("hass.chezmoi.sh", {
				comments: "Dataset TrueNAS réservé pour les backups de Home Assistant",
			}),
			new TrueNASDataset("timemachine.apple.com"),
		],
	),
	new TrueNASDataset(
		"documents",
		{
			comments:
				"Dataset TrueNAS réservé pour les documents (partagés ou personnels)",
		},
		[],
	),
]);

new truenas.ScrubTask(
	"zp1hs01-scrub",
	{
		pool: 5,
		threshold: 35,
		enabled: true,
		scheduleMinute: "00",
		scheduleHour: "00",
		scheduleDom: "*",
		scheduleMonth: "*",
		scheduleDow: "7",
	},
	{ parent: zp1hs01 },
);

new truenas.SnapshotTask(
	"zp1hs01-snapshot",
	{
		dataset: "zp1hs01",
		recursive: true,
		lifetimeValue: 2,
		lifetimeUnit: "WEEK",
		enabled: true,
		namingSchema: "auto-%Y-%m-%d_%H-%M",
		allowEmpty: true,
		scheduleMinute: "0",
		scheduleHour: "0",
		scheduleDom: "*",
		scheduleMonth: "*",
		scheduleDow: "*",
	},
	{ parent: zp1hs01 },
);
