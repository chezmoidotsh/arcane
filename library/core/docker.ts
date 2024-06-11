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
import * as docker from "@pulumi/docker-build";

/**
 * The arguments for building a Docker image.
 */
export namespace types {
    /**
     * The set of arguments for constructing a {@link DockerImage} resource. It extends the
     * standard {@link docker.ImageArgs} without the ability to overwrite
     * {@link docker.ImageArgs.buildArgs} and {@link docker.ImageArgs.dockerfile}.
     */
    export interface ImageArgs extends Omit<docker.ImageArgs, "buildArgs" | "dockerfile"> { };

    /**
     * ImageTransformation is a callback signature to modify a Docker image prior to its utilisation.
     *
     * @param {docker.Image} image The image to transform.
     * @returns {docker.Image} The transformed image. If undefined, the image will not be transformed.
     */
    export declare type ImageTransformation = (image: docker.Image) => docker.Image;
}

/**
 * DockerImage extends the standard {@link docker.Image} resource to provide some additional
 * things like setting the `org.opencontainers.image.created` label to the current date and time.
 */
export abstract class DockerImage extends docker.Image {
    constructor(name: string, args: docker.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
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
