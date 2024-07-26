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
import * as buildkit from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";

import { optsWithProvider } from "@pulumi.chezmoi.sh/core/pulumi";

export abstract class AlpineImage extends buildkit.Image {
    /**
     * Guard property to known the OS of the image.
     */
    public readonly os = "alpine";

    constructor(name: string, args: buildkit.ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super(name, args, optsWithProvider(buildkit.Provider, opts));
    }
}

/**
 * Type guard to check if an image is an Alpine image.
 * @param image image to check if it is an Alpine image.
 * @returns true if the image is an Alpine image, false otherwise.
 */
export function isAlpineImage(image: buildkit.Image): image is AlpineImage {
    return "os" in image && image.os === "alpine";
}
