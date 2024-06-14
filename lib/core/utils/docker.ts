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

import * as crypto from 'crypto';
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";
import * as docker from "@pulumi/docker";
import * as buildx from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";

import * as asset_utils from "./asset";
import { types as docker_types } from "@chezmoi.sh/core/docker";

const busybox = "docker.io/library/busybox:stable@sha256:9ae97d36d26566ff84e8893c64a6dc4fe8ca6d1144bf5b87b2b85a32def253c7";

/**
 * Information about an asset to be injected into a Docker image.
 */
export interface ImageAsset {
    /**
     * Asset to be injected into the image.
     */
    source: FileAsset | RemoteAsset | StringAsset;

    /**
     * Path inside the image where the asset will be injected.
     */
    destination: string;

    /**
     * Optional chown configuration for the asset.
     */
    chown?: { user: string | number, group?: string | number };
}

/**
 * Add assets to a Docker image.
 *
 * @param {ImageAsset} image The image to add assets to.
 * @param {ImageAsset[]} assets The assets to add to the image.
 * @returns {buildx.Image} The new image with all assets injected into it.
 */
export function InjectAssets(image: docker_types.Image, ...assets: pulumi.Input<ImageAsset>[]): docker_types.Image {
    if (assets.length === 0) {
        return image;
    }

    return new buildx.Image(
        "embedded",
        {
            // Report all the same configuration as the original image
            builder: image.builder.apply(v => v ?? {}),
            buildOnPreview: image.buildOnPreview.apply(v => v ?? true),
            exec: image.exec.apply(v => v ?? false),
            exports: image.exports.apply(v => v ?? []),
            load: image.load.apply(v => v ?? false),
            network: image.network.apply(v => v ?? "default"),
            platforms: image.platforms.apply(v => v ?? []),
            pull: image.pull.apply(v => v ?? false),
            push: image.push,
            registries: image.registries.apply(v => v ?? []),
            ssh: image.ssh.apply(v => v ?? []),
            tags: image.tags.apply(v => v ?? []),

            // Always disable cache for this kind of build because it seems that the cache
            // is not working properly when using the `--mount=type=secret` flag.
            // I think that the docker context is not properly updated with secrets.
            noCache: true,

            // Create a temporary directory to store the assets during the build
            // NOTE: We need to use a temporary directory to avoid drift in the image if the content of the context.location
            //       changes. Using an unique empty directory will ensure that the context will always be empty.
            context: {
                location: image.urn.apply(urn => fs.promises.mkdtemp(path.join(os.tmpdir(), `pulumi-${crypto.createHash('md5').update(urn).digest('hex').substring(0, 8)}-`)))
            },

            // Generate a new Dockerfile (inline) that copies all assets into the image using
            // the `--mount=type=secret` flag.
            dockerfile: {
                inline: pulumi.all([...assets])
                    .apply(([...assets]) =>
                        pulumi.interpolate
                            `FROM ${busybox} as assets
${assets.map((asset, idx) =>
                                `RUN --mount=type=secret,id=asset${idx} mkdir -p ${path.dirname(asset.destination)} && cat /run/secrets/asset${idx} | base64 -d > ${asset.destination} && cp /run/secrets/asset${idx} /run/secrets/asset${idx}.base64`
                            ).join("\n")}

FROM ${image.ref}
${assets.map(asset => {
                                const chown = asset.chown ? `--chown=${asset.chown.user}${asset.chown.group ? `:${asset.chown.group}` : ""}` : "";
                                return `COPY --from=assets ${chown} ${asset.destination} ${asset.destination}`;
                            }).join("\n")}`
                    ),
            },

            // Read all assets and inject them as secrets during the build
            secrets: {
                ...pulumi.all([...assets])
                    .apply(([...assets]) =>
                        Promise.all(
                            assets.map(async asset => {
                                pulumi.log.debug(`Reading asset ${asset.source} to inject into the image`);
                                return asset_utils.
                                    ReadAsset(asset.source).
                                    then(s => s.toString("base64"))
                            })
                        ).then(assets => assets.reduce((acc, asset, idx) => {
                            // pulumi.log.warn(`Injecting asset ${idx} into the image: ${asset}`);
                            acc[`asset${idx}`] = pulumi.secret(asset);
                            return acc;
                        }, {} as Record<string, pulumi.Input<string>>))
                    ),
            },
        },
        {
            parent: image,
            ignoreChanges: ["context"]
        }
    );
}
