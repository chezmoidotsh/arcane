/**
 * Binary (IEC, base-1024) byte-size magnitudes, so call sites read as
 * `quota: 50 * ByteSize.Gi` instead of a magic number with a `// 50Gi` comment.
 *
 * A plain `const` object rather than a TypeScript `enum`: these are just
 * numbers used in arithmetic, and a numeric `enum` would add an unused
 * reverse (number -> name) mapping at runtime for no benefit here.
 */
export const ByteSize = {
	Ki: 1024,
	Mi: 1024 ** 2,
	Gi: 1024 ** 3,
	Ti: 1024 ** 4,
} as const;
