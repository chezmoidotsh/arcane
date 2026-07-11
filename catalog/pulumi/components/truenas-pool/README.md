# `@chezmoi.sh/pulumi-truenas-pool`

A Pulumi `ComponentResource` (`chezmoi:truenas:Pool`) that models a **ZFS dataset tree** on top of an **existing,
physical TrueNAS pool** (`nas.chezmoi.sh`). It never creates a `truenas.Pool` resource — the pool and its disk topology
already exist physically; this component only declares and manages the dataset hierarchy under it.

## Why a component at all

The dataset tree for a NAS is naturally recursive (a pool contains datasets, which contain child datasets, ...), and
every consumer stack needs the same three things on top of that tree: materializing it as `truenas.Dataset` resources
with the right parent/child chain, looking a dataset back up by its human path once built, and a human-readable summary
of what's actually there. Centralizing that here means any project with a TrueNAS-backed dataset layout (today:
`chezmoi.sh`) gets it for free instead of re-deriving full dataset paths and parenting by hand.

## Usage

```typescript
import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import { TrueNASDataset, TrueNASPool } from "@chezmoi.sh/pulumi-truenas-pool";

// zp1cs01 already exists as a physical pool on the NAS — this only builds the
// dataset tree under it.
const zp1cs01 = new TrueNASPool("zp1cs01", [
  new TrueNASDataset("media", {}, [
    new TrueNASDataset("animes"),
    new TrueNASDataset("inbox", { quota: 50 * ByteSize.Gi }),
  ]),
]);

export const zp1cs01Topology = zp1cs01.topology().apply((t) => t.toString());
export const zp1cs01DatasetsTree = zp1cs01.datasetsTree();
```

`TrueNASDataset`'s second argument is `Omit<truenas.DatasetArgs, "name" | "pool" | "parentDataset">` — any `Dataset`
property except the three the component derives from the tree position itself (the leaf segment, the pool name, and the
accumulated relative parent path). Every property that's a closed set of values on the real TrueNAS API is re-typed
against a proper enum instead of the SDK's bare `string` (the underlying Terraform provider schema doesn't model any of
these as anything narrower than `string`):

- **`atime` / `readonly`** — `pulumi.Input<OnOffInherit>` (`OnOffInherit.On` / `.Off` / `.Inherit`). The TrueNAS API
  only ever accepts exactly these 3 values for either property.
- **`compression`** — `pulumi.Input<Compression>` (`Compression.Lz4`, `.Zstd`, `.Gzip9`, `.Inherit`, ...) — every value
  the provider's own schema docs list.
- **`sync`** — `pulumi.Input<Sync>` (`.Standard`, `.Always`, `.Disabled`, `.Inherit`).
- **`deduplication`** — `pulumi.Input<Deduplication>` (`.On`, `.Off`, `.Verify`, `.Inherit`).
- **`snapdir`** — `pulumi.Input<SnapshotDirectory>` (`.Visible`, `.Hidden`, `.Inherit`). Only these 3 — there's no
  `NONE`/`DISABLED` variant on this provider.
- **`recordSize`** — `pulumi.Input<RecordSize>` (`.Size128K`, `.Size1M`, `.Inherit`, ...).

