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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as buildx from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import { StringAsset } from "@pulumi/pulumi/asset";

import * as docker from "./docker";
import { SecretAsset } from "./asset";

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

    beforeAll(() => {
        // Put Pulumi in unit-test mode, mocking all calls to cloud-provider APIs.
        pulumi.runtime.setMocks(
            {
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
            },
            "project",
            "stack",
            false,
            "org",
        );
    });

    beforeEach(() => {
        // Mock the organization, project, and stack that the tests are running in.
        // These lines are required for all tests that make use of the Pulumi SDK because
        // they causes endless loops in the Pulumi runtime if not mocked.
        vi.spyOn(pulumi.runtime, "getOrganization").mockReturnValue("org");
        vi.spyOn(pulumi.runtime, "getProject").mockReturnValue("project");
        vi.spyOn(pulumi.runtime, "getStack").mockReturnValue("stack");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should copy the base image configuration", async () => {
        const image = docker.InjectAssets(busybox, {
            destination: "/hello-world.txt",
            source: new StringAsset("hello-world.txt"),
        });

        await expect(promiseOf(image.builder)).resolves.toEqual({ name: "default" });
        await expect(promiseOf(image.buildOnPreview)).resolves.toBe(true);
        await expect(promiseOf(image.dockerfile).then((v) => v?.inline)).resolves.toBe(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-JU5c7AWT-Jz2nHA2W



FROM undefined
COPY --from=0 /tmp/pulumi-JU5c7AWT-Jz2nHA2W /`);
        await expect(promiseOf(image.exec)).resolves.toBe(true);
        await expect(promiseOf(image.exports)).resolves.toEqual([{ oci: { dest: "oci.example.org/busybox:latest" } }]);
        await expect(promiseOf(image.labels)).resolves.toEqual({
            "com.example.label": "value",
            "sh.chezmoi.injected.0.hash": "Jz2nHA2W+C3+OvbNIF6umtt+Cy5P0eTImhEd2mJkVcE=",
        });
        await expect(promiseOf(image.load)).resolves.toBe(true);
        await expect(promiseOf(image.network)).resolves.toBe("default");
        await expect(promiseOf(image.platforms)).resolves.toEqual([
            buildx.Platform.Linux_amd64,
            buildx.Platform.Linux_arm64,
        ]);
        await expect(promiseOf(image.pull)).resolves.toBe(true);
        await expect(promiseOf(image.push)).resolves.toBe(true);
        await expect(promiseOf(image.registries)).resolves.toEqual([
            { address: "oci.example.org", username: "user", password: "password" },
        ]);
        await expect(promiseOf(image.ssh)).resolves.toEqual([{ id: "0000" }]);
        await expect(promiseOf(image.tags)).resolves.toEqual(["oci.example.org/busybox:latest"]);

        // All cache-related options should be overridden.
        await expect(promiseOf(image.noCache)).resolves.toBe(true);
        await expect(promiseOf(image.cacheFrom)).resolves.toBeUndefined();
        await expect(promiseOf(image.cacheTo)).resolves.toBeUndefined();

        // The target should be undefined because it's something used only by the
        // base image
        await expect(promiseOf(image.target)).resolves.toBeUndefined();
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

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).resolves.toBe(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-JU5c7AWT-e/f07zhv

RUN chmod 600 /tmp/pulumi-JU5c7AWT-e/f07zhv/goodbye-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-JU5c7AWT-e/f07zhv /`);
        await expect(promiseOf(image.secrets)).resolves.toEqual({});
    });

    it("should inject assets into the Dockerfile with chown", async () => {
        const image = docker.InjectAssets(busybox, {
            destination: "/hello-world.txt",
            source: new StringAsset("hello-world.txt"),
            user: "bumblebee",
        });

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).resolves.toBe(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-JU5c7AWT-Jz2nHA2W

RUN chown bumblebee /tmp/pulumi-JU5c7AWT-Jz2nHA2W/hello-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-JU5c7AWT-Jz2nHA2W /`);
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

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).resolves.toBe(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-JU5c7AWT-e/f07zhv
RUN mkdir -p /tmp/pulumi-JU5c7AWT-e/f07zhv
RUN --mount=type=secret,id=asset0 base64 -d /run/secrets/asset0 > /tmp/pulumi-JU5c7AWT-e/f07zhv/goodbye-world.txt
RUN chmod 600 /tmp/pulumi-JU5c7AWT-e/f07zhv/goodbye-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-JU5c7AWT-e/f07zhv /`);
        await expect(promiseOf(image.secrets)).resolves.toEqual({ asset0: "Z29vZGJ5ZS13b3JsZC50eHQ=" });
    });

    it("should inject assets into the Dockerfile with chown and sensitive assets", async () => {
        const image = docker.InjectAssets(busybox, {
            destination: "/hello-world.txt",
            source: new SecretAsset(new StringAsset("hello-world.txt")),
            user: "bumblebee",
        });

        await expect(promiseOf(image.dockerfile).then((d) => d?.inline)).resolves.toBe(`FROM ${docker.busybox}
COPY --from=undefined /etc/passwd /etc/group /etc/
COPY . /tmp/pulumi-JU5c7AWT-Jz2nHA2W
RUN mkdir -p /tmp/pulumi-JU5c7AWT-Jz2nHA2W
RUN --mount=type=secret,id=asset0 base64 -d /run/secrets/asset0 > /tmp/pulumi-JU5c7AWT-Jz2nHA2W/hello-world.txt
RUN chown bumblebee /tmp/pulumi-JU5c7AWT-Jz2nHA2W/hello-world.txt

FROM undefined
COPY --from=0 /tmp/pulumi-JU5c7AWT-Jz2nHA2W /`);
        await expect(promiseOf(image.secrets)).resolves.toEqual({ asset0: "aGVsbG8td29ybGQudHh0" });
    });
});
