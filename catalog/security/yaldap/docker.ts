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

import { types, DockerImage } from "@chezmoi.sh/core/docker";
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
    baseImage?: pulumi.Input<docker_build.Image>;
}

/**
 * This component builds the Docker image for the yaLDAP application.
 */
export class Image extends DockerImage {
    constructor(name: string, args: ImageArgs & docker_build.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        // Get the base image to use for building the yaLDAP image. If no base image is provided,
        // we will use the latest Alpine Linux image.
        const base = pulumi.output(
            args.baseImage
            || new alpine.Image(`${name}:base`, args, { parent: opts?.parent })
        ).apply(image => ({ platforms: image.platforms, ref: image.ref }));

        super(name, {
            ...{
                // NOTE: if no platforms are provided, the image will be built using the 
                //       ones from the base image.
                platforms: base.platforms.apply(platforms => platforms || []),
                tags: [`oci.chezmoi.sh/security/yaldap:${Version}`]
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
export interface ApplicationArgs {
    /**
     * The options for building the yaLDAP Docker image.
     * @default {push: false, load: true}
     */
    imageOpts?: ImageArgs & {
        /**
         * A function to transform the yaLDAP Docker image.
         */
        transformation?: types.ImageTransformation;
    }

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
    public readonly image: Image;

    /**
     * The Docker container for the yaLDAP application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args?: ApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:security:yaldap:Application", name, {}, opts);

        const image = new Image(name, args?.imageOpts || { push: false, load: true }, { parent: this });
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