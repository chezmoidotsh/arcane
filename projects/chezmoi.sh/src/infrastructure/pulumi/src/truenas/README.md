# TrueNAS SCALE (nas.chezmoi.sh) as Code

This folder contains the Pulumi TypeScript stack that manages [nas.chezmoi.sh](https://nas.chezmoi.sh), a TrueNAS SCALE
server, as declarative code. The generated human-facing documentation is published at
[`docs/TRUENAS.md`](../../docs/TRUENAS.md).

## What's managed here

| File/Folder       | Responsibility                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `alerts.ts`       | Alert notifications (e-mail destinations, per-class alert policies)                                                        |
| `apps.ts`         | TrueNAS SCALE app catalog and containerized applications (`garage`, `nginx-proxy-manager`)                                 |
| `certificates.ts` | Certificate Signing Requests (CSRs) for ACME; ACME-signed certificates remain TrueNAS-managed (provider limitation)        |
| `jobs.ts`         | Scheduled cron jobs and maintenance tasks (SMART tests, scrubs, snapshots)                                                 |
| `network.ts`      | Hostname, gateway, DNS nameservers, and physical network interfaces                                                        |
| `services.ts`     | Service enablement on boot (CIFS, NFS, SSH, etc.) — not state management, only startup policy                              |
| `shares.ts`       | NFS and SMB network shares, including the `under()` helper to bind shares to their backing datasets                        |
| `zpools/`         | ZFS pool and dataset hierarchy (one file per pool: `zp1cs01.ts`, `zp1hs01.ts`); see `zpools/README.md` for ZFS conventions |

### Intentionally not managed via Pulumi

- **ACME certificates** (`truenas.Certificate` with `createType: CERTIFICATE_CREATE_ACME`): the provider cannot
  configure DNS-01 challenges or reference a CSR. Only CSR generation is managed.
- **DNS nameservers** (`truenas.DnsNameserver`): duplicates the `networkConfig` in `network.ts`; single source of truth
  is preferred.
- **All but two `truenas.App` resources**: only `garage` and `nginx-proxy-manager` are managed as code; other installed
  apps are left alone.

## Adding or editing a dataset

Datasets are declared recursively as a tree in the zpools files (`zpools/zp1cs01.ts`, `zpools/zp1hs01.ts`) using the
`TrueNASDataset` and `TrueNASPool` types from `@chezmoi.sh/pulumi-truenas-pool`.

### Example structure

```typescript
export const zp1hs01 = new TrueNASPool("zp1hs01", [
  new TrueNASDataset("applications", { compression: Compression.Lz4, atime: OnOffInherit.Off }, [
    new TrueNASDataset("immich", { quota: 50 * ByteSize.Gi }),
    new TrueNASDataset("paperless", { quota: 10 * ByteSize.Gi }),
  ]),
]);
```

### Steps to add or edit

1. **Identify the parent dataset** — datasets nest hierarchically (e.g., `applications` → `immich`). Edit the
   appropriate pool file (`zp1cs01.ts` or `zp1hs01.ts`) and locate the parent `TrueNASDataset`.

2. **Add the child dataset** — within the parent's `children` array (third argument), add a new
   `TrueNASDataset(name, props)`:

   ```typescript
   new TrueNASDataset("mynewds", {
     comments: "Description of the dataset",
     quota: 100 * ByteSize.Gi, // optional: capacity limit
     compression: Compression.Lz4, // optional: compression algorithm
     atime: OnOffInherit.Off, // optional: disable access-time tracking for performance
     recordSize: RecordSize.Size1M, // optional: ZFS record block size
   });
   ```

3. **Understand conventions** — refer to `zpools/README.md` for the rationale behind common settings (compression,
   quotas, recordSize, atime). For application datasets, prefer `atime: Off` and `compression: Lz4` to match existing
   practice.

4. **Test the changes**:

   ```bash
   cd projects/chezmoi.sh/src/infrastructure/pulumi
   pulumi preview
   ```

5. **Look up the dataset later** — other files (like `shares.ts`) reference datasets by their path using the pool's
   `get()` method:
   ```typescript
   const dataset = pool.get("applications/immich")?.resource;
   ```

## Adding or editing a share

Shares are declared directly inside the `nfsShares`/`smbShares` export arrays in `shares.ts` — each array element is a
`new truenas.ShareNfs(...)`/`new truenas.ShareSmb(...)` call. The arrays export the resource instances themselves, not a
hand-maintained plain-data summary. The documentation generator (`../truenas-docs`) is the consumer, and it's
responsible for pulling whatever fields it needs back out of each resource's Outputs (see that project's own README).

### The `under()` helper

```typescript
function under(pool: TrueNASPool, datasetPath: string, ...subpath: string[]);
```

Resolves a dataset in a pool and returns an object with:

- **`path`**: the dataset's live mount point (e.g., `/mnt/zp1cs01/media/animes`) or mount point + optional subpath for
  shares rooted in an unmodeled folder
- **`opts`**: resource options that parent the share under the dataset resource and include aliases for backwards
  compatibility (preventing destructive replace on schema changes)

### Adding an NFS share

Add an entry to the `nfsShares` array:

```typescript
new truenas.ShareNfs(
  "nfs-share-myshare", // pulumi resource name (arbitrary but unique)
  {
    path: under(zp1cs01, "media/mynewds").path,
    comment: "Descriptive comment",
    mapallUser: "nobody", // UID/GID mapping; use app name for application shares
    mapallGroup: "nogroup",
    enabled: true,
  },
  { ...under(zp1cs01, "media/mynewds").opts, ignoreChanges: ["hosts"] },
),
```

**Important:** IP allowlisting (`hosts`) is deliberately omitted and managed directly on the NAS via the UI. Use
`ignoreChanges: ["hosts"]` to prevent Pulumi from drifting on manual changes.

### Adding an SMB share

Add an entry to the `smbShares` array:

```typescript
new truenas.ShareSmb(
  "smb-share-myshare", // pulumi resource name (arbitrary but unique)
  {
    name: "MyShare", // SMB share name (what appears in the browse list)
    path: under(zp1cs01, "media/mynewds").path,
    purpose: "LEGACY_SHARE", // share classification: LEGACY_SHARE, PRIVATE_DATASETS_SHARE, DEFAULT_SHARE, TIMEMACHINE_SHARE
    comment: "Descriptive comment",
    enabled: true,
    readonly: false, // optional
  },
  under(zp1cs01, "media/mynewds").opts,
),
```

## Running Pulumi commands

```bash
cd projects/chezmoi.sh/src/infrastructure/pulumi
mise run pulumi:preview    # Preview pending changes
mise run pulumi:apply      # Apply changes (requires confirmation)
pulumi stack               # Show current stack state
```

See `.agents/skills/` and `AGENTS.md` for commit and PR workflows.
