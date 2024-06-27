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
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { SecretAsset } from "./asset";
import { InjectableAsset } from "./docker";
import { generateDeterministicContext, resolveAsset } from "./docker.internal";

describe("resolveAsset", () => {
    beforeEach(function () {
        vi.spyOn(pulumi.log, "debug");
    });

    afterEach(function () {
        vi.restoreAllMocks();
    });

    describe("with FileAsset", () => {
        it("should resolve", async function () {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
            vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new FileAsset("/mock-directory/file.txt"),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c");
            expect(result.sensitive).toBeUndefined();
            expect(writeFileSync).toHaveBeenCalled();
            expect(writeFileSync).toHaveBeenCalledWith(
                "/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c",
                Buffer.from("file content"),
            );
            expect(result.destination).toBe("/mock-directory/file.txt");
        });

        it("should resolve with sensitive value", async function () {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
            vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new SecretAsset(new FileAsset("/mock-directory/file.txt")),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c");
            expect(result.sensitive).to.be.deep.equal(Buffer.from("file content"));
            expect(writeFileSync).not.toHaveBeenCalled();
            expect(result.destination).toBe("/mock-directory/file.txt");
        });

        it("should throw error if asset path does not exist", async function () {
            vi.spyOn(fs, "existsSync").mockReturnValue(false);
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new FileAsset("/mock-directory/file.txt"),
                destination: "/mock-directory/file.txt",
            };

            await expect(resolveAsset("/tmp", asset)).rejects.toThrow(
                "Failed to open asset file '/mock-directory/file.txt': ENOENT: no such file or directory",
            );
            expect(writeFileSync).not.toHaveBeenCalled();
        });

        it("should throw error if asset path is a directory", async function () {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => true } as fs.Stats);
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new FileAsset("/mock-directory"),
                destination: "/mock-directory",
            };

            await expect(resolveAsset("/tmp", asset)).rejects.toThrow(
                "Asset '/mock-directory' is a directory; try using an archive",
            );
            expect(writeFileSync).not.toHaveBeenCalled();
        });
    });

    describe("with StringAsset", () => {
        it("should resolve", async function () {
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new StringAsset("string content"),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/b52c2157c9b2c1aedab25cf4048885ee7ec7797520bc2ad0dbf20b898909210a");
            expect(result.sensitive).toBeUndefined();
            expect(writeFileSync).toHaveBeenCalled();
            expect(result.destination).toBe("/mock-directory/file.txt");
        });

        it("should resolve with sensitive value", async function () {
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new SecretAsset(new StringAsset("string content")),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/b52c2157c9b2c1aedab25cf4048885ee7ec7797520bc2ad0dbf20b898909210a");
            expect(result.sensitive).to.be.deep.equal(Buffer.from("string content"));
            expect(writeFileSync).not.toHaveBeenCalled();
            expect(result.destination).toBe("/mock-directory/file.txt");
        });
    });

    describe("with RemoteAsset", () => {
        it("should resolve", async function () {
            nock("https://example.com").get("/remote.txt").reply(200, "remote content");
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new RemoteAsset("https://example.com/remote.txt"),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2");
            expect(result.sensitive).toBeUndefined();
            expect(writeFileSync).toHaveBeenCalled();
            expect(result.destination).toBe("/mock-directory/file.txt");
        });

        it("should resolve with sensitive value", async function () {
            nock("https://example.com").get("/remote.txt").reply(200, "remote content");
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new SecretAsset(new RemoteAsset("https://example.com/remote.txt")),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2");
            expect(result.sensitive).to.be.deep.equal(Buffer.from("remote content"));
            expect(writeFileSync).not.toHaveBeenCalled();
            expect(result.destination).toBe("/mock-directory/file.txt");
        });

        it("should handle file:// protocol", async function () {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
            vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new RemoteAsset("file:///path/to/file"),
                destination: "/mock-directory/file.txt",
            };

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).toBe("/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c");
            expect(result.sensitive).toBeUndefined();
            expect(writeFileSync).toHaveBeenCalled();
            expect(result.destination).toBe("/mock-directory/file.txt");
        });

        it("should throw error if remote asset URI scheme is not supported", async function () {
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new RemoteAsset("ftp://example.com/remote.txt"),
                destination: "/mock-directory/file.txt",
            };

            await expect(resolveAsset("/tmp", asset)).rejects.toThrow("Unsupported remote asset URI scheme 'ftp:'");
            expect(writeFileSync).not.toHaveBeenCalled();
        });

        it("should throw error for invalid remote asset URI", async function () {
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new RemoteAsset("invalid-uri"),
                destination: "/mock-directory/file.txt",
            };

            await expect(resolveAsset("/tmp", asset)).rejects.toThrow("Invalid remote asset URI 'invalid-uri'");
            expect(writeFileSync).not.toHaveBeenCalled();
        });

        it("should throw error for failed fetch", async function () {
            nock("https://example.com").get("/remote.txt").reply(404);
            const writeFileSync = vi.spyOn(fs, "writeFileSync");

            const asset = {
                source: new RemoteAsset("https://example.com/remote.txt"),
                destination: "/mock-directory/file.txt",
            };

            await expect(resolveAsset("/tmp", asset)).rejects.toThrow(
                "Failed to fetch remote asset 'https://example.com/remote.txt' (404)",
            );
            expect(writeFileSync).not.toHaveBeenCalled();
        });
    });

    it("should throw error for unsupported asset type", async function () {
        const asset = {
            source: {},
            destination: "/mock-directory/file.txt",
        } as InjectableAsset;

        await expect(resolveAsset("/tmp", asset)).rejects.toThrow(
            "Unsupported asset type for '{}' (object): not a FileAsset, RemoteAsset or StringAsset",
        );
    });
});

