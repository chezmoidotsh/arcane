import { TrueNASPool } from "@chezmoi.sh/pulumi-truenas-pool";
import * as truenas from "@pulumi/truenas";

import { SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET } from "./const";

// -----------------------------------------------------------------------------
// zp1cs01: media
// -----------------------------------------------------------------------------
// Naming
//   zp 1 cs 01
//   │  │ │  │
//   │  │ │  └─ 01: pool id
//   │  │ └──── cs: cold storage tier (HDD / bulk storage)
//   │  └────── 1: naming scheme version
//   └───────── zp: zpool
//
// Purpose
// - Dataset tree for the cold storage pool (nas.chezmoi.sh): bulk media
//   (movies, TV shows, animes, music, books) that doesn't need fast access
//   and is written to infrequently, unlike the hot storage pool (`zp1hs01`).
//
// Data protection strategy
// - Scrub: weekly integrity check of the whole pool (see `SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET`).
// - No snapshot tasks: media here is either sourced from elsewhere and
//   re-obtainable, or not critical enough to justify snapshot retention.
// -----------------------------------------------------------------------------

export const zp1cs01 = new TrueNASPool("zp1cs01", {
	"/media": { comments: "Bibliothèque multimédia du foyer" },
	"/media/animes": { comments: "Séries animées" },
	"/media/books": { comments: "Livres" },
	"/media/movies": { comments: "Films" },
	"/media/musics": { comments: "Musiques" },
	"/media/tvshows": { comments: "Séries TV" },
});

new truenas.ScrubTask(
	"zp1cs01-scrub",
	{
		pool: 6, // physical TrueNAS pool ID (not derivable from Pulumi state)
		threshold: 35,
		enabled: true,
		...SCRUB_WEEKLY_SUNDAY_MIDNIGHT_PRESET,
	},
	{ parent: zp1cs01 },
);
