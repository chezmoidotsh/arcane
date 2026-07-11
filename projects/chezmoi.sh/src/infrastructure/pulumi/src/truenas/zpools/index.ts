// -----------------------------------------------------------------------------
// TrueNAS ZFS pools (nas.chezmoi.sh)
// -----------------------------------------------------------------------------
// One file per pool: zp1cs01 (media) and zp1hs01 (apps/backups/documents).
//
// atime/compression are left unset almost everywhere: both pool roots
// (not Pulumi-managed) set atime=off, compression=lz4, and datasets inherit
// that. Explicit only where locally overridden on the real NAS
// (zp1hs01/applications and its `truenas` subtree).
//
// `recordSize` is set to 1M on zp1hs01/applications/immich only, a
// deliberate deviation from the 128K default (larger media/DB files benefit
// from a bigger record size).
//
// Personal datasets (zp1hs01/documents/{alexandre,estelle,shared}) are
// intentionally left out of `documents` for now.
//
// Filesystem ACLs are intentionally NOT managed here via
// `truenas.FilesystemAcl`: every real dataset uses NFS4 "BASIC" permission
// presets, and the provider's `dacls` schema (flat POSIX1E-style booleans)
// doesn't map NFS4 permissions at all -- managing them through Pulumi as-is
// would silently strip real permissions on the first `pulumi up` that
// touched them.
//
// Scrub/snapshot tasks live alongside each pool's declaration: unlike
// TrueNASDataset, they aren't part of the recursive dataset-tree
// abstraction (a scrub task targets a whole pool, a snapshot task targets
// one dataset path + a recursion flag), so they're declared as plain
// `truenas.*` resources rather than through `@chezmoi.sh/pulumi-truenas-pool`.
//
// `zp1cs01`/`zp1hs01` themselves aren't re-exported here (would leak as huge
// stack outputs) -- other files (e.g. ../shares.ts) import them directly
// from `./zp1cs01`/`./zp1hs01` to look up dataset resources by path.
