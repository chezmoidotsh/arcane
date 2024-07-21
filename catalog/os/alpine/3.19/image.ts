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

import * as buildkit from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";

import { getProvider } from "@chezmoi.sh/core/utils";

import { Version } from "./version";

export { Version };

/**
 * Alpine is a lightweight Linux distribution based on musl libc and BusyBox.
 */
export class AlpineImage extends buildkit.Image {
    constructor(name: string, args: buildkit.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super(
            name,
            {
                ...args,

                // Build the image
                context: { location: __dirname },
                dockerfile: { location: path.join(__dirname, "Dockerfile") },
            },
            { ...opts, ...{ provider: getProvider(buildkit.Provider, opts), providers: undefined } },
        );
    }
}
