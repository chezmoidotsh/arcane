/*
 * Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */

import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import * as buildx from "@pulumi/docker-build";

/**
 * The arguments for building a Docker image.
 */
export namespace types {
    /**
     * The set of arguments for constructing a {@link Image} resource. It extends the
     * standard {@link buildx.ImageArgs} without the ability to overwrite
     * {@link buildx.ImageArgs.buildArgs} and {@link buildx.ImageArgs.dockerfile}.
     */
    export interface ImageArgs extends Omit<buildx.ImageArgs, "buildArgs" | "dockerfile"> { };

    /**
     * ImageTransformation is a callback signature to modify a Docker image prior to its utilisation.
     *
     * @param {docker.Image} image The image to transform.
     * @returns {docker.Image} The transformed image. If undefined, the image will not be transformed.
     */
    export declare type ImageTransformation<T extends types.Image, U extends types.Image> = (image: T) => U;

    /**
     * Image describes a Docker image based on the standard {@link buildx.Image} resource.
     */
    export declare type Image = buildx.Image;
}

/**
 * DockerImage extends the standard {@link buildx.Image} resource to provide some additional
 * things like setting the `org.opencontainers.image.created` label to the current date and time.
 */
export abstract class LocalImage extends buildx.Image {
    constructor(name: string, args: buildx.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super(
            name,
            {
                ...args,

                // Enhance some user-provided information
                labels: {
                    ...args.labels,
                    // WARN: because ignoreChanges cannot be used on these key, all labels will be ignored to avoid drift
                    "org.opencontainers.image.created": new Date().toISOString()
                },
            },
            {
                ...opts,

                // NOTE:
                //   - `context` is ignored to avoid drift if we build the image in a different location
                //   - `labels` is ignored to avoid drift due to the `org.opencontainers.image.created` label
                ignoreChanges: (opts?.ignoreChanges || []).concat(["context", "labels"]),
            }
        );
    }
}

/**
 * The set of arguments for constructing a RemoteImage resource.
 */
export type RemoteImageArgs = Omit<docker.RemoteImageArgs, "build" | "forceRemove" | "pullTriggers">;
/**
 * Pulls a Docker image to a given Docker host from a Docker Registry.
 * This resource will *not* pull new layers of the image automatically unless used in conjunction with 
 * docker.RegistryImage data source to update the `pullTriggers` field.
 * 
 * NOTE: This resource is a wrapper around the {@link docker.RemoteImage} resource from the `@pulumi/docker` package
 *       to implement the {@link types.Image} interface. For this reason, it does provide undefined values for
 *       fields required generally by the {@link types.Image} interface but cannot be set on a remote image.
 *       The single exception is the `push` field which is set to `true` by default.
 */
export class RemoteImage extends pulumi.ComponentResource implements types.Image {
    public readonly addHosts: pulumi.Output<string[] | undefined> = pulumi.output<pulumi.Output<string[] | undefined>>(undefined);
    public readonly buildArgs: pulumi.Output<{ [key: string]: string; } | undefined> = pulumi.output<pulumi.Output<{ [key: string]: string; } | undefined>>(undefined);
    public readonly buildOnPreview: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly builder: pulumi.Output<buildx.types.output.BuilderConfig | undefined> = pulumi.output<buildx.types.output.BuilderConfig | undefined>(undefined);
    public readonly cacheFrom: pulumi.Output<buildx.types.output.CacheFrom[] | undefined> = pulumi.output<buildx.types.output.CacheFrom[] | undefined>(undefined);
    public readonly cacheTo: pulumi.Output<buildx.types.output.CacheTo[] | undefined> = pulumi.output<buildx.types.output.CacheTo[] | undefined>(undefined);
    public readonly context: pulumi.Output<buildx.types.output.BuildContext | undefined> = pulumi.output<buildx.types.output.BuildContext | undefined>(undefined);
    public readonly contextHash: pulumi.Output<string> = pulumi.output("");
    public readonly dockerfile: pulumi.Output<buildx.types.output.Dockerfile | undefined> = pulumi.output<buildx.types.output.Dockerfile | undefined>(undefined);
    public readonly exec: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly exports: pulumi.Output<buildx.types.output.Export[] | undefined> = pulumi.output<buildx.types.output.Export[] | undefined>(undefined);
    public readonly labels: pulumi.Output<{ [key: string]: string; } | undefined> = pulumi.output<{ [key: string]: string; } | undefined>(undefined);
    public readonly load: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly network: pulumi.Output<buildx.NetworkMode | undefined> = pulumi.output<buildx.NetworkMode | undefined>(undefined);
    public readonly noCache: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly pull: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly push: pulumi.OutputInstance<boolean> = pulumi.output<boolean>(true);
    public readonly registries: pulumi.Output<buildx.types.output.Registry[] | undefined> = pulumi.output<buildx.types.output.Registry[] | undefined>(undefined);
    public readonly secrets: pulumi.Output<{ [key: string]: string; } | undefined> = pulumi.output<{ [key: string]: string; } | undefined>(undefined);
    public readonly ssh: pulumi.Output<buildx.types.output.SSH[] | undefined> = pulumi.output<buildx.types.output.SSH[] | undefined>(undefined);
    public readonly tags: pulumi.Output<string[] | undefined> = pulumi.output<string[] | undefined>(undefined);
    public readonly target: pulumi.Output<string | undefined> = pulumi.output<string | undefined>(undefined);

    public readonly platforms: pulumi.Output<buildx.Platform[] | undefined>;
    public readonly digest: pulumi.Output<string>;
    public readonly id: pulumi.Output<string>;
    public readonly ref: pulumi.Output<string>;

    constructor(name: string, args: RemoteImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:docker:RemoteImage", name, opts);

        const image = new docker.RemoteImage(name, args, { parent: this });
        this.digest = image.repoDigest.apply(v => v?.split("@").pop() ?? "");
        this.id = image.imageId;
        this.platforms = image.platform.apply(v => v ? [buildx.Platform[v as keyof typeof buildx.Platform]] : []);
        this.ref = image.repoDigest;
    }
}
