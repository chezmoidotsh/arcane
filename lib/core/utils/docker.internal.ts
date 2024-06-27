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

import * as pulumi from "@pulumi/pulumi";

import { IsFileAsset, IsRemoteAsset, IsSecretAsset, IsStringAsset, ReadAsset } from "./asset";
import { InjectableAsset, InjectableChownableAsset } from "./docker";

type sensitiveInjectableAsset = Omit<InjectableAsset | InjectableChownableAsset, "source"> & {
    source: string;
    sensitive?: Buffer;
};

/**
 * Resolve an asset (read a file, download a remote asset, etc.) and store them into a proper way:
 *   - If the asset is a secret, the wrapped asset content will be stored inside a buffer to keep it inside the memory.
 *   - If the asset is a file, it will be copied to a temporary directory.
 *   - If the asset is a remote asset, it will be downloaded to a temporary directory.
 *   - If the asset is a string asset, it will be written to a temporary file.
 *
 * @param tmp Temporary directory where the asset should be stored.
 * @param asset Asset that should be resolved.
 */
export async function resolveAsset(
    tmp: string,
    asset: InjectableAsset | InjectableChownableAsset,
): Promise<sensitiveInjectableAsset> {
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
        return { source: path.join(tmp, hash), sensitive: buf, ...rest };
    }

    fs.writeFileSync(path.join(tmp, hash), buf);
    return { source: path.join(tmp, hash), sensitive: undefined, ...rest };
}

/**
 * Generate a deterministic context folder for the build.
 *
 * It is necessary to generate a deterministic context folder because if the context folder
 * changes, pulumi will try to rebuild the image, even if the content of the image has not changed.
 * Also, to keep everything lightweight, we will only use hard links to link the assets to the
 * final context folder. This way, we will avoid copying the assets multiple times.
 *
 * @param promisedAssets Assets to be injected into the image.
 */
export async function generateDeterministicContext(
    promisedAssets: Promise<sensitiveInjectableAsset>[],
): Promise<{ hash: string; contextdir: string; assets: sensitiveInjectableAsset[] }> {
    const assets = await Promise.all(promisedAssets);

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

    const contextdir = path.join(os.tmpdir(), `pulumi-${stackId}-${stackHash.substring(0, 8)}`);
    fs.mkdirSync(contextdir, { recursive: true });
    process.on("exit", () => fs.rmSync(contextdir, { recursive: true, force: true }));

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
    return { hash: stackHash, contextdir, assets };
}
