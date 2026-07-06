# `@chezmoi.sh/pulumi-lib`

A multi-helper shared library for the per-project Pulumi stacks in
`projects/*/src/infrastructure/pulumi/`. Each helper lives in its own module
under [`src/`](./src/) and is re-exported from
[`src/index.ts`](./src/index.ts), so consumers import everything from the
package root:

```typescript
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
```

This is a **library package, not a `ComponentResource` package** — it exports
plain functions and interfaces, not Pulumi resources of its own. Consuming
stacks depend on it through the **`file:` protocol**; the full rationale for
that (Pulumi's runtime installs each stack with isolated plain `npm`, never the
workspace root) lives in [`catalog/pulumi/README.md`](../README.md).

## `vaultSecretMetadata(source, opts?)`

Builds the four shared `customMetadata.data` fields every `vault.kv.SecretV2`
in this homelab carries — the ones that are identical across every call site or
derivable from the credential resource itself. The per-secret
`description` / `application` fields stay at the call site; spread this
object's result alongside them.

### Returned fields

| Field             | Value                                                                                            | Source                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `created-by`      | Repo-relative path of the file that pushed the secret, e.g. `projects/amiya.akn/.../platform.ts` | Auto-detected from the V8 call stack at call time (see [Assumptions](#assumptions)). |
| `owner`           | Second path segment of the caller's path, e.g. `amiya.akn`.                                      | Derived from `created-by` at call time.                                              |
| `renewal-process` | A single fixed sentence describing what rotation does.                                           | Hard-coded constant — identical for every secret.                                    |
| `x-renewal-cmd`   | The exact `pulumi up --replace '<urn>'` command that rotates the credential.                     | `opts.renewalUrn ?? source.urn`, wrapped in `pulumi.interpolate`.                    |

### Usage

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import { vaultSecretMetadata } from "@chezmoi.sh/pulumi-lib";
import { Dns01TokenComponent } from "@chezmoi.sh/pulumi-cloudflare-dns01-token";

const token = new Dns01TokenComponent("cert-manager", {
	owner: "amiya.akn",
	application: "cert-manager",
	accountId: cloudflareAccountId,
	zoneId: chezmoiShZoneId,
});

new vault.kv.SecretV2(
	"cert-manager-token",
	{
		mount: "shared",
		name: "third-parties/cloudflare/iam/amiya.akn/cert-manager-rw",
		dataJson: pulumi.jsonStringify({ api_token: token.tokenValue }),
		customMetadata: {
			data: {
				description: "Cloudflare API Token for cert-manager",
				application: "cert-manager",
				...vaultSecretMetadata(token, { renewalUrn: token.tokenUrn }),
			},
		},
	},
	{ parent: token },
);
```

### Why a function, not a component

The Vault-push convention deliberately stays a **plain function that returns a
spreadable object**, not a `pulumi.ComponentResource` that owns the `SecretV2`.
A component wrapper would have to re-parent the `SecretV2`, and **re-parenting
changes the secret's URN** — Pulumi would then treat it as a new resource,
deleting the old one and recreating it under the new URN. `SecretV2` deletion
**destroys the secret at its path** in Vault, which is exactly the
data-loss-on-deploy event this convention exists to prevent. Keeping the helper
as a function leaves the `SecretV2` parented to the credential resource the
caller already chose (above: `{ parent: token }`), so its URN — and lifecycle —
never moves.

### `opts.renewalUrn`

Defaults to `source.urn`. **Pass it explicitly when `source` is a
`ComponentResource` that encapsulates the real replace target.** Running
`pulumi up --replace` on a component's own URN does not reliably force-replace
its child resources — the engine may refresh the component envelope without
rotating the credential underneath it. For `Dns01TokenComponent`, that means
passing `tokenUrn` (the URN of the inner `cloudflare.AccountToken`), so the
generated `x-renewal-cmd` targets the resource that actually holds the
credential value:

```typescript
vaultSecretMetadata(token, { renewalUrn: token.tokenUrn });
```

For a plain (non-component) credential resource, omit `opts` and let it default
to `source.urn`.

## Assumptions

This helper makes two execution-model assumptions that hold for every stack in
this repo today but would need revisiting if either changes:

1. **Unbundled ts-node / CommonJS execution.** `created-by` reads the call
   site's file name from the V8 call stack via `Error.prepareStackTrace`. That
   only works while sources are loaded unbundled — which is how Pulumi's Node.js
   runtime runs every stack (ts-node over raw `.ts`). Revisit before
   introducing a bundler: bundling collapses call-site frames and the stack walk
   would throw rather than emit a wrong `created-by`.
2. **Full repo checkout present at runtime.** The repo-root anchor (a directory
   containing `.git` or `pnpm-workspace.yaml`) is located by walking up from the
   caller's file. Pulumi runs each stack from a checkout of the whole repo, so
   the anchor is always reachable. If it ever is not — e.g. a stack directory
   vendored in isolation — the function **throws loudly** rather than guess,
   because a wrong `created-by` (the whole point of the field) is worse than a
   stack that fails to evaluate.

## Installation

This is a **self-contained, `private: true` package** — it is **not published
to any registry** and is **not added as an npm `workspace:*` dependency**.
Consuming stacks depend on it through the **`file:` protocol**, the only
protocol that resolves identically whether npm runs from the workspace root or
in complete isolation inside a single stack directory (which is how Pulumi's
runtime installs dependencies). The full rationale lives in
[`catalog/pulumi/README.md`](../README.md).

Add it to the consuming stack's `package.json`:

```json
{
	"dependencies": {
		"@chezmoi.sh/pulumi-lib": "file:../../../../../catalog/pulumi/lib"
	}
}
```

Then install from the repository root for editing / type-checking across the
workspace:

```sh
pnpm install -r   # installs + links every package in the workspace
```

`pulumi up` / `pulumi preview` then run their own `npm install` scoped to each
stack's directory automatically — no per-stack install is needed by hand.

## Testing

The package ships unit tests in
[`vault-secret-metadata.test.ts`](./src/vault-secret-metadata.test.ts) using
**Mocha + Chai** with `@pulumi/pulumi/runtime` mocks (`setMocks`). The
caller-detection path is exercised end to end: because the caller of
`vaultSecretMetadata` in the suite is the test file itself, `created-by` must
resolve to this package's own `catalog/pulumi/lib/src/vault-secret-metadata.test.ts`
— proving the stack walk and repo-root anchor work together. Run from this
directory:

```sh
npm test                  # Pulumi's npm-scoped execution model
npm run typecheck:test    # tsc --noEmit against tsconfig.test.json
```

## License

This package is released under the Apache 2.0 license. For more information, see
the [LICENSE](../../../LICENSE) file.
