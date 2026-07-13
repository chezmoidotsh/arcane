import * as truenas from "@pulumi/truenas";

// -----------------------------------------------------------------------------
// TrueNAS alert notifications (nas.chezmoi.sh)
// -----------------------------------------------------------------------------
// `alert-email` sends CRITICAL alerts to this address through the NAS's
// system-wide mail relay (not managed here, see ../index.ts) --
// `settingsJson` only carries the destination address, no SMTP credentials.
//
// `alert-classes` is a singleton holding every alert class whose policy
// deviates from TrueNAS's per-class default; classes not listed stay on
// their default policy, they aren't reset by omission.

new truenas.AlertService("alert-email", {
	name: "E-Mail",
	type: "Mail",
	level: "CRITICAL",
	enabled: true,
	settingsJson: JSON.stringify({ email: "truenas@chezmoi.sh" }),
});

new truenas.Alertclasses("alert-classes", {
	classes: {
		UPSCommok: { policy: "DAILY" }, // digest instead of one notification per event
		UPSCommbad: { policy: "DAILY" },
	},
});
