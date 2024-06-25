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
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import {
    DirectoryAsset,
    IsFileAsset,
    IsRemoteAsset,
    IsSecretAsset,
    IsStringAsset,
    ReadAsset,
    SecretAsset,
} from "./asset";

describe("DirectoryAsset", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should correctly initialize with assets (all files)", async () => {
        vi.spyOn(fs, "readdirSync").mockReturnValue([
            { name: "file1.txt" } as fs.Dirent,
            { name: "file2.txt" } as fs.Dirent,
        ]);

        const directoryAsset = new DirectoryAsset("/mock-directory", {});

        expect(directoryAsset.path).toBe("/mock-directory");
        expect(directoryAsset.assets).toHaveLength(2);
        expect(directoryAsset.assets[0]).to.be.instanceof(FileAsset);
        expect(await directoryAsset.assets[0].path).toBe("/mock-directory/file1.txt");
        expect(directoryAsset.assets[1]).to.be.instanceof(FileAsset);
        expect(await directoryAsset.assets[1].path).toBe("/mock-directory/file2.txt");
    });

    it("should filter files based on provided options (regex filter)", async () => {
        vi.spyOn(fs, "readdirSync").mockReturnValue([
            { name: "file1.txt" } as fs.Dirent,
            { name: "file2.log" } as fs.Dirent,
        ]);

        const directoryAsset = new DirectoryAsset("/mock-directory", {
            filters: [/\.txt$/],
        });

        expect(directoryAsset.assets).toHaveLength(1);
        expect(await directoryAsset.assets[0].path).toBe("/mock-directory/file1.txt");
    });

    it("should filter files based on provided options (predicate filter)", async () => {
        vi.spyOn(fs, "readdirSync").mockReturnValue([
            { name: "file1.txt" } as fs.Dirent,
            { name: "file2.log" } as fs.Dirent,
        ]);

        const directoryAsset = new DirectoryAsset("/mock-directory", {
            predicates: [(file) => file.name.endsWith(".log")],
        });

        expect(directoryAsset.assets).toHaveLength(1);
        expect(await directoryAsset.assets[0].path).toBe("/mock-directory/file2.log");
    });
});

describe("SecretAsset", () => {
    it("should correctly initialize with assets", () => {
        const asset = new StringAsset("secret");
        const sensitiveAsset = new SecretAsset(asset);

        expect(sensitiveAsset.asset).toBe(asset);
    });

    it("should correctly initialize with SecretAsset", () => {
        const asset = new StringAsset("secret");
        const sensitiveAsset = new SecretAsset(new SecretAsset(asset));

        expect(sensitiveAsset.asset).toBe(asset);
    });
});

describe("ReadAsset", () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    describe("with FileAsset", () => {
        it("should read an existing file", async () => {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
            vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));

            const fileAsset = new FileAsset("/mock-directory/file.txt");
            await expect(ReadAsset(fileAsset)).resolves.toEqual(Buffer.from("file content"));
        });

        it("should throw error for non-existing file", async () => {
            vi.spyOn(fs, "existsSync").mockReturnValue(false);

            const fileAsset = new FileAsset("/mock-directory/file.txt");
            await expect(ReadAsset(fileAsset)).rejects.toThrow(
                "Failed to open asset file '/mock-directory/file.txt': ENOENT: no such file or directory",
            );
        });

        it("should throw error for directory", async () => {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => true } as fs.Stats);

            const fileAsset = new FileAsset("/mock-directory");
            await expect(ReadAsset(fileAsset)).rejects.toThrow(
                "Asset '/mock-directory' is a directory; try using an archive",
            );
        });
    });

    describe("with StringAsset", () => {
        it("should be read", async () => {
            const stringAsset = new StringAsset("string content");
            await expect(ReadAsset(stringAsset)).resolves.toEqual(Buffer.from("string content"));
        });
    });

    describe("with RemoteAsset", () => {
        it("should fetch the URL", async () => {
            nock("https://example.com").get("/remote.txt").reply(200, "remote content");

            const remoteAsset = new RemoteAsset("https://example.com/remote.txt");
            await expect(ReadAsset(remoteAsset)).resolves.toEqual(Buffer.from("remote content"));
        });

        it("should handle file:// protocol", async () => {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
            vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));

            const remoteAsset = new RemoteAsset("file:///path/to/file");
            await expect(ReadAsset(remoteAsset)).resolves.toEqual(Buffer.from("file content"));
        });

        it("should throw error for unsupported protocol", async () => {
            const remoteAsset = new RemoteAsset("ftp://example.com/remote.txt");
            await expect(ReadAsset(remoteAsset)).rejects.toThrow("Unsupported remote asset URI scheme 'ftp:'");
        });

        it("should throw error for invalid URL", async () => {
            const remoteAsset = new RemoteAsset("invalid-url");
            await expect(ReadAsset(remoteAsset)).rejects.toThrow("Invalid remote asset URI 'invalid-url'");
        });

        it("should throw error for failed fetch", async () => {
            nock("https://example.com").get("/remote.txt").reply(404);

            const remoteAsset = new RemoteAsset("https://example.com/remote.txt");
            await expect(ReadAsset(remoteAsset)).rejects.toThrow(
                "Failed to fetch remote asset 'https://example.com/remote.txt' (404)",
            );
        });
    });

    describe("with unknown type", () => {
        it("should throw error", async () => {
            const unknownAsset = {} as any;
            expect(() => ReadAsset(unknownAsset)).throws(
                "Unsupported asset type for '{}' (object): not a FileAsset, RemoteAsset or StringAsse",
            );
        });
    });
});

describe("Asset type checkers", () => {
    it("should correctly identify FileAsset", () => {
        const fileAsset = new FileAsset("/path/to/file");
        expect(IsFileAsset(fileAsset)).toBe(true);
        expect(IsRemoteAsset(fileAsset)).toBe(false);
        expect(IsStringAsset(fileAsset)).toBe(false);
    });

    it("should correctly identify RemoteAsset", () => {
        const remoteAsset = new RemoteAsset("http://example.com");
        expect(IsFileAsset(remoteAsset)).toBe(false);
        expect(IsRemoteAsset(remoteAsset)).toBe(true);
        expect(IsStringAsset(remoteAsset)).toBe(false);
    });

    it("should correctly identify StringAsset", () => {
        const stringAsset = new StringAsset("content");
        expect(IsFileAsset(stringAsset)).toBe(false);
        expect(IsRemoteAsset(stringAsset)).toBe(false);
        expect(IsStringAsset(stringAsset)).toBe(true);
    });

    it("should correctly identify SecretAsset", () => {
        const secretAsset = new SecretAsset(new StringAsset("secret"));
        expect(IsFileAsset(secretAsset)).toBe(false);
        expect(IsRemoteAsset(secretAsset)).toBe(false);
        expect(IsStringAsset(secretAsset)).toBe(false);
        expect(IsSecretAsset(secretAsset)).toBe(true);
    });

    it("should not indentify undefined or null values", () => {
        expect(IsFileAsset(undefined)).toBe(false);
        expect(IsRemoteAsset(undefined)).toBe(false);
        expect(IsStringAsset(undefined)).toBe(false);
        expect(IsSecretAsset(undefined)).toBe(false);

        expect(IsFileAsset(null)).toBe(false);
        expect(IsRemoteAsset(null)).toBe(false);
        expect(IsStringAsset(null)).toBe(false);
        expect(IsSecretAsset(null)).toBe(false);
    });
});
