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
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import tmp from "tmp";

import * as buildx from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { types as docker } from "@chezmoi.sh/core/docker";

import { IsFileAsset, IsRemoteAsset, IsSecretAsset, IsStringAsset, ReadAsset, SecretAsset } from "./asset";
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

/**
 * Additional options for injecting assets into a Docker image.
 */
export interface InjectAssetsOpts {
    /**
     * Suffix to append to the image tags after injecting assets. Use this option to avoid
     * overwriting the original image.
     * The placeholder `{idx}` will be replaced by the index of the injection.
     * @default "-injected.{idx}"
     */
    suffix?: string;
}

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
export async function InjectAssets(image: docker.Image, ...assets: InjectableAsset[]): Promise<docker.Image>;

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
export async function InjectAssets(image: docker.Image, ...assets: InjectableChownableAsset[]): Promise<docker.Image>;

export async function InjectAssets(
    image: docker.Image,
    ...assets: (InjectableAsset | InjectableChownableAsset)[]
): Promise<docker.Image> {
    return InjectAssetsWithOptions(image, {}, ...assets);
}

/**
 * Add assets to a Docker image using root user and group.
 *
 * WARNING: This function can be slow because it relies on where the assets are stored (local, remote, etc).
 *          It is recommended to use this function only for small assets.
 *
 * @param {InjectableAsset} image The image to add assets to.
 * @param {InjectAssetsOpts} opts Additional options for injecting assets.
 * @param {InjectableAsset[]} assets The assets to add to the image.
 * @returns {docker.Image} The new image with all assets injected into it.
 */
export async function InjectAssetsWithOptions(
    image: docker.Image,
    opts: InjectAssetsOpts,
    ...assets: InjectableAsset[]
): Promise<docker.Image>;

/**
 * Add assets to a Docker image using the specified user and group for each asset.
 *
 * WARNING: This function can be slow because it relies on where the assets are stored (local, remote, etc).
 *          It is recommended to use this function only for small assets.
 *
 * @param {InjectableAsset} image The image to add assets to.
 * @param {InjectAssetsOpts} opts Additional options for injecting assets.
 * @param {InjectableAsset[]} assets The assets to add to the image.
 * @returns {docker.Image} The new image with all assets injected into it.
 */
export async function InjectAssetsWithOptions(
    image: docker.Image,
    opts: InjectAssetsOpts,
    ...assets: InjectableChownableAsset[]
): Promise<docker.Image>;

export async function InjectAssetsWithOptions(
    image: docker.Image,
    opts: InjectAssetsOpts,
    ...assets: (InjectableAsset | InjectableChownableAsset)[]
): Promise<docker.Image> {
    if (assets.length === 0) {
        pulumi.log.warn(`No assets provided to inject into the Docker image; the image will be unchanged.`);
        return image;
    }

    if (assets.length > 4096) {
        pulumi.log.warn(
            `Injecting a large number of assets (> 4096) can fail due to the maximum size of the GRPC request (4 Mio).`,
        );
    }

    return injectAssets(
        image,
        {
            suffix: opts?.suffix ?? "-injected.{idx}",
        },
        assets,
    );
}

const __contextDirToCleanup: string[] = [];

/**
 * Inject assets into a Docker image. It returns a promise because Pulumi.output doesn't handle
 * rejection properly and seems to hang forever when an error occurs. In this case, we want to
 * fail fast and not hang forever.
 *
 * @param image Image to inject assets into.
 * @param unpreparedAssets List of assets to inject.
 * @returns A promise that resolves to the new image with the assets injected.
 */