Several things `bmanojlovic/truenas` (the provider this package used before
[`PjSalty/terraform-provider-truenas`](https://github.com/PjSalty/terraform-provider-truenas)) exposed that this one
**doesn't have at all** — confirmed directly against the generated SDK's `DatasetArgs` interface, not just the docs,
since a couple of these looked plausible enough to almost assume were just undocumented:

- **No `casesensitivity`** — not exposed as a settable attribute at all. It's fixed at creation by the TrueNAS API's own
  default and can't be pinned or drifted from here.
- **No `checksum`** — the checksum algorithm can't be set through this provider.
- **No `acltype`/`aclmode`** — ACL type/mode aren't settable through this provider either; use a separate filesystem-ACL
  mechanism if you need to manage these.
- **No `special_small_block_size`** ("metadata special block" / small-block allocation to a special vdev) — not exposed.
- **No `snapdev`** — moot in practice here anyway, since this component only ever creates `FILESYSTEM` datasets, never
  `VOLUME` (zvols are the only dataset type `snapdev` applies to).
- **No ownership/mode** (`uid`/`gid`/`mode`) — the TrueNAS provider exposes that as a separate filesystem-ACL resource,
  not a field on `Dataset` itself (this was already true with the old provider).

## Looking datasets back up

Reach a dataset by its pool-relative path (i.e. without the pool name prefix) once the tree is built:

```typescript
zp1cs01.get("media/inbox"); // typed, returns TrueNASDataset | undefined
```

## Topology and dataset tree

There is no single combined "generate the whole doc" method — `topology()` and `datasetsTree()` are two independent
pieces, each returning content with **no title of its own** (no `##`/`###` heading), so the caller composes its own
document structure around them instead of being locked into one.

### Why neither goes through the managed resources

Neither pool topology nor per-dataset encryption round-trips through `truenas.Pool`/`truenas.Dataset` or their data
sources at all — confirmed empirically (2026-07-10): importing an existing pool as a `truenas.Pool` only ever yields
`{name}` (the provider's own docs call `topology_json` "ignored after import, since the API does not round-trip the
original request form"), and `truenas.Dataset`'s schema has no encryption field whatsoever. That's a deliberate design
choice on the provider's side (avoids modeling the deeply-nested discriminated-union topology schema), not a bug to work
around.

Neither `topology()` nor `datasetsTree()` reads from the resources they manage at all. Instead,
[`truenas-api.ts`](./src/truenas-api.ts) opens a short-lived, authenticated JSON-RPC 2.0 connection directly to TrueNAS
SCALE's own API (`wss://<host>/api/current`, the same transport the TrueNAS web UI and `pool.query`/`pool.dataset.query`
middleware calls use) and reads live, read-only, one call per method. This also means it's not tied to the REST v2.0
gateway, which TrueNAS itself is phasing out in favor of JSON-RPC-over-WebSocket (the new provider's own `wsclient`
dropped REST entirely for the same reason).

Credentials come from the same stack config the default `truenas` provider already needs: `truenas:url` and
`truenas:apiKey`. Any connection/auth/query failure degrades to the placeholders described below instead of failing the
whole `pulumi up`.

### `topology()`

```typescript
pool.topology(): pulumi.Output<TrueNASTopology>;

class TrueNASTopology {
	toString(): string;                 // the nested-box vdev/mirror diagram, no title
	diskModels(): Map<string, string>;  // model id -> full model string, deduped
}
```

`toString()` is a diagram of the pool's vdevs (mirrors/RAIDZ/stripes) as nested boxes, from `pool.query`'s `topology`
field, keyed by vdev category (`data`/`cache`/ `log`/`spare`/`special`/`dedup`, each an array of vdev nodes). Each vdev
box is labeled `TYPE - SIZE` (e.g. `MIRROR - 4To`), `SIZE` being that vdev's own `stats.size` — ZFS's own
usable-capacity figure for that vdev, not computed here from member disk sizes.

Each disk box reads `DISK`, its physical type (`SSD`/`HDD`, from `disk.query`, matched via the vdev leaf node's own
`disk` field — the real device name, e.g. `sdc`), and a size. A disk nested inside a redundant vdev (a mirror/RAIDZ
member) always reports `stats.size: 0` for itself over the API (only the enclosing vdev's node has the real figure), so
that size is _estimated_ instead: back-derived from the enclosing vdev's own `stats.size` + redundancy type + member
count (`estimateMemberDiskSize` in [`topology.ts`](./src/topology.ts)), assuming uniform member disk sizes — mirror
members show the vdev's own usable size, RAIDZ*N* members show `usable / (members - N)`. The `type` line has no such
caveat — it's read directly per-disk from `disk.query`, real regardless of redundancy. A bare, non-redundant top-level
disk (no `MIRROR`/`RAIDZ` wrapper) shows its own real size instead, since it _is_ the vdev in that case — neither pool
in this repo has one (both are simple 2-disk mirrors), so that path is untested against a live payload. If a disk's
device name isn't found in `disk.query` (shouldn't happen against a real payload), its box falls back to just `DISK` +
size, with no id line either.

Just below each disk box (still inside its enclosing vdev frame, no border of its own) is a 4-character lowercase hex id
— the first 4 hex digits of a SHA-256 hash of the disk's _model_ string (`modelId` in
[`topology.ts`](./src/topology.ts)), e.g. `Samsung_SSD_870_EVO_1TB` -> `74c4`. Two disks sharing the same model always
get the same id. That id, not the model string itself, is what's shown per-disk — model names are far wider than these
boxes and would force every box in the diagram to grow to match. Call `diskModels()` separately to map each _unique_ id
back to its full model — one entry per distinct model actually present (not one per physical disk), that's the dedup: a
pool with ten identical drives gets one entry, not ten. It's a plain `Map`, not pre-formatted text, since how (or
whether) to render it is left to the caller — e.g. `[...topology.diskModels()].map(([id, model]) => \`-
${id}:
${model}\`).join("\n")\`.

Member disks are drawn touching, as one contiguous set — same as sibling vdev boxes within a category. Beyond 5 boxes
wide — disks within one vdev, or vdevs within one category — rendering wraps to an additional row stacked below, both to
keep wide pools readable and to bound line length.

### `datasetsTree()` / `TrueNASDataset.toString()`

```typescript
pool.datasetsTree(): pulumi.Output<string>;   // pool-wide, columns aligned across every dataset

