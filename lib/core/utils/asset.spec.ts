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

import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs";
import * as sinon from "sinon";
import { FileAsset, StringAsset, RemoteAsset } from "@pulumi/pulumi/asset";
import nock from "nock";

import {
    DirectoryAsset,
    IsFileAsset,
    IsRemoteAsset,
    IsSecretAsset,
    IsStringAsset,
    ReadAsset,
    SecretAsset,
} from "./asset";

chai.use(chaiAsPromised);

describe("DirectoryAsset", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("should correctly initialize with assets (all files)", async () => {
        sandbox
            .stub(fs, "readdirSync")
            .returns([{ name: "file1.txt" } as fs.Dirent, { name: "file2.txt" } as fs.Dirent]);

        const directoryAsset = new DirectoryAsset("/mock-directory", {});

        expect(directoryAsset.path).to.be.equal("/mock-directory");
        expect(directoryAsset.assets).to.have.length(2);
        expect(directoryAsset.assets[0]).to.be.instanceof(FileAsset);
        expect(await directoryAsset.assets[0].path).to.be.equal("/mock-directory/file1.txt");
        expect(directoryAsset.assets[1]).to.be.instanceof(FileAsset);
        expect(await directoryAsset.assets[1].path).to.be.equal("/mock-directory/file2.txt");
    });

    it("should filter files based on provided options (regex filter)", async () => {
        sandbox
            .stub(fs, "readdirSync")
            .returns([{ name: "file1.txt" } as fs.Dirent, { name: "file2.log" } as fs.Dirent]);

        const directoryAsset = new DirectoryAsset("/mock-directory", {
            filters: [/\.txt$/],
        });

        expect(directoryAsset.assets).to.have.length(1);
        expect(await directoryAsset.assets[0].path).to.equal("/mock-directory/file1.txt");
    });

    it("should filter files based on provided options (predicate filter)", async () => {
        sandbox
            .stub(fs, "readdirSync")
            .returns([{ name: "file1.txt" } as fs.Dirent, { name: "file2.log" } as fs.Dirent]);

        const directoryAsset = new DirectoryAsset("/mock-directory", {
            predicates: [(file) => file.name.endsWith(".log")],
        });

        expect(directoryAsset.assets).to.have.length(1);
        expect(await directoryAsset.assets[0].path).to.equal("/mock-directory/file2.log");
    });
});

describe("SecretAsset", () => {
    it("should correctly initialize with assets", () => {
        const asset = new StringAsset("secret");
        const sensitiveAsset = new SecretAsset(asset);

        expect(sensitiveAsset.asset).to.be.equal(asset);
    });

    it("should correctly initialize with SecretAsset", () => {
        const asset = new StringAsset("secret");
        const sensitiveAsset = new SecretAsset(new SecretAsset(asset));

        expect(sensitiveAsset.asset).to.be.equal(asset);
    });
});

describe("ReadAsset", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("with FileAsset", () => {
        it("should read an existing file", async () => {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => false } as fs.Stats);
            sandbox.stub(fs.promises, "readFile").returns(Promise.resolve(Buffer.from("file content")));

            const fileAsset = new FileAsset("/mock-directory/file.txt");
            await expect(ReadAsset(fileAsset)).eventually.deep.equal(Buffer.from("file content"));
        });

        it("should throw error for non-existing file", async () => {
            sandbox.stub(fs, "existsSync").returns(false);

            const fileAsset = new FileAsset("/mock-directory/file.txt");
            await expect(ReadAsset(fileAsset)).be.eventually.rejectedWith(
                "Failed to open asset file '/mock-directory/file.txt': ENOENT: no such file or directory",
            );
        });

        it("should throw error for directory", async () => {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => true } as fs.Stats);

            const fileAsset = new FileAsset("/mock-directory");
            await expect(ReadAsset(fileAsset)).be.eventually.rejectedWith(
                "Asset '/mock-directory' is a directory; try using an archive",
            );
        });
    });

    describe("with StringAsset", () => {
        it("should be read", async () => {
            const stringAsset = new StringAsset("string content");
            await expect(ReadAsset(stringAsset)).be.eventually.deep.equal(Buffer.from("string content"));
        });
    });

    describe("with RemoteAsset", () => {
        it("should fetch the URL", async () => {
            nock("https://example.com").get("/remote.txt").reply(200, "remote content");

            const remoteAsset = new RemoteAsset("https://example.com/remote.txt");
            await expect(ReadAsset(remoteAsset)).be.eventually.deep.equal(Buffer.from("remote content"));
        });

        it("should handle file:// protocol", async () => {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => false } as fs.Stats);
            sandbox.stub(fs.promises, "readFile").returns(Promise.resolve(Buffer.from("file content")));

            const remoteAsset = new RemoteAsset("file:///path/to/file");
            await expect(ReadAsset(remoteAsset)).be.eventually.deep.equal(Buffer.from("file content"));
        });

        it("should throw error for unsupported protocol", async () => {
            const remoteAsset = new RemoteAsset("ftp://example.com/remote.txt");
            await expect(ReadAsset(remoteAsset)).be.eventually.rejectedWith(
                "Unsupported remote asset URI scheme 'ftp:'",
            );
        });

        it("should throw error for invalid URL", async () => {
            const remoteAsset = new RemoteAsset("invalid-url");
            await expect(ReadAsset(remoteAsset)).be.eventually.rejectedWith("Invalid remote asset URI 'invalid-url'");
        });

        it("should throw error for failed fetch", async () => {
            nock("https://example.com").get("/remote.txt").reply(404);

            const remoteAsset = new RemoteAsset("https://example.com/remote.txt");
            await expect(ReadAsset(remoteAsset)).be.eventually.rejectedWith(
                "Failed to fetch remote asset 'https://example.com/remote.txt': 404 (Not Found)",
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
        expect(IsFileAsset(fileAsset)).to.be.true;
        expect(IsRemoteAsset(fileAsset)).to.be.false;
        expect(IsStringAsset(fileAsset)).to.be.false;
    });

    it("should correctly identify RemoteAsset", () => {
        const remoteAsset = new RemoteAsset("http://example.com");
        expect(IsFileAsset(remoteAsset)).to.be.false;
        expect(IsRemoteAsset(remoteAsset)).to.be.true;
        expect(IsStringAsset(remoteAsset)).to.be.false;
    });

    it("should correctly identify StringAsset", () => {
        const stringAsset = new StringAsset("content");
        expect(IsFileAsset(stringAsset)).to.be.false;
        expect(IsRemoteAsset(stringAsset)).to.be.false;
        expect(IsStringAsset(stringAsset)).to.be.true;
    });

    it("should correctly identify SecretAsset", () => {
        const secretAsset = new SecretAsset(new StringAsset("secret"));
        expect(IsFileAsset(secretAsset)).to.be.false;
        expect(IsRemoteAsset(secretAsset)).to.be.false;
        expect(IsStringAsset(secretAsset)).to.be.false;
        expect(IsSecretAsset(secretAsset)).to.be.true;
    });

    it("should not indentify undefined or null values", () => {
        expect(IsFileAsset(undefined)).to.be.false;
        expect(IsRemoteAsset(undefined)).to.be.false;
        expect(IsStringAsset(undefined)).to.be.false;
        expect(IsSecretAsset(undefined)).to.be.false;

        expect(IsFileAsset(null)).to.be.false;
        expect(IsRemoteAsset(null)).to.be.false;
        expect(IsStringAsset(null)).to.be.false;
        expect(IsSecretAsset(null)).to.be.false;
    });
});
