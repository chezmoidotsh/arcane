# TrueNAS SCALE (nas.chezmoi.sh) as Code

This folder contains the Pulumi TypeScript stack that manages [nas.chezmoi.sh](https://nas.chezmoi.sh), a TrueNAS SCALE
server, as declarative code. The generated human-facing documentation is published at
[`docs/TRUENAS.md`](../../../../../docs/TRUENAS.md).

## What's managed here

| File/Folder       | Responsibility                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `acls.ts`         | NFS4 ACL templates and dataset-to-template assignments for datasets with no single owning account (see `zpools/README.md`)    |
| `alerts.ts`       | Alert notifications (e-mail destinations, per-class alert policies)                                                           |
| `apps.ts`         | TrueNAS SCALE app catalog and containerized applications (`garage`, `nginx-proxy-manager`)                                    |
| `certificates.ts` | Certificate Signing Requests (CSRs) for ACME; ACME-signed certificates remain TrueNAS-managed (provider limitation)           |
| `identities.ts`   | Lookups (not resources) for pre-existing TrueNAS identities (`apps` user, `builtin_users` group) shared by `acls.ts`/`users/` |
| `jobs.ts`         | Scheduled cron jobs and maintenance tasks (SMART tests, scrubs, snapshots)                                                    |
| `network.ts`      | Hostname, gateway, DNS nameservers, and physical network interfaces                                                           |
| `services.ts`     | Service enablement on boot (CIFS, NFS, SSH, etc.) — not state management, only startup policy                                 |
| `shares.ts`       | NFS and SMB network shares                                                                                                    |
| `users/`          | Service accounts (`truenas.User`), one file per account, colocated with the NFS4 ACL assignment for the dataset it owns       |
| `zpools/`         | ZFS pool and dataset hierarchy (one file per pool: `zp1cs01.ts`, `zp1hs01.ts`); see `zpools/README.md` for ZFS conventions    |

### Intentionally not managed via Pulumi

- **ACME certificates** (`truenas.Certificate` with `createType: CERTIFICATE_CREATE_ACME`): the provider cannot
  configure DNS-01 challenges or reference a CSR. Only CSR generation is managed.
- **DNS nameservers** (`truenas.DnsNameserver`): duplicates the `networkConfig` in `network.ts`; single source of truth
  is preferred.
- **All but two `truenas.App` resources**: only `garage` and `nginx-proxy-manager` are managed as code; other installed
  apps are left alone.

## Adding or editing a dataset

Datasets are declared as a flat, path-keyed record in the zpools files (`zpools/zp1cs01.ts`, `zpools/zp1hs01.ts`) using
the `TrueNASPool` type from `@chezmoi.sh/pulumi-truenas-pool`. Each key is the dataset's full pool-relative path
(leading `/`); nesting is inferred from the path itself, not from object nesting, so every ancestor must be declared as
its own entry too.

### Example structure

```typescript
export const zp1hs01 = new TrueNASPool("zp1hs01", {
  "/applications": { compression: Compression.Lz4, atime: OnOffInherit.Off },
  "/applications/immich": { quota: 50 * ByteSize.Gi },
  "/applications/paperless": { quota: 10 * ByteSize.Gi },
});
```

### Steps to add or edit

1. **Identify the parent path** — datasets nest hierarchically (e.g., `/applications` → `/applications/immich`). Edit
   the appropriate pool file (`zp1cs01.ts` or `zp1hs01.ts`) and locate the parent's entry; it must already exist as its
   own key.

2. **Add the child dataset** — add a new key for the full path, right after its parent's entry:

   ```typescript
   "/applications/mynewds": {
     comments: "Description of the dataset",
     quota: 100 * ByteSize.Gi, // optional: capacity limit
     compression: Compression.Lz4, // optional: compression algorithm
     atime: OnOffInherit.Off, // optional: disable access-time tracking for performance
     recordSize: RecordSize.Size1M, // optional: ZFS record block size
   },
   ```

3. **Understand conventions** — refer to `zpools/README.md` for the rationale behind common settings (compression,
   quotas, recordSize, atime). For application datasets, prefer `atime: Off` and `compression: Lz4` to match existing
   practice.

4. **Test the changes**:

   ```bash
   cd projects/chezmoi.sh/src/infrastructure/pulumi
   pulumi preview
   ```

5. **Look up the dataset later** — other files (like `shares.ts`) reference datasets by their path (without the leading
   `/`) using the pool's `get()` method, which throws if the path isn't declared:
   ```typescript
   const dataset = pool.get("applications/immich").resource;
   ```

## Adding or editing a share

Shares are declared as standalone `new truenas.ShareNfs(...)`/`new truenas.ShareSmb(...)` calls directly in `shares.ts`,
not collected into a hand-maintained plain-data summary. The documentation generator (`toolbox/truenas-docs`) doesn't
import this file at all — it reads share state back out of `pulumi stack export` (see that project's own README).

### Adding an NFS share

Add a new declaration in `shares.ts`:

```typescript
new truenas.ShareNfs(
  "nfs-share-myshare", // pulumi resource name (arbitrary but unique)
  {
    path: zp1cs01.get("media/mynewds").resource.mountPoint,
    comment: "Descriptive comment",
    mapallUser: "nobody", // UID/GID mapping; use app name for application shares
    mapallGroup: "nogroup",
    enabled: true,
  },
  { parent: zp1cs01.get("media/mynewds").resource, ignoreChanges: ["hosts"] },
);
```

**Important:** IP allowlisting (`hosts`) is deliberately omitted and managed directly on the NAS via the UI. Use
`ignoreChanges: ["hosts"]` to prevent Pulumi from drifting on manual changes.

### Adding an SMB share

Add a new declaration in `shares.ts`:

```typescript
new truenas.ShareSmb(
  "smb-share-myshare", // pulumi resource name (arbitrary but unique)
  {
    name: "MyShare", // SMB share name (what appears in the browse list)
    path: zp1cs01.get("media/mynewds").resource.mountPoint,
    purpose: "LEGACY_SHARE", // share classification: LEGACY_SHARE, PRIVATE_DATASETS_SHARE, DEFAULT_SHARE, TIMEMACHINE_SHARE
    comment: "Descriptive comment",
    enabled: true,
    readonly: false, // optional
  },
  { parent: zp1cs01.get("media/mynewds").resource, ignoreChanges: ["hosts"] },
);
```

## Running Pulumi commands

```bash
cd projects/chezmoi.sh/src/infrastructure/pulumi
mise run pulumi:preview    # Preview pending changes
mise run pulumi:apply      # Apply changes (requires confirmation)
pulumi stack               # Show current stack state
```

See `.agents/skills/` and `AGENTS.md` for commit and PR workflows.
