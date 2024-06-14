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
import * as docker_build from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";

import { types, LocalImage } from "@chezmoi.sh/core/docker";
import * as alpine from "@chezmoi.sh/catalog/os/alpine/3.19/docker";

// renovate: datasource=github-tags depName=chezmoi-sh/yaldap versioning=semver
export const Version = "v0.2.0";


/**
 * The arguments for building the yaLDAP Docker image.
 */
export interface ImageArgs<T extends types.Image> extends types.ImageArgs {
    /**
     * The yaLDAP version to build.
     * @default "latest"
     */
    version?: string;

    /**
     * The base image to use in order to build the yaLDAP image.
     * WARNING: The base image must be compatible a Alpine Linux image.
     */
    baseImage?: pulumi.Input<T>;
}

/**
 * This component builds the Docker image for the yaLDAP application.
 */
export class Image<T extends types.Image> extends LocalImage {
    constructor(name: string, args: ImageArgs<T> & docker_build.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        // Get the base image to use for building the yaLDAP image. If no base image is provided,
        // we will use the latest Alpine Linux image.
        const base = pulumi.output(
            args.baseImage
            || new alpine.Image(`${name}:base`, args, { parent: opts?.parent }) as T
        );

        super(name, {
            // Copy base image configuration options
            ...{
                addHosts: base.addHosts.apply(v => v ?? []),
                builder: base.builder.apply(v => v ?? {}),
                buildOnPreview: base.buildOnPreview.apply(v => v ?? true),
                cacheFrom: base.cacheFrom.apply(v => v ?? []),
                cacheTo: base.cacheTo.apply(v => v ?? []),
                exec: base.exec.apply(v => v ?? false),
                exports: base.exports.apply(v => v ?? []),
                load: base.load.apply(v => v ?? false),
                network: base.network.apply(v => v ?? "default"),
                noCache: base.noCache.apply(v => v ?? false),
                platforms: base.platforms.apply(v => v ?? []),
                pull: base.pull.apply(v => v ?? false),
                push: base.push,
                registries: base.registries.apply(v => v ?? []),
                ssh: base.ssh.apply(v => v ?? []),
                tags: base.tags.apply(v => v ?? []),
            },

            // Default image options
            ...{
                tags: [`oci.chezmoi.sh/security/yaldap:${Version}`],
            },
            ...args,

            // Build the image
            context: { location: __dirname },
            dockerfile: { location: path.join(__dirname, "Dockerfile") },
            buildArgs: {
                ...args.buildArgs,
                ALPN_BASE: base.ref,
                YALDAP_VERSION: Version,
            },
        }, opts);
    }
}

/**
 * The arguments for the yaLDAP application.
 * @see {@link Application}
 */
export interface ApplicationArgs<T extends types.Image, U extends types.Image>{
    /**
     * The options for building the yaLDAP Docker image.
     * @default {push: false, load: true}
     */
    imageOpts?: ImageArgs<T> & {
        /**
         * A function to transform the yaLDAP Docker image.
         */
        transformation?: types.ImageTransformation<T, U>;
    }

    /**
     * The options for creating the Docker container.
     */
    containerOpts?: Omit<docker.ContainerArgs, "name" | "image">;
}

/**
 * This component deploys the yaLDAP application through a Docker container.
 */
export class Application<T extends types.Image, U extends types.Image = T> extends pulumi.ComponentResource {
    /**
     * The Docker image for the yaLDAP application.
     */
    public readonly image: types.Image;

    /**
     * The Docker container for the yaLDAP application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args?: ApplicationArgs<T, U>, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:security:yaldap:Application", name, {}, opts);

        const image = new Image(name, args?.imageOpts || { push: false, load: true }, { parent: this }) as T;
        this.image = args?.imageOpts?.transformation?.(image) ?? image;

        this.container = new docker.Container(name,
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
                },
                ...args,

                // Enforce some options
                image: this.image.ref,
                user: "yaldap",
                labels: pulumi.
                    all([args?.containerOpts?.labels, this.image.ref]).
                    apply(([labels, ref]) => (labels ?? []).concat([{ label: "org.opencontainers.image.source.ref", value: ref }]))
            },
            {
                parent: this,
                // Because @pulumi/docker-build generates multi-platform images, image.ref
                // will be the SHA256 digest of the image manifest. This means that the
                // container will be recreated every time due to the drift between the
                // manifest digest and the real used image digest. To avoid this, we ignore
                // changes to the image property and manually update the container when the
                // image changes.
                ignoreChanges: ["image"],
                dependsOn: this.image,
                replaceOnChanges: ['labels["org.opencontainers.image.source.ref"]'],
            }
        );
    }
}