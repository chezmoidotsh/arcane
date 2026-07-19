/** Renders a boolean as `yes`/`no` for table cells, and an unset value as `—` rather than `false`. */
export function yesNo(value: unknown): string {
	if (value === undefined || value === null) return "—";
	return value ? "yes" : "no";
}
