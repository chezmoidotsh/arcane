# `@chezmoi.sh/pulumi-cluster-vault`

A self-contained Pulumi `ComponentResource` (`chezmoi:vault:ClusterVault`) that
automates OpenBao/Vault configuration for a single Kubernetes cluster. For a cluster
named `<name>` it provisions everything External Secrets Operator (ESO) needs to pull
secrets from that cluster's dedicated mount: a **KV v2 mount** at `<name>/`, a
**Kubernetes auth backend** at `<name>`, a **least-privilege ESO read policy**
(`<name>-eso-policy`), and an **ESO auth role** (`<name>-eso-role`) bound to the
`external-secrets` ServiceAccount.

One component covers all three connectivity variants (Local, Remote, Tailscaled) —
the arg shape selects which one applies. Path layout follows
[ADR-003](../../../docs/decisions/003-openbao-path-naming-conventions.md) and policy
naming/scoping follows [ADR-004](../../../docs/decisions/004-openbao-policy-naming-conventions.md).

> \[!WARNING]
> This component encodes the conventions defined in
> [ADR-003](../../../docs/decisions/003-openbao-path-naming-conventions.md) (path naming)
> and [ADR-004](../../../docs/decisions/004-openbao-policy-naming-conventions.md) (policy
> naming and scope). Consult those ADRs before changing the generated policy HCL, mount
> paths, or role bindings.

## Variants overview

The variant is selected entirely by the args shape — `remote`, `tailscaled`, or
neither. `remote` and `tailscaled` are **mutually exclusive** (the constructor throws
if both are set).

| Variant        | Use case                                       | Configuration                                | Authentication                             | Network requirements                      |
| -------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| **Local**      | Cluster hosting OpenBao itself                 | Minimal — no `remote`/`tailscaled` block     | In-cluster default (local CA + JWT)        | OpenBao and the API in the same cluster   |
| **Remote**     | Cluster reached over an untrusted network path | `remote: { host, caCert, tokenReviewerJwt }` | Manual — caller supplies CA + reviewer JWT | Direct/ingress reachability to the API    |
| **Tailscaled** | Cluster reached over the tailnet               | `tailscaled: { host }`                       | Standard — local CA + JWT, host overridden | Kubernetes API reachable over the tailnet |

Shared access (read on `shared/+/third-parties/+/+/<name>` and `shared/+/certificates/*`)
is **always enabled** for Local and Tailscaled, and **defaults to enabled** for Remote
(set `remote.enableSharedAccess: false` to opt out).

## Local variant

**When to use**:

* The cluster where OpenBao itself is deployed (e.g. the core platform).
* The Kubernetes API is reached at the in-cluster default
  `https://kubernetes.default.svc.cluster.local`.
* No CA certificate or token-reviewer JWT override is needed — Vault uses the local
  cluster's service-account token and CA automatically.

**Usage example** (see [`projects/amiya.akn`](../../../projects/amiya.akn/src/infrastructure/pulumi/src/platform.ts)):

```typescript
import { ClusterVaultComponent } from "@chezmoi.sh/pulumi-cluster-vault";

new ClusterVaultComponent("amiya.akn", {
	name: "amiya.akn",
	// The component creates and names each policy itself — see additionalPolicies below.
	additionalPolicies: {
		monitoring: `path "amiya.akn/data/monitoring/*" { capabilities = ["read"] }`,
	},
});
```

## Remote variant

**When to use**:

* Clusters OpenBao reaches over an **untrusted** network path (Ingress, public
  endpoint), where Vault cannot use the in-cluster CA/JWT trust.
* You can supply the target cluster's CA certificate and a token-reviewer JWT.
* You want the option to disable shared access for an isolated cluster.

**Usage example** (see [`projects/lungmen.akn`](../../../projects/lungmen.akn/src/infrastructure/pulumi/src/platform.ts)):