class TrueNASDataset {
	live?: TrueNASDatasetInfo;                  // populated by datasetsTree(), read by toString()
	toString(prefix?: string, isLast?: boolean): string;
}
```

A file-tree view of the dataset hierarchy, one row per dataset, columns aligned: tree-prefixed name, then any notable
info (`quota=`, `encrypted`, `readonly`, `dedup=`, joined by a bare comma, no space), then the dataset's `comments`
field as a free-form description. Every one of these values is read from `live` — populated from the live
`pool.dataset.query` result matched by full dataset name, never from the managed `truenas.Dataset` resource's own
outputs (it has no encryption field to read at all, and keeping the info column consistently sourced from one place was
simpler than splitting it). Columns are simply left blank (padding only) when nothing applies — no dash/placeholder
filler.

`pool.datasetsTree()` fetches once, attaches `live` to every `TrueNASDataset` in the tree, then renders all of them
together (pool name as root), columns aligned across the _entire_ pool. Each individual
`TrueNASDataset.toString(prefix?, isLast?)` renders just that node and its own descendants — usable standalone (e.g.
`` `${dataset}` ``, which calls it with no arguments, rendering as an isolated root), but its column alignment only
spans its own subtree, not siblings elsewhere in the pool. `prefix`/ `isLast` exist so a parent can position a child
correctly (`datasetsTree()` does exactly that internally, across every top-level dataset at once).

A richer tree — one dataset with just a comment, one with a quota, one encrypted **and** quota'd, one read-only, one
deduplicated — renders (via `datasetsTree()`) as:

```typescript
import { ByteSize } from "@chezmoi.sh/pulumi-lib";
import { OnOffInherit } from "@chezmoi.sh/pulumi-truenas-pool";

