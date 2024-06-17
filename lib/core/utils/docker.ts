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

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tmp from "tmp";

import * as asset from "@pulumi/pulumi/asset";
import * as buildx from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";

import * as asset_utils from "./asset";
import { types as docker_types } from "@chezmoi.sh/core/docker";

const busybox =
    "docker.io/library/busybox:stable@sha256:9ae97d36d26566ff84e8893c64a6dc4fe8ca6d1144bf5b87b2b85a32def253c7";

/**
 * Information about an asset to be injected into a Docker image.
 */
export interface InjectedAsset {
    /**
     * Asset to be injected into the image.
     */
    source:
        | asset.FileAsset
        | asset.RemoteAsset
        | asset.StringAsset
        | SecretAsset<asset.FileAsset | asset.RemoteAsset | asset.StringAsset>;

    /**
     * Path inside the image where the asset will be injected.
     */
    destination: string;

    /**
     * Optional `chmod` configuration for the asset.
     */
    chmod?: fs.Mode;
}

/**
 * Information about an asset to be injected into a Docker image with chown configuration.
 */
export interface InjectedChownableAsset extends InjectedAsset {
    /**
     * `chown` configuration for the asset.
     */
    chown: { user: string | number; group?: string | number };
}

/**
 * Add assets to a Docker image using root user and group.
 *
 * WARNING: This function can be slow because it relies on where the assets are stored (local, remote, etc).
 *             It is recommended to use this function only for small assets.
 *
 * @param {InjectedAsset} image The image to add assets to.
 * @param {InjectedAsset[]} assets The assets to add to the image.
 * @returns {docker_types.Image} The new image with all assets injected into it.
 */
export function InjectAssets(image: docker_types.Image, ...assets: pulumi.Input<InjectedAsset>[]): docker_types.Image;

/**
 * Add assets to a Docker image using the specified user and group for each asset.
 *
 * WARNING: This function can be slow because it relies on where the assets are stored (local, remote, etc).
 *             It is recommended to use this function only for small assets.
 *
 * @param {InjectedAsset} image The image to add assets to.
 * @param {InjectedAsset[]} assets The assets to add to the image.
 * @returns {docker_types.Image} The new image with all assets injected into it.
 */
export function InjectAssets(
    image: docker_types.Image,
    ...assets: pulumi.Input<InjectedChownableAsset>[]
): docker_types.Image;

export function InjectAssets(
    image: docker_types.Image,
    ...assets: pulumi.Input<InjectedAsset>[] | pulumi.Input<InjectedChownableAsset>[]
): docker_types.Image {
    if (assets.length === 0) {
        return image;
    }
    if (assets.length > 4096) {
        pulumi.log.warn(
            `Injecting a large number of assets (> 4096) can fail due to the maximum size of the GRPC request (4 Mio).`,
        );
    }

    return injectAssets(image, assets);
}

