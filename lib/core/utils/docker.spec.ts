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
import sinon from "sinon";
import tmp from "tmp";

import * as buildx from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import { StringAsset } from "@pulumi/pulumi/asset";

import * as docker from "./docker";
import { SecretAsset } from "./asset";

chai.use(chaiAsPromised);

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise((resolve) => output.apply(resolve));
}

describe("#InjectAssets", () => {
    const busybox = new buildx.Image("busybox", {
        builder: { name: "default" },
        buildOnPreview: true,
        cacheFrom: [{ gha: { url: "https://example.org" } }],
        cacheTo: [{ gha: { url: "https://example.org" } }],
        dockerfile: { inline: "FROM busybox" },
        exec: true,
        exports: [{ oci: { dest: "oci.example.org/busybox:latest" } }],
        labels: { "com.example.label": "value" },
        load: true,
        network: "default",
        noCache: false,
        platforms: [buildx.Platform.Linux_amd64, buildx.Platform.Linux_arm64],
        pull: true,
        push: true,
        registries: [{ address: "oci.example.org", username: "user", password: "password" }],
        ssh: [{ id: "0000" }],
        tags: ["oci.example.org/busybox:latest"],
        target: "target",
    });
    let sandbox: sinon.SinonSandbox;

    before(() => {
        // Put Pulumi in unit-test mode, mocking all calls to cloud-provider APIs.
        pulumi.runtime.setMocks({
            // Mock requests to provision cloud resources and return a canned response.
            newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: any } => {
                // Here, we're returning a same-shaped object for all resource types.
                // We could, however, use the arguments passed into this function to
                // customize the mocked-out properties of a particular resource based
                // on its type. See the unit-testing docs for details:
                // https://www.pulumi.com/docs/using-pulumi/testing/unit
                return {
                    id: `${args.name}-id`,
                    state: args.inputs,
                };
            },

            // Mock function calls and return whatever input properties were provided.
            call: (args: pulumi.runtime.MockCallArgs) => {
                return args.inputs;
            },
        });

        // Mock the organization, project, and stack that the tests are running in.
        // These lines are required for all tests that make use of the Pulumi SDK because
        // they causes endless loops in the Pulumi runtime if not mocked.
        sinon.stub(pulumi.runtime, "getOrganization").returns("org");
        sinon.stub(pulumi.runtime, "getProject").returns("projetc");
        sinon.stub(pulumi.runtime, "getStack").returns("stack");
    });

    after(() => {
        // Reset all mocks to their original implementations.
        sinon.restore();
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("should copy the base image configuration", async () => {
        const image = docker.InjectAssets(busybox, {
            destination: "/hello-world.txt",
            source: new StringAsset("hello-world.txt"),
        });

        await expect(promiseOf(image.builder)).to.eventually.deep.equal({ name: "default" });
        await expect(promiseOf(image.buildOnPreview)).to.eventually.equal(true);
        await expect(promiseOf(image.dockerfile).then((v) => v?.inline)).to.eventually.equal(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-Dfv+mrtu-Jz2nHA2W



FROM undefined
COPY --from=0 /tmp/pulumi-Dfv+mrtu-Jz2nHA2W /`);
        await expect(promiseOf(image.exec)).to.eventually.equal(true);
        await expect(promiseOf(image.exports)).to.eventually.deep.equal([
            { oci: { dest: "oci.example.org/busybox:latest" } },
        ]);
        await expect(promiseOf(image.labels)).to.eventually.deep.equal({
            "com.example.label": "value",
            "sh.chezmoi.injected.0.hash": "Jz2nHA2W+C3+OvbNIF6umtt+Cy5P0eTImhEd2mJkVcE=",
        });
        await expect(promiseOf(image.load)).to.eventually.equal(true);
        await expect(promiseOf(image.network)).to.eventually.equal("default");
        await expect(promiseOf(image.platforms)).to.eventually.deep.equal([
            buildx.Platform.Linux_amd64,
            buildx.Platform.Linux_arm64,
        ]);
        await expect(promiseOf(image.pull)).to.eventually.equal(true);
        await expect(promiseOf(image.push)).to.eventually.equal(true);
        await expect(promiseOf(image.registries)).to.eventually.deep.equal([
            { address: "oci.example.org", username: "user", password: "password" },
        ]);
        await expect(promiseOf(image.ssh)).to.eventually.deep.equal([{ id: "0000" }]);
        await expect(promiseOf(image.tags)).to.eventually.deep.equal(["oci.example.org/busybox:latest"]);

        // All cache-related options should be overridden.
        await expect(promiseOf(image.noCache)).to.eventually.equal(true);
        await expect(promiseOf(image.cacheFrom)).to.eventually.be.undefined;
        await expect(promiseOf(image.cacheTo)).to.eventually.be.undefined;

        // The target should be undefined because it's something used only by the
        // base image
        await expect(promiseOf(image.target)).to.eventually.be.undefined;
    });

    it("should inject assets into the Dockerfile", async () => {
        const image = docker.InjectAssets(
            busybox,
            {
                destination: "/hello-world.txt",
                source: new StringAsset("hello-world.txt"),
            },
            {
                destination: "/goodbye-world.txt",
                source: new StringAsset("goodbye-world.txt"),
                mode: 0o600,
            },
        );

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).to.eventually.equal(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-Dfv+mrtu-e/f07zhv

RUN chmod 600 /tmp/pulumi-Dfv+mrtu-e/f07zhv/goodbye-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-Dfv+mrtu-e/f07zhv /`);
        await expect(promiseOf(image.secrets)).to.eventually.deep.equal({});
    });

    it("should inject assets into the Dockerfile with chown", async () => {
        const image = docker.InjectAssets(busybox, {
            destination: "/hello-world.txt",
            source: new StringAsset("hello-world.txt"),
            user: "bumblebee",
        });

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).to.eventually.equal(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-Dfv+mrtu-Jz2nHA2W

RUN chown bumblebee /tmp/pulumi-Dfv+mrtu-Jz2nHA2W/hello-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-Dfv+mrtu-Jz2nHA2W /`);
    });

    it("should inject assets into the Dockerfile with sensitive assets", async () => {
        const image = docker.InjectAssets(
            busybox,
            {
                destination: "/hello-world.txt",
                source: new StringAsset("hello-world.txt"),
            },
            {
                destination: "/goodbye-world.txt",
                source: new SecretAsset(new StringAsset("goodbye-world.txt")),
                mode: 0o600,
            },
        );

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).to.eventually.equal(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-Dfv+mrtu-e/f07zhv
RUN mkdir -p /tmp/pulumi-Dfv+mrtu-e/f07zhv
RUN --mount=type=secret,id=asset0 base64 -d /run/secrets/asset0 > /tmp/pulumi-Dfv+mrtu-e/f07zhv/goodbye-world.txt
RUN chmod 600 /tmp/pulumi-Dfv+mrtu-e/f07zhv/goodbye-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-Dfv+mrtu-e/f07zhv /`);
        await expect(promiseOf(image.secrets)).to.eventually.deep.equal({ asset0: "Z29vZGJ5ZS13b3JsZC50eHQ=" });
    });

    it("should inject assets into the Dockerfile with chown and sensitive assets", async () => {
        const image = docker.InjectAssets(busybox, {
            destination: "/hello-world.txt",
            source: new SecretAsset(new StringAsset("hello-world.txt")),
            user: "bumblebee",
        });

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).to.eventually.equal(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-Dfv+mrtu-Jz2nHA2W
RUN mkdir -p /tmp/pulumi-Dfv+mrtu-Jz2nHA2W
RUN --mount=type=secret,id=asset0 base64 -d /run/secrets/asset0 > /tmp/pulumi-Dfv+mrtu-Jz2nHA2W/hello-world.txt
RUN chown bumblebee /tmp/pulumi-Dfv+mrtu-Jz2nHA2W/hello-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-Dfv+mrtu-Jz2nHA2W /`);
        await expect(promiseOf(image.secrets)).to.eventually.deep.equal({ asset0: "aGVsbG8td29ybGQudHh0" });
    });
});
