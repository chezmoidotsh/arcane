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
import fs from "fs";
import path from "path";
import tmp from "tmp";

import * as buildx from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { types as docker } from "@chezmoi.sh/core/docker";

import { SecretAsset } from "./asset";
import { generateDeterministicContext, resolveAsset } from "./docker.internal";
import { IsDefined } from "./type";

export const busybox =
    "docker.io/library/busybox:stable@sha256:9ae97d36d26566ff84e8893c64a6dc4fe8ca6d1144bf5b87b2b85a32def253c7";

/**
 * Information about an asset to be injected into a Docker image.
 */
export interface InjectableAsset {
    /**
     * Asset to be injected into the image.
     */
    source: FileAsset | RemoteAsset | StringAsset | SecretAsset<FileAsset | RemoteAsset | StringAsset>;

    /**
     * Path inside the image where the asset will be injected.
     */
    destination: string;

    /**
     * Optional `chmod` configuration for the asset.
     */
    mode?: fs.Mode;
}
export function IsInjectableAsset(asset: any): asset is InjectableAsset {
    return asset.source !== undefined && asset.destination !== undefined;
}

/**
 * Information about an asset to be injected into a Docker image with chown configuration.
 */
export interface InjectableChownableAsset extends InjectableAsset {
    /**
     * User to be used for the asset.
     */
    user: string | number;

    /**
     * Group to be used for the asset.
     */
    group?: string | number;
}
export function IsInjectableChownableAsset(asset: any): asset is InjectableChownableAsset {
    return asset.user !== undefined && IsInjectableAsset(asset);
}

type RequiredInjectableAssets = [pulumi.Input<InjectableAsset>, ...pulumi.Input<InjectableAsset>[]];
type RequiredInjectableChownableAssets = [
    pulumi.Input<InjectableChownableAsset>,
    ...pulumi.Input<InjectableChownableAsset>[],
];

/**
 * Add assets to a Docker image using root user and group.
 *
 * WARNING: This function can be slow because it relies on where the assets are stored (local, remote, etc).
 *          It is recommended to use this function only for small assets.
 *
 * @param {InjectableAsset} image The image to add assets to.
 * @param {InjectableAsset[]} assets The assets to add to the image.
 * @returns {docker.Image} The new image with all assets injected into it.
 */
export function InjectAssets(image: docker.Image, ...assets: RequiredInjectableAssets): docker.Image;

/**
 * Add assets to a Docker image using the specified user and group for each asset.
 *
 * WARNING: This function can be slow because it relies on where the assets are stored (local, remote, etc).
 *          It is recommended to use this function only for small assets.
 *
 * @param {InjectableAsset} image The image to add assets to.
 * @param {InjectableAsset[]} assets The assets to add to the image.
 * @returns {docker.Image} The new image with all assets injected into it.
 */
export function InjectAssets(image: docker.Image, ...assets: RequiredInjectableChownableAssets): docker.Image;

export function InjectAssets(
    image: docker.Image,
    ...assets: RequiredInjectableAssets | RequiredInjectableChownableAssets
): docker.Image {
    if (assets.length > 4096) {
        pulumi.log.warn(
            `Injecting a large number of assets (> 4096) can fail due to the maximum size of the GRPC request (4 Mio).`,
        );
    }

    return injectAssets(image, assets);
}

