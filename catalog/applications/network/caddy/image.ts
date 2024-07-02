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
import path from "path";

import * as pulumi from "@pulumi/pulumi";

import { LocalImage, types } from "@chezmoi.sh/core/docker";

import { Version } from "./version";

export { Version };

/**
 * The set of arguments for constructing the Caddy Docker image.
 */
export interface ImageArgs extends types.ImageArgs {
    /**
     * The error pages theme bundled with Caddy.
     * @see {@link https://github.com/tarampampam/error-pages} for more information.
     * @default "l7-light"
     */
    error_pages_theme?:
        | "app-down" // https://tarampampam.github.io/error-pages/app-down/400.html
        | "cats" // https://tarampampam.github.io/error-pages/cats/400.html
        | "connection" // https://tarampampam.github.io/error-pages/connection/400.html
        | "ghost" // https://tarampampam.github.io/error-pages/ghost/400.html
        | "hacker-terminal" // https://tarampampam.github.io/error-pages/hacker-terminal/400.html
        | "l7-dark" // https://tarampampam.github.io/error-pages/l7/400.html
        | "l7-light" // https://tarampampam.github.io/error-pages/l7/400.html
        | "lost-in-space" // https://tarampampam.github.io/error-pages/lost-in-space/400.html
        | "noise" // https://tarampampam.github.io/error-pages/noise/400.html
        | "orient" // https://tarampampam.github.io/error-pages/orient/400.html
        | "shuffle"; // https://tarampampam.github.io/error-pages/shuffle/400.html

    /**
     * The base image to use in order to build the Caddy image.
     * WARNING: The base image must be compatible a Alpine Linux image.
     */
    from: pulumi.Input<types.Image>;
}

/**
 * A Caddy Docker image baked by buildx -- Docker's interface to the improved
 * BuildKit backend.
 */
export class CaddyImage extends LocalImage {
    constructor(name: string, args: ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        const base = pulumi.output(args.from);

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
                ...args,

                // Build the image
                context: { location: __dirname },
                dockerfile: { location: path.join(__dirname, "Dockerfile") },
                buildArgs: {
                    ALPN_BASE: base.ref,
                    CADDY_VERSION: Version,
                    ERROR_PAGES_THEME: args.error_pages_theme ?? "connection",
                },
            },
            opts,
        );
    }
}
