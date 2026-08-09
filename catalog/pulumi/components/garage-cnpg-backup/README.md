# `@chezmoi.sh/pulumi-garage-cnpg-backup`

A Pulumi `ComponentResource` (`chezmoi:garage:CloudNativePGObjectStore`) that creates a **Garage S3 bucket** with a
dedicated **read/write access key** for CloudNative-PG backup object stores. One component call provisions everything
CNPG needs to ship WAL archives and base backups to S3-compatible storage — the bucket itself, a scoped key pair, and
the permissions binding them.

## Why a component

Every cluster that runs CloudNative-PG needs the same three Garage resources: a bucket (named after the cluster), a key
with read/write access to that bucket only, and the permission linking them. Centralizing that here means every consumer
stack gets it in one call instead of repeating the bucket-naming convention and permission wiring by hand.

## Bucket naming

The bucket name is always `cnpg-<cluster>` with dots replaced by hyphens (e.g. `amiya.akn` → `cnpg-amiya-akn`). It is
**not configurable** — the naming convention is fixed so backup paths are predictable across all clusters.

## This component only creates Garage resources

It has no opinion on where the credentials end up — that's the calling stack's decision. Most clusters push them to
Vault so External Secrets Operator can sync them into Kubernetes as a `Secret` for CNPG to consume. The core platform
cluster (rhodes.akn) can't use Vault for its own backup credentials (chicken-and-egg), so it writes a Kubernetes
`Secret` directly instead.

## Usage

```typescript
import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";

const backup = new GarageCloudNativePGObjectStore("garage-cnpg-backup", {
  projectName: "lungmen.akn",
});
```

The only required argument is `projectName`. The bucket name, key name, and permissions are all derived from it.

### With a Vault secret (typical — clusters that already have Vault access)

Pair the component with a `vault.kv.SecretV2` parented to the component instance itself, so the secret and the bucket
share one lifecycle:

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";

const backup = new GarageCloudNativePGObjectStore("garage-cnpg-backup", {
  projectName: "lungmen.akn",
});

new vault.kv.SecretV2(
  "garage-cnpg-backup-credentials",
  {
    mount: "lungmen.akn",
    name: "cloudnative-pg/objectstore/s3.chezmoi.sh",
    dataJson: pulumi.jsonStringify({
      access_key_id: backup.accessKeyId,
      access_secret_key: backup.secretAccessKey,
      region: "fr-par-1",
      endpoint_url: "https://s3.chezmoi.sh",
    }),
    customMetadata: {
      data: {
        description: "Garage S3 credentials for CNPG backup object store",
        application: "cloudnative-pg",
      },
    },
  },
  { parent: backup },
);
```

CNPG picks these up via an `ExternalSecret` referencing the Vault path — no `Secret` resource is created by this
component.

### Without Vault (core platform — direct Kubernetes Secret)

```typescript
import * as k8s from "@pulumi/kubernetes";
import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";

const backup = new GarageCloudNativePGObjectStore("garage-cnpg-backup", {
  projectName: "rhodes.akn",
});

new k8s.core.v1.Secret(
  "cnpg-backup-credentials",
  {
    metadata: { name: "cnpg-backup-credentials", namespace: "vault" },
    type: "Opaque",
    stringData: {
      access_key_id: backup.accessKeyId,
      access_secret_key: backup.secretAccessKey,
      endpoint_url: "https://s3.chezmoi.sh",
      region: "fr-par-1",
    },
  },
  { parent: backup },
);
```

The Secret is written straight into the cluster via the Kubernetes provider — no SOPS, no recovery-mode gating — since
rhodes.akn hosts Vault itself and can't depend on it for its own backup credentials (chicken-and-egg).

## Installation

Add it to the consuming stack's `package.json` as a workspace dependency:

```json
{
  "dependencies": {
    "@chezmoi.sh/pulumi-garage-cnpg-backup": "workspace:*"
  }
}
```

Then import it **by package name** (not by relative path):

```typescript
import { GarageCloudNativePGObjectStore } from "@chezmoi.sh/pulumi-garage-cnpg-backup";
```

Install from the repository root for editing/type-checking across the workspace:

```sh
pnpm install -r
```

## Created Resources

Three Garage resources, all parented to the `chezmoi:garage:CloudNativePGObjectStore` component:

| Resource                     | Name pattern    | Purpose                                      |
| ---------------------------- | --------------- | -------------------------------------------- |
| `garage.Bucket`              | `<name>-bucket` | S3 bucket with global alias `cnpg-<cluster>` |
| `garage.Key`                 | `<name>-key`    | Access key pair (`cnpg-backup-<cluster>`)    |
| `garage.BucketKeyPermission` | `<name>-perm`   | Grants the key read+write on the bucket      |

## API Reference

```typescript
export class GarageCloudNativePGObjectStore extends pulumi.ComponentResource {
  constructor(name: string, args: GarageCloudNativePGObjectStoreArgs, opts?: pulumi.ComponentResourceOptions);
  readonly accessKeyId: pulumi.Output<string>;
  readonly secretAccessKey: pulumi.Output<string>;
  readonly bucketName: pulumi.Output<string>;
  readonly bucketId: pulumi.Output<string>;
}
```

The component's Pulumi type token is `chezmoi:garage:CloudNativePGObjectStore`.

### `GarageCloudNativePGObjectStoreArgs`

```typescript
export interface GarageCloudNativePGObjectStoreArgs {
  /** Project name used to derive the bucket name (e.g. "amiya.akn" → "cnpg-amiya-akn"). */
  projectName: string;
}
```

### Outputs

| Output            | Resolves to                                   |
| ----------------- | --------------------------------------------- |
| `accessKeyId`     | The Garage access key ID (S3-compatible).     |
| `secretAccessKey` | The Garage secret access key.                 |
| `bucketName`      | The bucket's global alias (`cnpg-<cluster>`). |
| `bucketId`        | The bucket's internal Garage ID.              |

## References

- Live consumers: [`rhodes.akn`](../../../projects/rhodes.akn/src/infrastructure/pulumi/stack/cloudnative-pg.ts) (direct
  Secret), [`lungmen.akn`](../../../projects/lungmen.akn/src/infrastructure/pulumi/stack/cloudnative-pg.ts) (Vault
  secret)

## License

This package is released under the Apache 2.0 license. For more information, see the [LICENSE](../../../../LICENSE)
file.
