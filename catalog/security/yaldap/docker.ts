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
import * as path from "path";

import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { LocalImage, types } from "@chezmoi.sh/core/docker";
import { InjectAssets, SecretAsset } from "@chezmoi.sh/core/utils";
import { InjectableChownableAsset } from "@chezmoi.sh/core/utils/docker";

import * as alpine from "@chezmoi.sh/catalog/os/alpine/3.19/docker";

// renovate: datasource=github-tags depName=chezmoi-sh/yaldap versioning=semver
export const Version = "v0.2.0";

/**
 * The arguments for building the yaLDAP Docker image.
 */
export interface ImageArgs extends types.ImageArgs {
    /**
     * The yaLDAP version to build.
     * @default "latest"
     */
    version?: string;

    /**
     * The base image to use in order to build the yaLDAP image.
     * WARNING: The base image must be compatible a Alpine Linux image.
     */
    baseImage?: pulumi.Input<types.Image>;
}

/**
 * This component builds the Docker image for the yaLDAP application.
 */
export class Image<T extends types.Image> extends LocalImage {
    constructor(name: string, args: ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        // Get the base image to use for building the yaLDAP image. If no base image is provided,
        // we will use the latest Alpine Linux image.
        const base = pulumi.output(
            args.baseImage || (new alpine.Image(`${name}:base`, args, { parent: opts?.parent }) as T),
        );
        const version = args.version ?? Version;

        super(
            name,
            {
                // Copy base image configuration options
                ...{
                    addHosts: base.addHosts.apply((v) => v ?? []),
                    builder: base.builder.apply((v) => v ?? {}),
                    buildOnPreview: base.buildOnPreview.apply((v) => v ?? true),
                    cacheFrom: base.cacheFrom.apply((v) => v ?? []),
                    cacheTo: base.cacheTo.apply((v) => v ?? []),
                    exec: base.exec.apply((v) => v ?? false),
                    exports: base.exports.apply((v) => v ?? []),
                    load: base.load.apply((v) => v ?? false),
                    network: base.network.apply((v) => v ?? "default"),
                    noCache: base.noCache.apply((v) => v ?? false),
                    platforms: base.platforms.apply((v) => v ?? []),
                    pull: base.pull.apply((v) => v ?? false),
                    push: base.push,
                    registries: base.registries.apply((v) => v ?? []),
                    ssh: base.ssh.apply((v) => v ?? []),
                    tags: base.tags.apply((v) => v ?? []),
                },

                // Default image options
                ...{
                    tags: [`oci.local.chezmoi.sh/security/yaldap:${version}`],
                },
                ...args,

                // Build the image
                context: { location: __dirname },
                dockerfile: { location: path.join(__dirname, "Dockerfile") },
                buildArgs: {
                    ALPN_BASE: base.ref,
                    YALDAP_VERSION: version,
                },
            },
            opts,
        );
    }
}

/**
 * The arguments for the yaLDAP application.
 * @see {@link Application}
 */
export interface ApplicationArgs {
    /**
     * yaLDAP YAML backend configuration file.
     */
    configuration: FileAsset | RemoteAsset | StringAsset | SecretAsset<FileAsset | RemoteAsset | StringAsset>;

    /**
     * The options for building the yaLDAP Docker image.
     */
    imageOpts?: ImageArgs & {
        /**
         * A function to transform the yaLDAP Docker image.
         */
        transformation?: types.ImageTransformation;
    };

    /**
     * The options for creating the Docker container.
     */
    containerOpts?: Omit<docker.ContainerArgs, "name" | "image">;
}

/**
 * This component deploys the yaLDAP application through a Docker container.
 */
export class Application extends pulumi.ComponentResource {
    /**
     * The Docker image for the yaLDAP application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The Docker container for the yaLDAP application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: ApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:security:yaldap:Application", name, {}, opts);

        const image = new Image(name, args?.imageOpts || { push: true }, { parent: this });
        const secret = {
            source: new SecretAsset(args.configuration),
            destination: "/etc/yaldap/backend.yaml",
            mode: 0o400,
            user: "yaldap",
        } as InjectableChownableAsset;

        let embedded = InjectAssets(image, secret);

        const transformation = args?.imageOpts?.transformation;
        if (transformation) {
            embedded = embedded.then(transformation);
        }

        this.image = pulumi.output(
            embedded.catch((err) => {
                pulumi.log.error(`Failed to build the bundled yaLDAP image: ${err}`);
            }),
        );
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    name: name,

                    // Security defaults
                    capabilities: { drops: ["ALL"] },
                    readOnlyRootFilesystem: true,
                    privileged: false,

                    // Resource defaults
                    memory: 64,
                    memorySwap: 64,

                    // Network defaults
                    ports: [{ protocol: "tcp", internal: 389, external: 389 }],
                },
                ...args,

                // Enforce some options
                image: this.image.ref,
                user: "yaldap",
                labels: pulumi
                    .all([args?.containerOpts?.labels, this.image.ref])
                    .apply(([labels, ref]) =>
                        (labels ?? []).concat([{ label: "org.opencontainers.image.source.ref", value: ref }]),
                    ),
            },
            {
                parent: this,
                // @pulumi/docker-build uses https://github.com/kreuzwerker/terraform-provider-docker
                // to interact with the Docker API. Unfortunately, the provider uses SHA256 hashes
                // as identifiers for images. Because of this and the fact that the image is built
                // using buildx, the SHA256 hash of the image is not always the one that will be
                // used by Docker. To avoid drift, we will ignore any changes on the image property
                // and recreate the container if the label "org.opencontainers.image.source.ref" changes.
                ignoreChanges: ["image"],
                dependsOn: this.image,
                replaceOnChanges: ['labels["org.opencontainers.image.source.ref"]'],
            },
        );
    }
}
