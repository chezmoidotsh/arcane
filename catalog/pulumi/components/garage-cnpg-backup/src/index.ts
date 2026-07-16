import * as garage from "@axnic/pulumi-garage";
import * as pulumi from "@pulumi/pulumi";

export interface GarageCloudNativePGObjectStoreArgs {
	/** Project name (e.g. "amiya.akn", "lungmen.akn"). */
	projectName: string;
	/** Optional Garage provider — pass one from a StackReference to target a remote cluster. */
	provider?: pulumi.ProviderResource;
}

/**
 * Creates a Garage S3 bucket with dedicated read/write credentials for
 * CloudNative-PG backup object stores.
 *
 * Only creates Garage resources (bucket, key, permissions). Secret placement
 * (Vault, SOPS, etc.) is the calling stack's decision — create a
 * vault.kv.SecretV2 alongside this component, parented to the component
 * instance, so both share the key's lifecycle.
 */
export class GarageCloudNativePGObjectStore extends pulumi.ComponentResource {
	public readonly accessKeyId: pulumi.Output<string>;
	public readonly secretAccessKey: pulumi.Output<string>;
	public readonly bucketName: pulumi.Output<string>;
	public readonly bucketId: pulumi.Output<string>;

	constructor(
		name: string,
		args: GarageCloudNativePGObjectStoreArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("chezmoi:garage:CloudNativePGObjectStore", name, {}, opts);
		const parent: pulumi.ResourceOptions = {
			parent: this,
			provider: args.provider,
		};

		const bucketName = `cnpg-${args.projectName.replace(/\./g, "-")}`;

		const bucket = new garage.Bucket(
			`${name}-bucket`,
			{
				globalAlias: bucketName,
			},
			parent,
		);

		const key = new garage.Key(
			`${name}-key`,
			{
				name: `cnpg-backup-${args.projectName}`,
			},
			parent,
		);

		new garage.BucketKeyPermission(
			`${name}-permission`,
			{
				accessKeyId: key.accessKeyId,
				bucketId: bucket.id,
				permissions: {
					read: true,
					write: true,
				},
			},
			parent,
		);

		this.accessKeyId = key.accessKeyId;
		this.secretAccessKey = key.secretAccessKey;
		this.bucketName = pulumi.output(bucketName);
		this.bucketId = bucket.id;
		this.registerOutputs({
			accessKeyId: this.accessKeyId,
			secretAccessKey: this.secretAccessKey,
			bucketName: this.bucketName,
			bucketId: this.bucketId,
		});
	}
}