function injectAssets(
    image: docker.Image,
    assets: pulumi.Input<InjectableAsset | InjectableChownableAsset>[],
): docker.Image {
    // In order to avoid as much as possible the use of pulumi specific types, which are
    // a bit tedious to work with on spec.ts files, we will convert the assets to a list
    // of promises that will be easier to work with.
    const unpulumizedAssets = assets.map(
        (asset) =>
            new Promise((resolve: (value: InjectableAsset | InjectableChownableAsset) => void, reject) =>
                pulumi.output(asset).apply((v) => {
                    if (IsInjectableChownableAsset(v) || IsInjectableAsset(v)) {
                        resolve(v);
                    }
                    reject(new Error(`Unsupported asset type: ${JSON.stringify(v)} (${typeof v})`));
                }),
            ),
    );

    // Step 1: Create a temporary directory to store all assets that will be removed after the build.
    const tmpdir = tmp.dirSync({ keep: false, unsafeCleanup: true, mode: 0o700 });
    process.on("exit", () => tmpdir.removeCallback());

    // Step 2: Resolve all assets and store them somewhere.
    const promisedAssets = unpulumizedAssets.map((asset) => resolveAsset(tmpdir.name, asset));

    // Step 3: Generate a deterministic context for the build and link all assets to it.
    // NOTE: This step is necessary because if the context name changes, pulumi will try to
    //       rebuild the image. So using a deterministic checksum will prevent this from happening.
    const context = generateDeterministicContext(promisedAssets);

    // Step 4: Create a new image with the assets injected.
    const newImage = new buildx.Image(
        "embedded",
        {
            // Report all the same configuration as the original image
            builder: image.builder.apply((v) => v ?? {}),
            buildOnPreview: image.buildOnPreview.apply((v) => v ?? true),
            exec: image.exec.apply((v) => v ?? false),
            exports: image.exports.apply((v) => v ?? []),
            load: image.load.apply((v) => v ?? false),
            network: image.network.apply((v) => v ?? "default"),
            platforms: image.platforms.apply((v) => v ?? []),
            pull: image.pull.apply((v) => v ?? false),
            push: image.push,
            registries: image.registries.apply((v) => v ?? []),
            ssh: image.ssh.apply((v) => v ?? []),
            tags: image.tags.apply((v) => v ?? []),

            // Add information about injection to the image
            labels: pulumi.all([context, image.labels]).apply(([context, labels]) => {
                let idx: number;

                for (idx = 0; idx < 16; idx++) {
                    const ref = labels?.[`sh.chezmoi.injected.${idx}.hash`];
                    if (ref === undefined) {
                        break;
                    }
                }
                if (idx === 16) {
                    throw new Error("The maximum number of injection is reached (16).");
                }

                return {
                    ...labels,
                    [`sh.chezmoi.injected.${idx}.hash`]: context.hash,
                    [`sh.chezmoi.injected.${idx}.base.ref`]: image.ref,
                };
            }),

            // Always disable cache for this kind of build because it seems that the cache
            // is not working properly when using the `--mount=type=secret` flag.
            // I think that the docker context is not properly updated with secrets.
            noCache: true,

            context: {
                location: context.then((context) => context.contextdir),
            },
            dockerfile: {
                inline: pulumi.output(
                    context.then((context) => {
                        // COPY asset as secret when assets are sensitives.
                        const secrets = context.assets
                            .filter((asset) => asset.sensitive)
                            .map((asset, idx) =>
                                [
                                    `RUN mkdir -p ${path.dirname(path.join(context.contextdir, asset.destination))}`,
                                    `RUN --mount=type=secret,id=asset${idx} base64 -d /run/secrets/asset${idx} > ${path.join(
                                        context.contextdir,
                                        asset.destination,
                                    )}`,
                                ].join("\n"),
                            );

                        const instructions = context.assets
                            .map((asset) => {
                                const destination = path.join(context.contextdir, asset.destination);
                                const chmod = asset.mode ? `chmod ${asset.mode.toString(8)} ${destination}` : "";
                                return chmod ? `RUN ${chmod}` : "";
                            })
                            .filter((v) => v);

                        const areInjectedChownableAsset = (a: any): a is InjectableChownableAsset[] =>
                            a.every((v: any) => "user" in v);
                        if (areInjectedChownableAsset(assets)) {
                            instructions.push(
                                ...assets
                                    .map((asset) => {
                                        const destination = path.join(context.contextdir, asset.destination);
                                        const chown = `chown ${asset.user}${asset.group ? `:${asset.group}` : ""} ${destination}`;
                                        return chown ? `RUN ${chown}` : "";
                                    })
                                    .filter((v) => v),
                            );
                        }

                        return pulumi.interpolate`FROM ${busybox}
COPY --from=${image.ref} /etc/passwd /etc/group /etc/
COPY . ${context.contextdir}
${secrets.join("\n")}
${instructions.join("\n")}

FROM ${image.ref}
COPY --from=0 ${context.contextdir} /`;
                    }),
                ),
            },
            secrets: context.then((context) =>
                context.assets
                    .map((asset) => asset.sensitive)
                    .filter(IsDefined) // Filter out undefined values
                    .reduce(
                        (acc, buf, idx) => ({
                            ...acc,
                            [`asset${idx}`]: buf.toString("base64"),
                        }),
                        {},
                    ),
            ),
        },
        {
            parent: image,
        },
    );

    return newImage;
}
