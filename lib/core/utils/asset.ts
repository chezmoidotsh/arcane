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
import fetch from "node-fetch";
import path from "path";

import pulumi from "@pulumi/pulumi";
import { Asset, FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

/**
 * Options for the {@link DirectoryAsset}.
 */
export interface DirectoryAssetOpts {
    /**
     * Whether to search for assets recursively.
     * @default false
     */
    recursive?: boolean;

    /**
     * A list of regular expressions to filter the assets.
     */
    filters?: RegExp[];

    /**
     * A list of predicates to filter the assets.
     */
    predicates?: ((file: fs.Dirent) => boolean)[];
}

/**
 * DirectoryAsset is a kind of asset produced from a given path to a directory on the local filesystem.
 * It is a custom asset type that is not part of the Pulumi SDK and MUST NOT be used
 * like a regular asset type (it represents a directory, not a file but contains several ones).
 */
export class DirectoryAsset {
    /**
     * All the assets found in the directory.
     */
    readonly assets: FileAsset[];

    /**
     * The path to the directory.
     */
    readonly path: string;

    constructor(directory: string, opts?: DirectoryAssetOpts) {
        this.path = directory;

        this.assets = fs
            .readdirSync(path.resolve(directory), {
                withFileTypes: true,
                recursive: opts?.recursive,
            })
            .filter((file) => opts?.filters?.some((rx) => rx.test(file.name)) ?? true)
            .filter((file) => opts?.predicates?.every((fnc) => fnc(file)) ?? true)
            .map((file) => new FileAsset(`${directory}/${file.name}`));
    }
}

/**
 * Read the content of a pulumi {@link Asset}.
 *
 * @template T Any extended Asset type
 * @param {T} asset The asset to read the content from.
 * @returns {Output<Buffer>} The content of the asset.
 *
 * @throws If the asset type is not supported.
 */
export function ReadAsset<T extends Asset>(asset: T): Promise<Buffer> {
    if (IsFileAsset(asset)) {
        return readFileAsset({ path: asset.path });
    } else if (IsRemoteAsset(asset)) {
        return readRemoteAsset({ uri: asset.uri });
    } else if (IsStringAsset(asset)) {
        return readStringAsset({ text: asset.text });
    }
    throw new Error(
        `Unsupported asset type for '${JSON.stringify(asset)}' (${typeof asset}): not a FileAsset, RemoteAsset or StringAsset`,
    );
}

export function IsFileAsset(asset: any): asset is FileAsset {
    return asset?.path !== undefined;
}
export function IsRemoteAsset(asset: any): asset is RemoteAsset {
    return asset?.uri !== undefined;
}
export function IsStringAsset(asset: any): asset is StringAsset {
    return asset?.text !== undefined;
}

/**
 * Read the content of a {@link pulumi.asset.FileAsset}.
 *
 * @param {FileAsset} asset The file asset to read the content from.
 * @returns {Promise<Buffer>} The content of the file asset.
 *
 * @throws If the asset file does not exist.
 * @throws If the asset path is a directory.
 */

async function readFileAsset(asset: FileAsset): Promise<Buffer> {
    return await Promise.resolve(asset.path).then((path) => {
        if (!fs.existsSync(path)) {
            throw new Error(`Failed to open asset file '${path}': ENOENT: no such file or directory`);
        }

        if (fs.lstatSync(path).isDirectory()) {
            throw new Error(`Asset '${path}' is a directory; try using an archive`);
        }
        return fs.promises.readFile(path);
    });
}

/**
 * Read the content of a {@link pulumi.asset.StringAsset}.
 *
 * @param {StringAsset} asset The string asset to read the content from.
 * @returns {Promise<Buffer>} The content of the string asset.
 */
async function readStringAsset(asset: StringAsset): Promise<Buffer> {
    return await Promise.resolve(asset.text).then((text) => Buffer.from(text, "utf-8"));
}

/**
 * Read the content of a {@link pulumi.asset.RemoteAsset}.
 *
 * @param {RemoteAsset} asset The remote asset to read the content from.
 * @returns {Promise<Buffer>} The content of the remote asset.
 *
 * @throws If the remote asset URI scheme is not supported.
 * @throws If the remote asset fetch fails.
 * @throws If the remote asset URI is invalid.
 */
async function readRemoteAsset(asset: RemoteAsset): Promise<Buffer> {
    return Promise.resolve(asset.uri).then(async (u) => {
        let url: URL;
        try {
            url = new URL(u);
        } catch (_) {
            throw new Error(`Invalid remote asset URI '${u}'`);
        }

        if (url.protocol == "http:" || url.protocol == "https:") {
            const response = await fetch(url.href);
            if (!response.ok) {
                throw new Error(`Failed to fetch remote asset '${url}' (${response.status})`);
            }
            return Buffer.from(await response.arrayBuffer());
        } else if (url.protocol == "file:") {
            return readFileAsset(new FileAsset(url.pathname));
        } else {
            throw new Error(`Unsupported remote asset URI scheme '${url.protocol}'`);
        }
    });
}

/**
 * Create an asset that should be mounted as a secret during a Docker build.
 */
export class SecretAsset<T extends Asset> {
    /**
     * The asset to be mounted as a secret.
     */
    public readonly asset: T;

    /**
     * Create a new SecretAsset wrapping the given asset.
     * @param asset Asset to be mounted as a secret.
     */
    constructor(asset: T | SecretAsset<T>) {
        if (IsSecretAsset<T>(asset)) {
            this.asset = asset.asset;
        } else {
            this.asset = asset;
        }
    }
}

/**
 * Type guard function to check if an object is a SecretAsset.
 * @param asset Object to check if it is a SecretAsset.
 * @returns true if the object is a SecretAsset, false otherwise.
 */
export function IsSecretAsset<T extends Asset>(asset: any): asset is SecretAsset<T> {
    return asset?.asset !== undefined;
}
