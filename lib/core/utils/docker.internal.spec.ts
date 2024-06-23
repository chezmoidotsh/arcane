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
import { expect } from "chai";
import fs from "fs";
import nock from "nock";
import sinon from "sinon";

import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { SecretAsset } from "./asset";
import { InjectableAsset } from "./docker";
import { generateDeterministicContext, resolveAsset } from "./docker.internal";

// rmdirSync is automatically called by the cleanup function when the process exits
sinon.stub(fs, "rmdirSync");

describe("resolveAsset", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        sandbox.stub(pulumi.log, "debug");
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe("with FileAsset", () => {
        it("should resolve", async function () {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => false } as fs.Stats);
            sandbox.stub(fs.promises, "readFile").returns(Promise.resolve(Buffer.from("file content")));
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new FileAsset("/mock-directory/file.txt"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c");
            expect(result.sensitive).to.be.undefined;
            expect(writeFileSync.calledOnce).to.be.true;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });

        it("should resolve with sensitive value", async function () {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => false } as fs.Stats);
            sandbox.stub(fs.promises, "readFile").returns(Promise.resolve(Buffer.from("file content")));
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new SecretAsset(new FileAsset("/mock-directory/file.txt")),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c");
            expect(result.sensitive).to.be.deep.equal(Buffer.from("file content"));
            expect(writeFileSync.calledOnce).to.be.false;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });

        it("should throw error if asset path does not exist", async function () {
            sandbox.stub(fs, "existsSync").returns(false);
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new FileAsset("/mock-directory/file.txt"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            await expect(resolveAsset("/tmp", asset)).eventually.to.be.rejectedWith(
                Error,
                "Failed to open asset file '/mock-directory/file.txt': ENOENT: no such file or directory",
            );
            expect(writeFileSync.calledOnce).to.be.false;
        });

        it("should throw error if asset path is a directory", async function () {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => true } as fs.Stats);
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new FileAsset("/mock-directory"),
                destination: "/mock-directory",
            } as InjectableAsset);

            await expect(resolveAsset("/tmp", asset)).eventually.to.be.rejectedWith(
                Error,
                "Asset '/mock-directory' is a directory; try using an archive",
            );
            expect(writeFileSync.calledOnce).to.be.false;
        });
    });

    describe("with StringAsset", () => {
        it("should resolve", async function () {
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new StringAsset("string content"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/b52c2157c9b2c1aedab25cf4048885ee7ec7797520bc2ad0dbf20b898909210a");
            expect(result.sensitive).to.be.undefined;
            expect(writeFileSync.calledOnce).to.be.true;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });

        it("should resolve with sensitive value", async function () {
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new SecretAsset(new StringAsset("string content")),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/b52c2157c9b2c1aedab25cf4048885ee7ec7797520bc2ad0dbf20b898909210a");
            expect(result.sensitive).to.be.deep.equal(Buffer.from("string content"));
            expect(writeFileSync.calledOnce).to.be.false;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });
    });

    describe("with RemoteAsset", () => {
        it("should resolve", async function () {
            nock("https://example.com").get("/remote.txt").reply(200, "remote content");
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new RemoteAsset("https://example.com/remote.txt"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2");
            expect(result.sensitive).to.be.undefined;
            expect(writeFileSync.calledOnce).to.be.true;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });

        it("should resolve with sensitive value", async function () {
            nock("https://example.com").get("/remote.txt").reply(200, "remote content");
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new SecretAsset(new RemoteAsset("https://example.com/remote.txt")),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2");
            expect(result.sensitive).to.be.deep.equal(Buffer.from("remote content"));
            expect(writeFileSync.calledOnce).to.be.false;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });

        it("should handle file:// protocol", async function () {
            sandbox.stub(fs, "existsSync").returns(true);
            sandbox.stub(fs, "lstatSync").returns({ isDirectory: () => false } as fs.Stats);
            sandbox.stub(fs.promises, "readFile").returns(Promise.resolve(Buffer.from("file content")));
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new RemoteAsset("file:///path/to/file"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            const result = await resolveAsset("/tmp", asset);

            expect(result.source).to.be.equal("/tmp/e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c");
            expect(result.sensitive).to.be.undefined;
            expect(writeFileSync.calledOnce).to.be.true;
            expect(result.destination).to.be.equal("/mock-directory/file.txt");
        });

        it("should throw error if remote asset URI scheme is not supported", async function () {
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new RemoteAsset("ftp://example.com/remote.txt"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            await expect(resolveAsset("/tmp", asset)).eventually.to.be.rejectedWith(
                Error,
                "Unsupported remote asset URI scheme 'ftp:'",
            );
            expect(writeFileSync.calledOnce).to.be.false;
        });

        it("should throw error for invalid remote asset URI", async function () {
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new RemoteAsset("invalid-uri"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            await expect(resolveAsset("/tmp", asset)).eventually.to.be.rejectedWith(
                Error,
                "Invalid remote asset URI 'invalid-uri'",
            );
            expect(writeFileSync.calledOnce).to.be.false;
        });

        it("should throw error for failed fetch", async function () {
            nock("https://example.com").get("/remote.txt").reply(404);
            const writeFileSync = sandbox.stub(fs, "writeFileSync");

            const asset = Promise.resolve({
                source: new RemoteAsset("https://example.com/remote.txt"),
                destination: "/mock-directory/file.txt",
            } as InjectableAsset);

            await expect(resolveAsset("/tmp", asset)).eventually.to.be.rejectedWith(
                Error,
                "Failed to fetch remote asset 'https://example.com/remote.txt' (404)",
            );
            expect(writeFileSync.calledOnce).to.be.false;
        });
    });

    it("should throw error for unsupported asset type", async function () {
        const asset = Promise.resolve({
            source: {},
            destination: "/mock-directory/file.txt",
        } as InjectableAsset);

        await expect(resolveAsset("/tmp", asset)).eventually.to.be.rejectedWith(
            Error,
            "Unsupported asset type for '{}' (object): not a FileAsset, RemoteAsset or StringAsset",
        );
    });
});

describe("generateDeterministicContext", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        sandbox.stub(pulumi.runtime, "getOrganization").returns("org");
        sandbox.stub(pulumi.runtime, "getProject").returns("project");
        sandbox.stub(pulumi.runtime, "getStack").returns("stack");
    });

    afterEach(function () {
        sandbox.restore();
    });

    it("should generate deterministic context and link assets correctly", async function () {
        sandbox.stub(fs, "mkdirSync");
        sandbox.stub(fs, "rmSync");
        const linkSync = sandbox.stub(fs, "linkSync");

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

        expect(result.contextdir).to.equal("/tmp/pulumi-JU5c7AWT-B8Xz7TA4");
        expect(result.assets).to.have.lengthOf(2);
        expect(
            linkSync.calledWith(
                "/tmp/27a698a834ba2d1ec188867e28aab261f1a2e1a5a4fae97912393f8d8c79a1c4",
                "/tmp/pulumi-JU5c7AWT-B8Xz7TA4/mock-directory/asset1",
            ),
        ).to.be.true;
        expect(
            linkSync.calledWith(
                "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
                "/tmp/pulumi-JU5c7AWT-B8Xz7TA4/mock-directory/asset2",
            ),
        ).to.be.true;
    });

    it("should generate deterministic contex with sensitive asset", async function () {
        sandbox.stub(fs, "mkdirSync");
        sandbox.stub(fs, "rmSync");
        const linkSync = sandbox.stub(fs, "linkSync");

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

        expect(result.contextdir).to.equal("/tmp/pulumi-JU5c7AWT-XbmBIgL0");
        expect(result.assets).to.have.lengthOf(2);
        expect(
            linkSync.calledWith(
                "/tmp/4e17a41baf1a59f0094c4199628a2f19c7e1270dc5d9bba2aace6c28fde01141",
                "/tmp/pulumi-JU5c7AWT-XbmBIgL0/mock-directory/asset2",
            ),
        ).to.be.true;
    });

    it("should generate deterministic context with empty assets", async function () {
        sandbox.stub(fs, "mkdirSync");
        sandbox.stub(fs, "rmSync");
        const linkSync = sandbox.stub(fs, "linkSync");

        const result = await generateDeterministicContext([]);
        expect(result.contextdir).to.equal("/tmp/pulumi-JU5c7AWT-47DEQpj8");
        expect(result.assets).to.have.lengthOf(0);
        expect(linkSync.called).to.be.false;
    });
});
