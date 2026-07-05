# `catalog/pulumi/`

Shared Pulumi `ComponentResource` packages consumed by the per-project stacks in
`projects/*/src/infrastructure/pulumi/`.

## Two install paths, on purpose

This repo is a **pnpm workspace** (`pnpm-workspace.yaml` + root `package.json` at the repo
root) covering `catalog/pulumi/*` and every `projects/*/src/infrastructure/pulumi`. That's a
**developer-convenience layer only**:

```sh
pnpm install -r   # one shot: installs + links every package in the workspace
pnpm typecheck    # tsc --noEmit across all of them
```

**`pulumi up`/`pulumi preview` do not use this.** Pulumi's Node.js runtime installs each
stack's dependencies with **plain `npm install`/`npm ci`, scoped to that stack's own
directory** — it never sees the workspace root. That's also the execution model a future
in-cluster Pulumi Operator would use: one isolated directory, one `npm ci`.

This is why every shared component here is referenced via the **`file:` protocol** (not
`workspace:*` or a plain semver range) in each consuming stack's `package.json`, e.g.:

```json
"@chezmoi.sh/pulumi-cluster-vault": "file:../../../../../catalog/pulumi/cluster-vault"
```

`file:` resolves identically whether npm/pnpm is invoked from the workspace root or in
complete isolation inside a single stack directory — so it's the only protocol that keeps
Pulumi's own `npm install` working *and* lets `pnpm install -r` at the root give you clean
`import { X } from "@chezmoi.sh/pulumi-cluster-vault"` resolution everywhere, instead of
`../../../../../catalog/pulumi/...` relative paths.

## Known limitation

Each stack directory must stay a fully self-sufficient npm package — every dependency
(including `typescript` itself) must be declared directly in that stack's own
`package.json`, never hoisted to the root-only. Nothing can rely on root-level hoisting,
since Pulumi's automatic install never runs at the root. Concretely, this means shared
`@pulumi/*` provider SDK versions are **duplicated by hand** across each `package.json` —
pnpm's `catalog:` protocol would centralize that, but it isn't valid syntax for plain `npm
install`, which breaks the moment Pulumi tries to install a stack on its own. Keep versions
in sync manually when bumping a shared provider.
