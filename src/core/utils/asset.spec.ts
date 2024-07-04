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

    it("should correctly find all assets (not recursive)", async () => {
        const directoryAsset = new DirectoryAsset(`${__dirname}/fixtures/DirectoryAsset`, { recursive: false });

        expect(directoryAsset.path).toBe(`${__dirname}/fixtures/DirectoryAsset`);
        expect(Object.keys(directoryAsset.assets)).toHaveLength(2);
        await expect(directoryAsset.assets["file1.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/file1.txt`,
        );
        await expect(directoryAsset.assets["file2.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/file2.txt`,
        );
    });

    it("should correctly find all assets (recursive)", async () => {
        const directoryAsset = new DirectoryAsset(`${__dirname}/fixtures/DirectoryAsset`, { recursive: true });

        expect(directoryAsset.path).toBe(`${__dirname}/fixtures/DirectoryAsset`);
        expect(Object.keys(directoryAsset.assets)).toHaveLength(4);
        await expect(directoryAsset.assets["file1.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/file1.txt`,
        );
        await expect(directoryAsset.assets["file2.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/file2.txt`,
        );
        await expect(directoryAsset.assets["subfolder/file1.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/subfolder/file1.txt`,
        );
        await expect(directoryAsset.assets["subfolder/file2.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/subfolder/file2.txt`,
        );
    });

    it("should filter files based on provided options (regex filter)", async () => {
        const directoryAsset = new DirectoryAsset(`${__dirname}/fixtures/DirectoryAsset`, {
            recursive: true,
            filters: [/1\.txt$/],
        });

        expect(Object.keys(directoryAsset.assets)).toHaveLength(2);
        await expect(directoryAsset.assets["file1.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/file1.txt`,
        );
        await expect(directoryAsset.assets["subfolder/file1.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/subfolder/file1.txt`,
        );
    });

    it("should filter files based on provided options (predicate filter)", async () => {
        const directoryAsset = new DirectoryAsset(`${__dirname}/fixtures/DirectoryAsset`, {
            recursive: true,
            predicates: [(file) => file.parentPath.endsWith("subfolder")],
        });

        expect(Object.keys(directoryAsset.assets)).toHaveLength(2);
        await expect(directoryAsset.assets["subfolder/file1.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/subfolder/file1.txt`,
        );
        await expect(directoryAsset.assets["subfolder/file2.txt"].path).resolves.toBe(
            `${__dirname}/fixtures/DirectoryAsset/subfolder/file2.txt`,
        );
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

    describe("#fromString", () => {
        it("should create a new SecretAsset from a string", () => {
            const sensitiveAsset = SecretAsset.fromString("secret");

            expect(sensitiveAsset).toBeInstanceOf(SecretAsset);
            expect(sensitiveAsset.asset).toBeInstanceOf(StringAsset);
        });
    });

    describe("#fromFile", () => {
        it("should create a new SecretAsset from a file", () => {
            const sensitiveAsset = SecretAsset.fromFile("/path/to/file");

            expect(sensitiveAsset).toBeInstanceOf(SecretAsset);
            expect(sensitiveAsset.asset).toBeInstanceOf(FileAsset);
        });
    });

    describe("#fromRemote", () => {
        it("should create a new SecretAsset from a remote asset", () => {
            const sensitiveAsset = SecretAsset.fromRemote("https://example.com/remote.txt");

            expect(sensitiveAsset).toBeInstanceOf(SecretAsset);
            expect(sensitiveAsset.asset).toBeInstanceOf(RemoteAsset);
        });
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