describe("generateDeterministicContext", () => {
    beforeEach(function () {
        vi.spyOn(pulumi.runtime, "getOrganization").mockReturnValue("org");
        vi.spyOn(pulumi.runtime, "getProject").mockReturnValue("project");
        vi.spyOn(pulumi.runtime, "getStack").mockReturnValue("stack");
    });

    afterEach(function () {
        vi.restoreAllMocks();
    });

    it("should generate deterministic context and link assets correctly", async function () {
        vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
        vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
        const linkSync = vi.spyOn(fs, "linkSync").mockReturnValue(undefined);

        const promisedAssets = [
            Promise.resolve({
                source: "/tmp/27a698a834ba2d1ec188867e28aab261f1a2e1a5a4fae97912393f8d8c79a1c4",
                destination: "/mock-directory/asset1",
            }),
            Promise.resolve({
                source: "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
                destination: "/mock-directory/asset2",
            }),
        ];
        const result = await generateDeterministicContext(promisedAssets);

        expect(result.hash).toBe("B8Xz7TA4NMlHT8dYWj8zNeDXOWDl1Hm0C/xNeDUBDH0=");
        expect(result.contextdir).toBe("/tmp/pulumi-JU5c7AWT-B8Xz7TA4");
        expect(result.assets).toHaveLength(2);
        expect(linkSync).toHaveBeenCalledWith(
            "/tmp/27a698a834ba2d1ec188867e28aab261f1a2e1a5a4fae97912393f8d8c79a1c4",
            "/tmp/pulumi-JU5c7AWT-B8Xz7TA4/mock-directory/asset1",
        );
        expect(linkSync).toHaveBeenCalledWith(
            "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
            "/tmp/pulumi-JU5c7AWT-B8Xz7TA4/mock-directory/asset2",
        );
    });

    it("should generate deterministic contex with sensitive asset", async function () {
        vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
        vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
        const linkSync = vi.spyOn(fs, "linkSync").mockReturnValue(undefined);

        const promisedAssets = [
            Promise.resolve({
                source: "/tmp/c25ebfcd6e0521ad3678b2c04aecff197c7d1f34ee8f336f04792db181102baf",
                destination: "/mock-directory/asset1",
                sensitive: Buffer.from("sensitive content"),
            }),
            Promise.resolve({
                source: "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
                destination: "/mock-directory/asset2",
            }),
        ];
        const result = await generateDeterministicContext(promisedAssets);

        expect(result.hash).toBe("XbmBIgL0nNVIEVk+HKazpp4F41jBbOqabkGYgyVQTAc=");
        expect(result.contextdir).toBe("/tmp/pulumi-JU5c7AWT-XbmBIgL0");
        expect(result.assets).toHaveLength(2);
        expect(linkSync).toHaveBeenCalledWith(
            "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
            "/tmp/pulumi-JU5c7AWT-XbmBIgL0/mock-directory/asset2",
        );
    });

    it("should generate deterministic context with empty assets", async function () {
        vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
        vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
        const linkSync = vi.spyOn(fs, "linkSync").mockReturnValue(undefined);

        const result = await generateDeterministicContext([]);
        expect(result.hash).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
        expect(result.contextdir).toBe("/tmp/pulumi-JU5c7AWT-47DEQpj8");
        expect(result.assets).toHaveLength(0);
        expect(linkSync).not.toHaveBeenCalled();
    });

    it("should throw an error if there is several assets with the same destination", async () => {
        vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
        vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
        vi.spyOn(fs, "linkSync").mockReturnValue(undefined);

        const promisedAssets = [
            Promise.resolve({
                source: "/tmp/27a698a834ba2d1ec188867e28aab261f1a2e1a5a4fae97912393f8d8c79a1c4",
                destination: "/mock-directory/asset1",
            }),
            Promise.resolve({
                source: "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
                destination: "/mock-directory/asset2",
            }),
            Promise.resolve({
                source: "/tmp/110edf82c6eabb98881ce1d20741e7c91f2a82682c6eca38a89a2a1fab14a71e4",
                destination: "/mock-directory/asset1",
            }),
            Promise.resolve({
                source: "/tmp/0741e7c82c6ecaa2abb9d5cd4e17a41baf1a59f0094c41959f0094c4199628a2f",
                destination: "/mock-directory/asset1",
            }),
        ];

        await expect(generateDeterministicContext(promisedAssets)).rejects.toThrow(
            "Several assets (#0, #2, #3) found with the same destination: /mock-directory/asset1",
        );
    });
});
