import fs from "fs";
import nock from "nock";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as buildkit from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import * as docker from "./docker";
import { SecretAsset } from "./asset";

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise((resolve) => output.apply(resolve));
}

describe("#InjectAssets", () => {
    const busybox = new buildkit.Image("busybox", {
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
        platforms: [buildkit.Platform.Linux_amd64, buildkit.Platform.Linux_arm64],
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
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "linkSync").mockReturnValue(undefined);
        vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
        vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);
        vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));

        const image = await docker.InjectAssets(busybox, {
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
            buildkit.Platform.Linux_amd64,
            buildkit.Platform.Linux_arm64,
        ]);
        await expect(promiseOf(image.pull)).resolves.toBe(true);
        await expect(promiseOf(image.push)).resolves.toBe(true);
        await expect(promiseOf(image.registries)).resolves.toEqual([
            { address: "oci.example.org", username: "user", password: "password" },
        ]);
        await expect(promiseOf(image.ssh)).resolves.toEqual([{ id: "0000" }]);

        // The tags should be overridden with injected.X suffixes to avoid conflicts
        // with the base image.
        await expect(promiseOf(image.tags)).resolves.toEqual(["oci.example.org/busybox:latest-injected.0"]);

        // All cache-related options should be overridden.
        await expect(promiseOf(image.noCache)).resolves.toBe(true);
        await expect(promiseOf(image.cacheFrom)).resolves.toBeUndefined();
        await expect(promiseOf(image.cacheTo)).resolves.toBeUndefined();

        // The target should be undefined because it's something used only by the
        // base image
        await expect(promiseOf(image.target)).resolves.toBeUndefined();
    });

    describe("when injection are recursively called", () => {
        beforeEach(() => {
            vi.spyOn(fs, "existsSync").mockReturnValue(true);
            vi.spyOn(fs, "linkSync").mockReturnValue(undefined);
            vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => false } as fs.Stats);
            vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);
            vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("file content"));
        });

        it(`should modify labels and tags when injecting 1 time`, async () => {
            let image = busybox;
            for (let i = 0; i < 1; i++) {
                image = await docker.InjectAssets(image, {
                    destination: "/hello-world.txt",
                    source: new StringAsset("hello-world.txt"),
                });
            }

            const labels = await promiseOf(image.labels);
            const tags = await promiseOf(image.tags);
            expect.soft(tags).toContain("oci.example.org/busybox:latest-injected.0");
            expect.soft(labels?.[`sh.chezmoi.injected.0.hash`]).toBeDefined();
        });

        it(`should modify labels and tags when injecting 2 times`, async () => {
            let image = busybox;
            for (let i = 0; i < 2; i++) {
                image = await docker.InjectAssets(image, {
                    destination: "/hello-world.txt",
                    source: new StringAsset("hello-world.txt"),
                });
            }

            const labels = await promiseOf(image.labels);
            const tags = await promiseOf(image.tags);
            expect.soft(tags).toContain("oci.example.org/busybox:latest-injected.1");
            expect.soft(labels?.[`sh.chezmoi.injected.0.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.1.hash`]).toBeDefined();
        });

        it(`should modify labels and tags when injecting 4 times`, async () => {
            let image = busybox;
            for (let i = 0; i < 4; i++) {
                image = await docker.InjectAssets(image, {
                    destination: "/hello-world.txt",
                    source: new StringAsset("hello-world.txt"),
                });
            }

            const labels = await promiseOf(image.labels);
            const tags = await promiseOf(image.tags);
            expect.soft(tags).toContain("oci.example.org/busybox:latest-injected.3");
            expect.soft(labels?.[`sh.chezmoi.injected.0.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.1.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.2.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.3.hash`]).toBeDefined();
        });

        it(`should modify labels and tags when injecting 8 times`, async () => {
            let image = busybox;
            for (let i = 0; i < 8; i++) {
                image = await docker.InjectAssets(image, {
                    destination: "/hello-world.txt",
                    source: new StringAsset("hello-world.txt"),
                });
            }

            const labels = await promiseOf(image.labels);
            const tags = await promiseOf(image.tags);
            expect.soft(tags).toContain("oci.example.org/busybox:latest-injected.7");
            expect.soft(labels?.[`sh.chezmoi.injected.0.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.1.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.2.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.3.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.4.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.5.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.6.hash`]).toBeDefined();
            expect.soft(labels?.[`sh.chezmoi.injected.7.hash`]).toBeDefined();
        });
    });

    describe("when no nothing wrong occurs", () => {
        it("should warn if no assets are provided", async () => {
            vi.spyOn(pulumi.log, "warn").mockResolvedValue();

            const image = await docker.InjectAssets(busybox);

            const busyboxRef = await promiseOf(busybox.ref);
            await expect(promiseOf(image.ref)).resolves.toBe(busyboxRef);
            expect(pulumi.log.warn).toHaveBeenCalledWith(
                "No assets provided to inject into the Docker image; the image will be unchanged.",
            );
        });

        it("should inject assets into the Dockerfile", async () => {
            const image = await docker.InjectAssets(
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
            const image = await docker.InjectAssets(busybox, {
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
            const image = await docker.InjectAssets(
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
            const image = await docker.InjectAssets(busybox, {
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

    describe("when something wrong occurs", () => {
        describe("with invalid FileAsset", () => {
            it("should throw error if asset path does not exist", async () => {
                vi.spyOn(fs, "existsSync").mockReturnValue(false);
                const writeFileSync = vi.spyOn(fs, "writeFileSync");

                const image = docker.InjectAssets(busybox, {
                    destination: "/mock-directory/file.txt",
                    source: new FileAsset("/mock-directory/file.txt"),
                });

                await expect(image).rejects.toThrow(
                    "Failed to open asset file '/mock-directory/file.txt': ENOENT: no such file or directory",
                );
                expect(writeFileSync).not.toHaveBeenCalled();
            });

            it("should throw error if asset path is a directory", async () => {
                vi.spyOn(fs, "existsSync").mockReturnValue(true);
                vi.spyOn(fs, "lstatSync").mockReturnValue({ isDirectory: () => true } as fs.Stats);
                const writeFileSync = vi.spyOn(fs, "writeFileSync");

                const image = docker.InjectAssets(busybox, {
                    destination: "/mock-directory",
                    source: new FileAsset("/mock-directory"),
                });

                await expect(image).rejects.toThrow("Asset '/mock-directory' is a directory; try using an archive");
                expect(writeFileSync).not.toHaveBeenCalled();
            });
        });

        describe("with invalid RemoteAsset", () => {
            it("should throw error if remote asset URI scheme is not supported", async () => {
                const writeFileSync = vi.spyOn(fs, "writeFileSync");

                const image = docker.InjectAssets(busybox, {
                    source: new RemoteAsset("ftp://example.com/remote.txt"),
                    destination: "/mock-directory/file.txt",
                });

                await expect(image).rejects.toThrow("Unsupported remote asset URI scheme 'ftp:'");
                expect(writeFileSync).not.toHaveBeenCalled();
            });

            it("should throw error for invalid remote asset URI", async () => {
                const writeFileSync = vi.spyOn(fs, "writeFileSync");

                const image = docker.InjectAssets(busybox, {
                    source: new RemoteAsset("invalid-uri"),
                    destination: "/mock-directory/file.txt",
                });

                await expect(image).rejects.toThrow("Invalid remote asset URI 'invalid-uri'");
                expect(writeFileSync).not.toHaveBeenCalled();
            });

            it("should throw error for failed fetch", async () => {
                nock("https://example.com").get("/remote.txt").reply(404);
                const writeFileSync = vi.spyOn(fs, "writeFileSync");

                const image = docker.InjectAssets(busybox, {
                    source: new RemoteAsset("https://example.com/remote.txt"),
                    destination: "/mock-directory/file.txt",
                });

                await expect(image).rejects.toThrow(
                    "Failed to fetch remote asset 'https://example.com/remote.txt' (404)",
                );
                expect(writeFileSync).not.toHaveBeenCalled();
            });
        });

        describe("with invalid Asset", () => {
            it("should throw error for unsupported asset type", async () => {
                const image = docker.InjectAssets(busybox, {
                    destination: "/hello-world.txt",
                    source: {},
                } as docker.InjectableAsset);

                await expect(image).rejects.toThrow("Unsupported asset type");
            });
        });

        it("should throw an error if there is several assets with the same destination", async () => {
            vi.spyOn(fs, "linkSync").mockReturnValue(undefined);
            vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
            vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
            vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);

            const image = docker.InjectAssets(
                busybox,
                {
                    source: new StringAsset("asset1"),
                    destination: "/mock-directory/asset1",
                },
                {
                    source: new StringAsset("asset2"),
                    destination: "/mock-directory/asset2",
                },
                {
                    source: new StringAsset("asset3"),
                    destination: "/mock-directory/asset1",
                },
                {
                    source: new StringAsset("asset4"),
                    destination: "/mock-directory/asset1",
                },
            );

            await expect(image).rejects.toThrow(
                "Several assets (#0, #2, #3) found with the same destination: /mock-directory/asset1",
            );
        });
    });
});

describe("#convertSuffixToRegex", () => {
    const cases = [
        { suffix: "-injected.{idx}", expected: "-injected\\.(\\d+)", match: "-injected.0" },
        { suffix: ".{+{{idx}", expected: "\\.\\{\\+\\{(\\d+)", match: ".{+{0" },
        { suffix: ".+.{idx}-.+*", expected: "\\.\\+\\.(\\d+)-\\.\\+\\*", match: ".+.0-.+*" },
        { suffix: "{{idx}}", expected: "\\{(\\d+)\\}", match: "{0}" },
        { suffix: "start-{idx}-end", expected: "start-(\\d+)-end", match: "start-0-end" },
        { suffix: "{idx}.{idx}.{idx}", expected: "(\\d+)\\.(\\d+)\\.(\\d+)", match: "0.0.0" },
        { suffix: "({idx}) and {idx}", expected: "\\((\\d+)\\) and (\\d+)", match: "(0) and 0" },
        { suffix: "a+b*{idx}?", expected: "a\\+b\\*(\\d+)\\?", match: "a+b*0?" },
        { suffix: "{idx}\\{idx}", expected: "(\\d+)\\\\(\\d+)", match: "0\\0" },
        { suffix: "!@#{idx}$%^", expected: "!@#(\\d+)\\$%\\^", match: "!@#0$%^" },
        { suffix: "[a-z]{idx}[A-Z]", expected: "\\[a-z\\](\\d+)\\[A-Z\\]", match: "[a-z]0[A-Z]" },
        { suffix: "*{idx}+{idx}?", expected: "\\*(\\d+)\\+(\\d+)\\?", match: "*0+0?" },
    ];

    for (const test of cases) {
        it(`should convert "${test.suffix}"`, () => {
            const rx = docker.convertSuffixToRegex(test.suffix);
            expect(rx.source).toBe(test.expected);
            expect(rx.test(test.match)).toBe(true);
        });
    }
});