```typescript
import { ClusterVaultComponent } from "@chezmoi.sh/pulumi-cluster-vault";
import { lungmenKubernetesCaCert, lungmenTokenReviewerJwt } from "./config";

new ClusterVaultComponent("lungmen.akn", {
	name: "lungmen.akn",
	additionalPolicies: {
		"mutualized-cnpg-databases": `
path "lungmen.akn/data/+/database/*" { capabilities = ["create", "read", "update", "delete"] }
path "lungmen.akn/metadata/+/database/*" { capabilities = ["create", "read", "update", "delete"] }
`,
	},
	remote: {
		host: "https://kubernetes.lungmen.akn.chezmoi.sh:6443",
		caCert: lungmenKubernetesCaCert,
		tokenReviewerJwt: lungmenTokenReviewerJwt,
		// enableSharedAccess: false, // optional — defaults to true
	},
});
```

> \[!WARNING]
> **This component does not fetch the CA certificate or reviewer JWT for you.** The
> calling stack MUST supply `remote.caCert` and `remote.tokenReviewerJwt` itself,
> because obtaining them already requires a Kubernetes provider configured for the
> target cluster.
>
> Source them from the target cluster's `external-secrets-system` namespace, from the
> Secret labelled `vault.crossplane.chezmoi.sh/cluster-name: <cluster-name>`:
>
> ```sh
> # 1. Find the reviewer Secret on the target cluster
> kubectl --context lungmen.akn -n external-secrets-system get secret \
>   -l vault.crossplane.chezmoi.sh/cluster-name=lungmen.akn -o name
>
> # 2. Load its CA and token into Pulumi config as secrets
> pulumi config set --secret lungmenKubernetesCaCert \
>   "$(kubectl --context lungmen.akn -n external-secrets-system get secret <reviewer-secret> \
>      -o jsonpath='{.data.ca\.crt}' | base64 -d)"
> pulumi config set --secret lungmenTokenReviewerJwt \
>   "$(kubectl --context lungmen.akn -n external-secrets-system get secret <reviewer-secret> \
>      -o jsonpath='{.data.token}' | base64 -d)"
> ```
>
> Set `remote.enableSharedAccess: false` to drop the `shared/third-parties` and
> `shared/certificates` read grants when a cluster should be fully isolated.

## Tailscaled variant

**When to use**:

* Clusters OpenBao reaches over the **tailnet** (Tailscale).
* The Kubernetes API is directly reachable, so only the host differs from the
  in-cluster default — no CA or reviewer-JWT override is required.

**Usage example** (illustrative — no live Tailscaled consumer stack exists yet):

```typescript
import { ClusterVaultComponent } from "@chezmoi.sh/pulumi-cluster-vault";

new ClusterVaultComponent("kazimierz.akn", {
	name: "kazimierz.akn",
	additionalPolicies: {
		monitoring: `path "kazimierz.akn/data/monitoring/*" { capabilities = ["read"] }`,
	},
	tailscaled: {
		host: "https://kubernetes.kazimierz.akn.ts.net:6443",
	},
});
```

> \[!IMPORTANT]
> **Network prerequisites**: the Kubernetes API server of the target cluster must be
> reachable from OpenBao's pod over the tailnet (e.g. via a Tailscale subnet route,
> Tailscale Funnel, or a Tailscale-side ingress). Tailscale carries **both** the
> network connectivity and the transport trust — this variant reuses the local CA/JWT
> authentication path, only overriding `kubernetesHost`, so no additional RBAC or
> Secret setup is needed beyond standard Tailscale configuration.

## Prerequisites

