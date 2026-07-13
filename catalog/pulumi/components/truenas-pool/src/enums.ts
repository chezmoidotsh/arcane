// -----------------------------------------------------------------------------
// Closed-value `truenas.Dataset` arguments, re-typed as proper TypeScript
// enums instead of the underlying SDK's bare `string` -- the Terraform
// provider schema itself doesn't model any of these as anything narrower
// than `string`, so nothing here is generated; each enum's value set was
// confirmed against the provider's own schema docs.
// -----------------------------------------------------------------------------

/** Shared tri-state used by `atime`/`readonly` — the TrueNAS API only ever accepts exactly these 3 values for those two. */
export enum OnOffInherit {
	On = "ON",
	Off = "OFF",
	Inherit = "INHERIT",
}

/** Every value `truenas.Dataset`'s `compression` argument accepts, per the provider's own schema docs. */
export enum Compression {
	Off = "OFF",
	On = "ON",
	Lz4 = "LZ4",
	Gzip = "GZIP",
	Gzip1 = "GZIP-1",
	Gzip2 = "GZIP-2",
	Gzip3 = "GZIP-3",
	Gzip4 = "GZIP-4",
	Gzip5 = "GZIP-5",
	Gzip6 = "GZIP-6",
	Gzip7 = "GZIP-7",
	Gzip8 = "GZIP-8",
	Gzip9 = "GZIP-9",
	Zstd = "ZSTD",
	ZstdFast = "ZSTD-FAST",
	Zle = "ZLE",
	Lzjb = "LZJB",
	Inherit = "INHERIT",
}

/** `truenas.Dataset`'s `sync` argument. */
export enum Sync {
	Standard = "STANDARD",
	Always = "ALWAYS",
	Disabled = "DISABLED",
	Inherit = "INHERIT",
}

/** `truenas.Dataset`'s `deduplication` argument -- like `OnOffInherit`, plus `Verify`. */
export enum Deduplication {
	On = "ON",
	Off = "OFF",
	Verify = "VERIFY",
	Inherit = "INHERIT",
}

/** `truenas.Dataset`'s `snapdir` argument. Only these 3 values -- no `NONE`/`DISABLED` variant exists on this provider. */
export enum SnapshotDirectory {
	Visible = "VISIBLE",
	Hidden = "HIDDEN",
	Inherit = "INHERIT",
}

/** `truenas.Dataset`'s `recordSize` argument. */
export enum RecordSize {
	Size512 = "512",
	Size1K = "1K",
	Size2K = "2K",
	Size4K = "4K",
	Size8K = "8K",
	Size16K = "16K",
	Size32K = "32K",
	Size64K = "64K",
	Size128K = "128K",
	Size256K = "256K",
	Size512K = "512K",
	Size1M = "1M",
	Inherit = "INHERIT",
}
