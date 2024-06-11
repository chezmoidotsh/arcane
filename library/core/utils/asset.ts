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

import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
import { Asset, FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

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
    if (isFileAsset(asset)) {
        return readFileAsset({ path: asset.path });
    } else if (isRemoteAsset(asset)) {
        return readRemoteAsset({ uri: asset.uri });
    } else if (isStringAsset(asset)) {
        return readStringAsset({ text: asset.text });
    }
    throw new Error(`unsupported asset type`);
}

function isFileAsset(asset: any): asset is FileAsset { return (asset as FileAsset).path !== undefined; }
function isRemoteAsset(asset: any): asset is RemoteAsset { return (asset as RemoteAsset).uri !== undefined; }
function isStringAsset(asset: any): asset is StringAsset { return (asset as StringAsset).text !== undefined; }

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
    return await Promise.resolve(asset.path).then(path => {
        if (!fs.existsSync(path)) {
            throw new Error(`failed to open asset file '${path}'`);
        }

        if (fs.lstatSync(path).isDirectory()) {
            throw new Error(`asset path '${path}' is a directory; try using an archive`);
        }
        return fs.promises.readFile(path)
    });
}

/**
 * Read the content of a {@link pulumi.asset.StringAsset}.
 *
 * @param {StringAsset} asset The string asset to read the content from.
 * @returns {Promise<Buffer>} The content of the string asset.
 */
async function readStringAsset(asset: StringAsset): Promise<Buffer> {
    return await Promise.resolve(asset.text).then(text => Buffer.from(text, "utf-8"));
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
    return await Promise.resolve(asset.uri).then(async u => {
        const url = new URL(u);

        if (url.protocol == "http:" || url.protocol == "https:") {
            return fetch(url).then(
                async response => {
                    if (!response.ok) {
                        throw new Error(`failed to fetch remote asset '${url}': ${response.statusText}`);
                    }

                    return response.arrayBuffer().then(buffer => Buffer.from(buffer));
                })
        } else if (url.protocol == "file:") {
            return readFileAsset(new FileAsset(url.pathname));
        } else {
            throw new Error(`unsupported remote asset URI scheme '${url.protocol}'`)
        }
    });
}