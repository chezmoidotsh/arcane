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
import * as pulumi from "@pulumi/pulumi";

import { types, LocalImage } from "@chezmoi.sh/core/docker";

// renovate: datasource=docker depName=alpine versioning=semver
export const Version = "3.19.1";
const shasum = "sha256:c5b1261d6d3e43071626931fc004f70149baeba2c8ec672bd4f27761f8e1ad6b";

/**
 * Alpine is a lightweight Linux distribution based on musl libc and BusyBox.
 */
export class Image extends LocalImage {
    constructor(name: string, args: types.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super(name, {
            ...{ tags: [`oci.chezmoi.sh/os/alpine:${Version}`] },
            ...args,

            // Build the image
            context: { location: __dirname },
            dockerfile: { location: path.join(__dirname, "Dockerfile") },
            buildArgs: {
                ALPN_VERSION: Version,
                ALPN_VERSION_SHASUM: shasum,
            },
        }, opts);
    }
}