async function injectAssets(
    image: docker.Image,
    opts: Required<InjectAssetsOpts>,
    unpreparedAssets: (InjectableAsset | InjectableChownableAsset)[],
): Promise<docker.Image> {
    // Step 1: Create a temporary directory to store all assets that will be removed after the build.
    const tmpdir = tmp.dirSync({ unsafeCleanup: true, mode: 0o700 });

    // Step 2: Resolve all assets and store them somewhere.
    const assets: (Omit<InjectableAsset | InjectableChownableAsset, "source"> & {
        source: string;
        sensitive?: Buffer;
    })[] = [];
    for (const asset of unpreparedAssets) {
        let { source, ...rest } = asset;
        let sensitive: boolean = false;

        if (IsSecretAsset(source)) {
            sensitive = true;
            source = source.asset;
        }

        pulumi.log.debug(
            IsFileAsset(source)
                ? `InjectAssets<FileAsset>: ${await source.path}`
                : IsRemoteAsset(source)
                  ? `InjectAssets<RemoteAsset>: ${await source.uri}`
                  : IsStringAsset(source)
                    ? `InjectAssets<StringAsset>: Write content`
                    : `Unsupported asset type: ${JSON.stringify(source)} (${typeof source})`,
        );
        const buf = await ReadAsset(source);
        const hash = crypto.createHash("sha256").update(buf).digest("hex");

        if (sensitive) {
            assets.push({ source: path.join(tmpdir.name, hash), sensitive: buf, ...rest });
            continue;
        }

        fs.writeFileSync(path.join(tmpdir.name, hash), buf);
        assets.push({ source: path.join(tmpdir.name, hash), sensitive: undefined, ...rest });
    }

    // Step 3: Generate a deterministic context for the build and link all assets to it.
    // NOTE: This step is necessary because if the context name changes, pulumi will try to
    //       rebuild the image. So using a deterministic checksum will prevent this from happening.

    // Check if all assets have different destinations.
    const dups = assets.reduce(
        (acc, cur, idx) => ({ ...acc, [cur.destination]: [...(acc[cur.destination] ?? []), idx] }),
        {} as Record<string, number[]>,
    );
    for (const [dest, idxs] of Object.entries(dups)) {
        if (idxs.length > 1) {
            throw new Error(
                `Several assets (${idxs.map((i) => `#${i}`).join(", ")}) found with the same destination: ${dest}`,
            );
        }
    }

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
    // In order to avoid long paths, we use a shorter hash and use base64 encoding instead
    // of hex for higher entropy (64^8 vs 16^8)
    const stackHash = hash.digest("base64");

    // In order to avoid long paths, we use a shorter hash and use base64 encoding instead
    // of hex for higher entropy (64^8 vs 16^8)
    const contextdir = path.join(os.tmpdir(), `pulumi-${stackId}-${stackHash.substring(0, 8)}`);
    fs.mkdirSync(contextdir, { recursive: true });
    if (__contextDirToCleanup.length === 0) {
        process.on("exit", () => {
            for (const dir of __contextDirToCleanup) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
    }
    __contextDirToCleanup.push(contextdir);

    // Link all assets to the context directory.
    for (const asset of assets) {
        if (asset.sensitive) {
            // Ignore sensitive asset because they will be injected as secrets.
            continue;
        }

        const target = path.join(contextdir, asset.destination);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.rmSync(target, { force: true, recursive: false });
        fs.linkSync(asset.source, target);
        asset.source = target;
    }

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

            // Add information about injection to the image
            labels: image.labels.apply((labels) => {
                let idx: number;

                // NOTE: we allow infinite recursive injection because Docker will
                //       stop if there is too much labels.
                for (idx = 0; idx < Infinity; idx++) {
                    const ref = labels?.[`sh.chezmoi.injected.${idx}.hash`];
                    if (ref === undefined) {
                        break;
                    }
                }

                return {
                    ...labels,
                    [`sh.chezmoi.injected.${idx}.hash`]: stackHash,
                    [`sh.chezmoi.injected.${idx}.base.ref`]: image.ref,
                };
            }),

            // For all tags, suffix them with -injected.X where X is the index of the injection.
            tags: image.tags.apply((v) =>
                (v ?? []).map((l) => {
                    if (!opts.suffix.includes("{idx}")) {
                        return `${l}${opts.suffix}`;
                    }

                    const rx = convertSuffixToRegex(opts.suffix);
                    const match = l.match(rx);
                    if (!match) {
                        return `${l}${opts.suffix.replace("{idx}", "0")}`;
                    } else {
                        const index = parseInt(match[1]);
                        return `${l.replace(rx, opts.suffix.replace("{idx}", (index + 1).toString()))}`;
                    }
                }),
            ),

            // Always disable cache for this kind of build because it seems that the cache
            // is not working properly when using the `--mount=type=secret` flag.
            // I think that the docker context is not properly updated with secrets.
            noCache: true,

            context: {
                location: contextdir,
            },
            dockerfile: {
                // Generate a Dockerfile based on the context
                inline: pulumi.output(
                    (() => {
                        // COPY asset as secret when assets are sensitives.
                        const runs: string[] = [];
                        let secretIdx = 0;
                        for (const idx in assets) {
                            const asset = assets[idx];
                            const destination = path.join(contextdir, asset.destination);

                            if (asset.sensitive) {
                                runs.push(
                                    `RUN mkdir -p ${path.dirname(destination)}`,
                                    `RUN --mount=type=secret,id=asset${secretIdx} base64 -d /run/secrets/asset${secretIdx} > ${path.join(
                                        contextdir,
                                        asset.destination,
                                    )}`,
                                );
                                secretIdx++;
                            }

                            if (asset.mode) {
                                runs.push(`RUN chmod ${asset.mode.toString(8)} ${destination}`);
                            }

                            if (IsInjectableChownableAsset(asset)) {
                                runs.push(
                                    `RUN chown ${asset.user}${asset.group ? `:${asset.group}` : ""} ${destination}`,
                                );
                            }
                        }

                        return pulumi.interpolate`FROM ${busybox}
COPY --from=${image.ref} /etc/passwd /etc/group /etc/
COPY . ${contextdir}
${runs.join("\n")}

FROM ${image.ref}
COPY --from=0 ${contextdir} /`;
                    })(),
                ),
            },
            secrets: assets
                .map((asset) => asset.sensitive)
                .filter(IsDefined) // Filter out undefined values
                .reduce(
                    (acc, buf, idx) => ({
                        ...acc,
                        [`asset${idx}`]: buf.toString("base64"),
                    }),
                    {},
                ),
        },
        {
            parent: image,
        },
    );

    return newImage;
}

/**
 * Convert a suffix to a regular expression.
 * @param suffix Suffix to convert to a regex.
 * @returns Regular expression that matches the suffix.
 */
export function convertSuffixToRegex(suffix: string): RegExp {
    return new RegExp(
        suffix
            .replaceAll("{idx}", "\u{f8ff}")
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replaceAll("\u{f8ff}", "(\\d+)"),
    );
}