const zp1hs01 = new TrueNASPool("zp1hs01", [
  new TrueNASDataset("applications", { comments: "app data" }, [
    new TrueNASDataset("immich", { quota: 50 * ByteSize.Gi }),
    new TrueNASDataset("paperless", { quota: 10 * ByteSize.Gi }),
  ]),
  new TrueNASDataset("backups", { quota: 100 * ByteSize.Gi, comments: "offsite backups" }, [
    new TrueNASDataset("hass.chezmoi.sh", { readonly: OnOffInherit.On }),
  ]),
  new TrueNASDataset("documents", { deduplication: "ON", comments: "dedup'd shared docs" }),
]);
```

```text
zp1hs01
├─ applications                               app data
│  ├─ immich           quota=50Gi
│  └─ paperless        quota=10Gi,encrypted
├─ backups             quota=100Gi,encrypted  offsite backups
│  └─ hass.chezmoi.sh  readonly
└─ documents           dedup=ON               dedup'd shared docs
```

(`paperless`/`backups` show `encrypted` here because that's their _live, real_ status on the NAS — this provider has no
`encryption` argument to set it through Pulumi at all; encryption is inherited from an ancestor's encryption root, set
once outside Pulumi.)

### Example output

For the `zp1cs01` example from [Usage](#usage) (plus a `media` dataset with a comment) and a `data` vdev made of a
mirrored pair (2 SSDs) and a 3-disk RAIDZ1 (3 HDDs) — `zp1cs01Topology` and `zp1cs01DatasetsTree` from that same
example, shown one after the other (nothing forces them to be — that's the point of not having a combined method):

`zp1cs01Topology`:

````markdown
```text
──────────────────[ DATA ]──────────────────
┌────────────────┐┌────────────────────────┐
│  MIRROR - 4To  ││     RAIDZ1 - 16To      │
│┌──────┐┌──────┐││┌──────┐┌──────┐┌──────┐│
││ DISK ││ DISK ││││ DISK ││ DISK ││ DISK ││
││ SSD  ││ SSD  ││││ HDD  ││ HDD  ││ HDD  ││
││ 4To  ││ 4To  ││││ 8To  ││ 8To  ││ 8To  ││
│└──────┘└──────┘││└──────┘└──────┘└──────┘│
│  74c4    74c4  ││  8918    8918    8918  │
└────────────────┘└────────────────────────┘
```
````

`Object.fromEntries(topology.diskModels())` (or however the caller formats it):

```json
{ "74c4": "Samsung_SSD_870_EVO_1TB", "8918": "ST4000VN006-3CW104" }
```

`zp1cs01DatasetsTree`:

````markdown
```text
zp1cs01
└─ media                  media library
   ├─ animes
   └─ inbox   quota=50Gi
```
````

## Prerequisites

- **Node.js** and a package manager. The repository root is a **pnpm workspace** (`pnpm-workspace.yaml` + root
  `package.json`) for developer convenience; Pulumi's own `nodejs` runtime is configured with
  `runtime.options.packagemanager: pnpm` in the consuming stack's `Pulumi.yaml`, so it resolves workspace packages the
  same way `pnpm install -r` does.
- **Pulumi CLI** — installed via `mise install` (see `.mise.toml`).
- A generated **`@pulumi/truenas`** SDK (`PjSalty/truenas` Terraform provider bridged via `packages:` in `Pulumi.yaml`)
  available on disk at [`catalog/pulumi/sdks/truenas`](../../sdks/truenas), shared by every consumer through a relative
  `file:` path — this package's `package.json` depends on it the same way.
- Stack config `truenas:url` (e.g. `https://nas.chezmoi.sh`) and `truenas:apiKey` (secret) — used both to auto-configure
  the default `truenas` provider and, directly, by `topology()`/`datasetsTree()`'s JSON-RPC client (see
  [Why neither goes through the managed resources](#why-neither-goes-through-the-managed-resources)).

## Installation

Add it to the consuming stack's `package.json` as a workspace dependency (matching `@chezmoi.sh/pulumi-cluster-vault`
and `@chezmoi.sh/pulumi-lib`):

```json
{
  "dependencies": {
    "@chezmoi.sh/pulumi-truenas-pool": "workspace:*"
  }
}
```

Then import it **by package name** (not by relative path):

```typescript
import { TrueNASDataset, TrueNASPool } from "@chezmoi.sh/pulumi-truenas-pool";
```

Install from the repository root for editing/type-checking across the workspace:

```sh
pnpm install -r   # installs + links every package in the workspace
```

`pulumi up`/`pulumi preview` then resolve the same `workspace:*` link automatically via the stack's
`packagemanager: pnpm` runtime option — no per-stack install is needed by hand.

## Created Resources

