const WORDS = [
	"No",
	"One",
	"Two",
	"Three",
	"Four",
	"Five",
	"Six",
	"Seven",
	"Eight",
	"Nine",
	"Ten",
];

/**
 * Spells a small count as a word, so a generated sentence reads like prose
 * ("Three identities authenticate with an API token") instead of a report
 * ("3 identities…"). Falls back to digits past ten, where words stop helping.
 *
 * This is what lets the templates state a count without hard-coding one --
 * see `../derive.ts` for why no number is ever written by hand.
 */
export function countWord(value: unknown[] | number): string {
	const n = typeof value === "number" ? value : (value?.length ?? 0);
	return n < WORDS.length ? WORDS[n] : String(n);
}