function injectAssets(
    image: docker_types.Image,
    assets: pulumi.Input<InjectedAsset | InjectedChownableAsset>[],
): docker_types.Image {
    // Step 1: Create a temporary directory to store all assets that will be removed after the build.
    const tmpdir = tmp.dirSync({ keep: false, unsafeCleanup: true, mode: 0o700 });
    process.on("exit", () => tmpdir.removeCallback());

    // Step 2: Copy all assets to the temporary directory.
    // NOTE: All file will be stored inside the temporary directory with their digest as name.
    const promisedAssets = pulumi.output(assets).apply((assets) =>
        assets.map(async (asset) => {
            let { source, ...rest } = asset;
            let sensitive: boolean = false;

            if (isSecretAsset(source)) {
                sensitive = true;
                source = source.asset;
            }

            if (asset_utils.IsFileAsset(source)) {
                pulumi.log.debug(`InjectAssets<FileAsset>: Copy ${await source.path}`);

                const src = await Promise.resolve(source.path);
                const hash = await new Promise<string>((resolve, reject) => {
                    const hash = crypto.createHash("sha256");
                    const stream = fs.createReadStream(src);

                    stream.on("data", (data) => hash.update(data));
                    stream.on("end", () => resolve(hash.digest("hex")));
                    stream.on("error", reject);
                });

                const target = path.join(tmpdir.name, hash);
                if (sensitive) {
                    // NOTE: The file has been read twice (hash and here), but I prefer to keep
                    //       the code simple than to optimize it for now.
                    const pbuff = fs.promises.readFile(src, { encoding: null }) as Promise<Buffer>;
                    return { source: target, sensitive: pbuff, ...rest };
                }

                fs.copyFileSync(src, target);
                return { source: target, sensitive: undefined, ...rest };
            } else if (asset_utils.IsRemoteAsset(source) || asset_utils.IsStringAsset(source)) {
                if (asset_utils.IsRemoteAsset(source)) {
                    pulumi.log.debug(`InjectAssets<RemoteAsset>: Download ${await source.uri}`);
                } else {
                    pulumi.log.debug(`InjectAssets<StringAsset>: Write content`);
                }

                const buf = asset_utils.ReadAsset(source);
                const hash = crypto
                    .createHash("sha256")
                    .update(await buf)
                    .digest("hex");

                const target = path.join(tmpdir.name, hash);
                if (sensitive) {
                    return { source: target, sensitive: buf, ...rest };
                }

                fs.writeFileSync(target, await buf);
                return { source: target, sensitive: undefined, ...rest };
            } else {
                throw new Error(`Unsupported asset type: ${JSON.stringify(source)} (${typeof source})`);
            }
        }),
    );

    // Step 3: Generate a deterministic context for the build and link all assets to it.
    // NOTE: This step is necessary because if the context name changes, pulumi will try to
    //       rebuild the image. So using a deterministic checksum will prevent this from happening.
    const context = promisedAssets.apply(async (preparedAsset) => {
        const assets = await Promise.all(preparedAsset);

        // Generate a checksum for all assets (a sort of "context" checksum).
        const hash = crypto.createHash("sha256");
        for (const asset of assets) {
            hash.update(path.basename(asset.source));
        }

        // Create the final context directory
        // NOTE: The final context directory will be removed after the build.
        const stackId = crypto
            .createHash("sha256")
            .update(pulumi.runtime.getOrganization())
            .update(pulumi.runtime.getProject())
            .update(pulumi.runtime.getStack())
            .digest("base64")
            .substring(0, 8);

        const contextdir = path.join(
            os.tmpdir(),
            // In order to avoid long paths, we use a shorter hash and use base64 encoding instead
            // of hex for more entropy (64^8 vs 16^8)
            `pulumi-${stackId}-${hash.digest("base64").substring(0, 8)}`,
        );
        fs.mkdirSync(contextdir, { recursive: true });
        process.on("exit", () => fs.rmdirSync(contextdir, { recursive: true }));

        // Link all assets to the context directory.
        for (const asset of assets) {
            if (asset.sensitive) {
                continue;
            }

            const target = path.join(contextdir, asset.destination);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.rmSync(target, { force: true, recursive: false });
            fs.linkSync(asset.source, target);
            asset.source = target;
        }
        return { contextdir, assets };
    });

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

            // Always disable cache for this kind of build because it seems that the cache
            // is not working properly when using the `--mount=type=secret` flag.
            // I think that the docker context is not properly updated with secrets.
            noCache: true,

            context: {
                location: context.apply((context) => context.contextdir),
            },
            dockerfile: {
                inline: context.apply((context) => {
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
                            const chmod = asset.chmod ? `chmod ${asset.chmod} ${destination}` : "";
                            return chmod ? `RUN ${chmod}` : "";
                        })
                        .filter((v) => v);

                    const areInjectedChownableAsset = (a: any): a is InjectedChownableAsset[] =>
                        a.every((v: any) => "chown" in v);
                    if (areInjectedChownableAsset(assets)) {
                        instructions.push(
                            ...assets.map((asset) => {
                                const destination = path.join(context.contextdir, asset.destination);
                                const chown = asset.chown
                                    ? `chown ${asset.chown.user}${
                                          asset.chown.group ? `:${asset.chown.group}` : ""
                                      } ${destination}`
                                    : "";
                                return chown ? `RUN ${chown}` : "";
                            }),
                        );
                    }

                    return pulumi.interpolate`
FROM ${busybox}
COPY --from=${image.ref} /etc/passwd /etc/group /etc/
COPY . ${context.contextdir}
${secrets.join("\n")}
${instructions.join("\n")}

FROM ${image.ref}
COPY --from=0 ${context.contextdir} /
`;
                }),
            },
            secrets: context.apply((context) =>
                context.assets
                    .map((asset) => asset.sensitive)
                    .filter(<T>(a: T | undefined): a is T => a !== undefined) // Filter out undefined values
                    .reduce(
                        async (acc, buff, idx) => ({
                            ...acc,
                            [`asset${idx}`]: pulumi.secret((await buff).toString("base64")),
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

/**
 * Create an asset that should be mounted as a secret during a Docker build.
 */
export class SecretAsset<T extends asset.Asset> {
    /**
     * Create a new SecretAsset wrapping the given asset.
     * @param asset Asset to be mounted as a secret.
     */
    constructor(public readonly asset: T) {}
}

/**
 * Type guard function to check if an object is a SecretAsset.
 * @param asset Object to check if it is a SecretAsset.
 * @returns true if the object is a SecretAsset, false otherwise.
 */
function isSecretAsset<T extends asset.Asset>(asset: any): asset is SecretAsset<T> {
    return "asset" in asset;
}