* **Node.js** and a package manager. The repository root is a **pnpm workspace**
  (`pnpm-workspace.yaml` + root `package.json`) for developer convenience, but
  **Pulumi's own runtime installs each stack's dependencies with plain `npm`**,
  scoped to that stack's directory — it never sees the workspace root. See
  [Installation](#installation) below for what that means in practice.
* **Pulumi CLI** — installed via `mise install` (see `.mise.toml`).
* **The [`@pulumi/vault`](https://www.pulumi.com/registry/packages/vault/) provider**,
  configured against OpenBao at `https://vault.chezmoi.sh`. Per-project stacks set
  `VAULT_ADDR` and authenticate via `mise run bao:login`.
* **A Garage S3 state backend** for `pulumi login`.

## Installation

This is a **self-contained, `private: true` package** — it is **not published to any registry**
and is **not added as an npm `workspace:*` dependency**. Consuming stacks depend on it
through the **`file:` protocol**, the only protocol that resolves identically whether
npm runs from the workspace root or in complete isolation inside a single stack
directory (which is how Pulumi's runtime installs dependencies). The full rationale
lives in [`catalog/pulumi/README.md`](../README.md).

Add it to the consuming stack's `package.json`:

```json
{
	"dependencies": {
		"@chezmoi.sh/pulumi-cluster-vault": "file:../../../../../catalog/pulumi/cluster-vault"
	}
}
```

Then import it **by package name** (not by relative path):

```typescript
import { ClusterVaultComponent } from "@chezmoi.sh/pulumi-cluster-vault";
```

Install from the repository root for editing/type-checking across the workspace:

```sh
pnpm install -r   # installs + links every package in the workspace
```

`pulumi up`/`pulumi preview` then run their own `npm install` scoped to each stack's
directory automatically — no per-stack install is needed by hand.

## Created Resources

For a cluster `<name>` with no `additionalPolicies`, the component registers five
resources, all parented to the `chezmoi:vault:ClusterVault` component. Each
`additionalPolicies` entry adds one more `vault.Policy`.

### Core

| Resource                                  | Path / Name        | Notes                                                                                       |
| ----------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `vault.Mount` (`vault:index/mount:Mount`) | `<name>/`          | KV v2 (`type: kv`, `options.version: 2`).                                                   |
| `vault.AuthBackend`                       | `<name>`           | Kubernetes auth method.                                                                     |
| `vault.kubernetes.AuthBackendConfig`      | *backend `<name>`* | `kubernetesHost` = remote / tailscaled / in-cluster default. Remote adds CA + reviewer JWT. |

### Policies

**`<name>-eso-policy`** (`vault.Policy`) — grants ESO `read` on:

* `<name>/*` — the cluster's own mount (always).
* `shared/+/third-parties/+/+/<name>` and `shared/+/third-parties/+/+/<name>/*` —
  this cluster's third-party credentials under the shared mount (when shared access is
  enabled; the `+/+` glob spans `{provider}/{service}` per
  [ADR-003](../../../docs/decisions/003-openbao-path-naming-conventions.md)).
* `shared/+/certificates/*` — shared certificates (when shared access is enabled).

This matches the **ESO – cluster** policy family in
[ADR-004](../../../docs/decisions/004-openbao-policy-naming-conventions.md).

**`<name>-<key>`** (`vault.Policy`, one per `additionalPolicies` entry) — the component
creates and names these itself from the caller-supplied policy document; the caller
never creates the `vault.Policy` resource directly.

`additionalPolicyNames` entries create no resource at all — they're plain strings
appended to `tokenPolicies` as-is, for policies another owner (e.g. Crossplane, during
a migration) deliberately keeps managing.

### Roles

**`<name>-eso-role`** (`vault.kubernetes.AuthBackendRole`):

* Bound to ServiceAccount `external-secrets` in namespace `external-secrets-system`.
* `tokenPolicies` = `<name>-eso-policy` plus every generated `additionalPolicies` policy
  plus every name in `additionalPolicyNames`.
* `tokenTtl: 900`, `tokenMaxTtl: 1800` (15-minute tokens, 30-minute max — aligns with
  ADR-004's ephemeral-token principle).

## API Reference

```typescript
export class ClusterVaultComponent extends pulumi.ComponentResource {
	constructor(
		name: string,
		args: ClusterVaultArgs,
		opts?: pulumi.ComponentResourceOptions,
	);
	readonly mountPath: pulumi.Output<string>;
	readonly authBackendPath: pulumi.Output<string>;
}
```

The component's Pulumi type token is `chezmoi:vault:ClusterVault`.

### `ClusterVaultArgs`

```typescript
export interface ClusterVaultArgs {
	/** Cluster name — used as the KV mount path and the auth backend path (e.g. "amiya.akn"). */
	name: string;
	/**
	 * Extra Vault policies to bind to the ESO role, alongside the generated ESO
	 * policy. Keyed by a short identifier; the component creates each as a
	 * `vault.Policy` named `<cluster>-<key>` — callers supply only the policy
	 * document, not the resource.
	 */
	additionalPolicies?: Record<string, pulumi.Input<string>>;
	/**
	 * Names of already-existing Vault policies to bind to the ESO role, alongside
	 * the generated ESO policy and `additionalPolicies`. Unlike `additionalPolicies`,
	 * the component does not create these — use this for policies another owner
	 * (e.g. Crossplane, during a migration) is deliberately keeping ownership of;
	 * the component only references the name.
	 */
	additionalPolicyNames?: pulumi.Input<string>[];
	/** Present for the Remote variant. Mutually exclusive with `tailscaled`. */
	remote?: RemoteClusterVaultConfig;
	/** Present for the Tailscaled variant. Mutually exclusive with `remote`. */
	tailscaled?: TailscaledClusterVaultConfig;
}
```

### `RemoteClusterVaultConfig`

```typescript
export interface RemoteClusterVaultConfig {
	host: pulumi.Input<string>;
	caCert: pulumi.Input<string>;
	tokenReviewerJwt: pulumi.Input<string>;
	/** Grants read access to shared/third-parties and shared/certificates paths. Defaults to true. */
	enableSharedAccess?: boolean;
}
```

### `TailscaledClusterVaultConfig`

```typescript
export interface TailscaledClusterVaultConfig {
	host: pulumi.Input<string>;
}
```

### Outputs

| Output            | Resolves to                                  |
| ----------------- | -------------------------------------------- |
| `mountPath`       | The KV mount path (`<name>`).                |
| `authBackendPath` | The Kubernetes auth backend path (`<name>`). |

## Testing

The package ships unit tests in
[`cluster-vault.test.ts`](./src/cluster-vault.test.ts) using **Mocha + Chai** with
`@pulumi/pulumi/runtime` mocks (`setMocks`) that capture every child resource the
component registers. The suite covers all three variants (Local, Remote with shared
access both on and off, Tailscaled), `additionalPolicies` merging into the role's
`tokenPolicies`, the component's two outputs, and the mutual-exclusion guard. Run it
from this directory — the `test` script is `mocha` (wired through `ts-node` via
[`.mocharc.json`](./.mocharc.json)), invokable as either:

```sh
npm test       # Pulumi's npm-scoped execution model
pnpm test      # inside the pnpm workspace
```

## References

* [ADR-003 — OpenBao Path Naming Conventions](../../../docs/decisions/003-openbao-path-naming-conventions.md)
* [ADR-004 — OpenBao Policy Naming and Scope Conventions](../../../docs/decisions/004-openbao-policy-naming-conventions.md)
* [`catalog/pulumi/README.md`](../README.md) — workspace / `file:` protocol rationale
* Live consumers: [`amiya.akn` (Local)](../../../projects/amiya.akn/src/infrastructure/pulumi/src/platform.ts), [`lungmen.akn` (Remote)](../../../projects/lungmen.akn/src/infrastructure/pulumi/src/platform.ts)

## License

This package is released under the Apache 2.0 license. For more information, see the
[LICENSE](../../../LICENSE) file.