For a dataset tree of `n` nodes, the component registers `n` `truenas.Dataset` resources
(`truenas:index/dataset:Dataset`), each parented to its position in the tree: the top-level datasets are parented to the
`chezmoi:truenas:Pool` component itself, and every nested dataset is parented to its immediate parent `Dataset`. Each
resource's `pool` argument is the pool name, `parentDataset` is the accumulated relative path of its parent (`undefined`
for a top-level dataset), and `name` is just its own leaf segment — the full ZFS path is `pool/parentDataset/name`.
Resource _names_ (not ZFS paths) are still the full pool-relative path with `/` and `.` replaced by `-` (e.g.
`zp1hs01/applications/truenas/fr.deuxfleurs.garage` → resource name
`zp1hs01-applications-truenas-fr-deuxfleurs-garage`).

No `truenas.Pool` resource is ever created — see [Why a component at all](#why-a-component-at-all).

## Module layout

The component's Pulumi type token is `chezmoi:truenas:Pool`. Source is split by concern — each file's own doc
comment/JSDoc is the reference for its exact exports, so nothing here duplicates full type signatures:

- [`enums.ts`](./src/enums.ts) — the closed-value `truenas.Dataset` arguments (`OnOffInherit`, `Compression`, `Sync`,
  `Deduplication`, `SnapshotDirectory`, `RecordSize`).
- [`dataset.ts`](./src/dataset.ts) — `TrueNASDataset` and `DatasetArgs`: one ZFS dataset node, its materialization into
  a `truenas.Dataset`, and its tree-rendering (`toString()`).
- [`topology.ts`](./src/topology.ts) — `TrueNASTopology` and the ASCII box-drawing engine behind its
  `toString()`/`diskModels()`.
- [`pool.ts`](./src/pool.ts) — `TrueNASPool`, the `ComponentResource` itself: dataset-tree materialization, `get()`, and
  the two JSON-RPC-backed methods `topology()`/`datasetsTree()`.
- [`truenas-api.ts`](./src/truenas-api.ts) — the read-only JSON-RPC 2.0 client backing `topology()`/`datasetsTree()`
  (see [Why neither goes through the managed resources](#why-neither-goes-through-the-managed-resources)).

`src/index.ts` only re-exports the above — import from the package root (`@chezmoi.sh/pulumi-truenas-pool`), not from
these files directly.

## Testing

The package ships unit tests as **Mocha + Chai**, split to mirror `src/`'s own module layout:

- [`pool.test.ts`](./src/pool.test.ts) — `TrueNASDataset`/`TrueNASPool` materialization exercises real Pulumi resource
  creation, so it uses `@pulumi/pulumi/runtime` mocks (`setMocks`) that capture every `Dataset` resource the pool
  materializes.
- [`topology.test.ts`](./src/topology.test.ts) — `TrueNASTopology.toString()`/ `diskModels()` against fixture objects
  shaped like real `pool.query`/`disk.query` responses. Coverage includes per-vdev labels, row-wrapping past 5 boxes at
  both the vdev and category level, the degraded-placeholder path when pool information is unavailable, and the model-id
  dedup.
- [`dataset.test.ts`](./src/dataset.test.ts) — `TrueNASDataset.toString()` with `live` set directly on fixture nodes
  (rather than going through `TrueNASPool.datasetsTree()`'s fetch). Coverage includes the
  quota/encrypted/readonly/dedup/comments info column and `prefix`/`isLast` positioning.

None of these test `TrueNASPool.topology()`/`datasetsTree()` themselves — the thin orchestrators that fetch over
JSON-RPC then delegate to the rendering above — since that would just be re-exercising already-tested logic over a live
network dependency that isn't a Pulumi invoke and so can't be mocked via `setMocks`.

Run from this directory (the `test` script is `mocha`, wired through `ts-node` via [`.mocharc.json`](./.mocharc.json)),
invokable as either:

```sh
npm test       # Pulumi's npm-scoped execution model
pnpm test      # inside the pnpm workspace
```

## References

- Live consumer: [`chezmoi.sh`](../../../../projects/chezmoi.sh/src/infrastructure/pulumi/src/truenas-datasets.ts)
- [`catalog/pulumi/README.md`](../../README.md) — workspace / dependency-resolution rationale

## License

This package is released under the Apache 2.0 license. For more information, see the [LICENSE](../../../../LICENSE)
file.
