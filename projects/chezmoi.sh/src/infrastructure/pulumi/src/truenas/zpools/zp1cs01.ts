import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import { TrueNASDataset, TrueNASPool } from "@chezmoi.sh/pulumi-truenas-pool";
import * as truenas from "@pulumi/truenas";

// --- zp1cs01: media -----------------------------------------------------

export const zp1cs01 = new TrueNASPool("zp1cs01", [
	new TrueNASDataset(
		"media",
		{
			comments:
				"Dataset TrueNAS réservé pour tout les media (films, animés, musiques, ...)",
		},
		[
			new TrueNASDataset("animes", {
				comments: "Dataset TrueNAS réservé pour les series animées",
			}),
			new TrueNASDataset("books", {
				comments: "Dataset TrueNAS réservé pour les livres",
			}),
			new TrueNASDataset("inbox", {
				comments: "Dataset TrueNAS réservé pour les média à trier",
				quota: 500 * ByteSize.Gi,
			}), // 500G
			new TrueNASDataset("movies", {
				comments: "Dataset TrueNAS réservé pour les films",
			}),
			new TrueNASDataset("musics", {
				comments: "Dataset TrueNAS réservé pour les musiques",
			}),
			new TrueNASDataset("tvshows", {
				comments: "Dataset TrueNAS réservé pour les series TV",
			}),
		],
	),
]);

new truenas.ScrubTask(
	"zp1cs01-scrub",
	{
		pool: 6,
		threshold: 35,
		enabled: true,
		scheduleMinute: "00",
		scheduleHour: "00",
		scheduleDom: "*",
		scheduleMonth: "*",
		scheduleDow: "7",
	},
	{ parent: zp1cs01 },
);
