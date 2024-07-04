import { randomUUID } from "crypto";
import Dockerode from "dockerode";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { AlpineImage } from "@catalog.chezmoi.sh/os~alpine-3.19";

import { Caddy } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/os/alpine:${randomUUID()}`;
const CaddyImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/network/caddy:${randomUUID()}`;

describe.runIf(isIntegration)("(Network) Caddy", () => {
    describe("Caddy", () => {
        describe("when it is deployed", { timeout }, async () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [AlpineImageTag],
                });
                const caddy = new Caddy(randomUUID(), {
                    caddyfile: new asset.FileAsset(`${__dirname}/fixtures/Caddyfile`),
                    layer4: new asset.FileAsset(`${__dirname}/fixtures/layer4.json`),

                    imageArgs: { from: alpine, tags: [CaddyImageTag] },
                    containerArgs: {
                        ports: [],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...caddy.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            let container: Dockerode.ContainerInspectInfo;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "caddy",
                        projectName: "caddy",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "caddy",
                            runtime: "nodejs",
                            backend: {
                                url: `file://${tmpdir.name}`,
                            },
                        },
                    },
                );
                result = await stack.up();
                container = await new Dockerode().getContainer(result.outputs?.id.value).inspect();
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be locally accessible", { concurrent: true }, async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:8080/`, { timeout: 500 });

                expect(response.ok).toBeTruthy();
                expect(await response.text()).toContain("Hello, world!");
            });

            it("should be able to use the embedded error pages", { concurrent: true }, async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:8080/404`, {
                    timeout: 500,
                });

                expect(response.ok).not.toBeTruthy();
                expect(response.status).toBe(404);
                expect(response.text()).resolves.toContain("Error 404: Not Found");
            });

            it("should be able to proxify using l4 configuration", { concurrent: true }, async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:5000/`, {
                    headers: { Host: "1.1.1.1" },
                    redirect: "manual",
                    timeout: 500,
                });

                expect(response.status).toBe(301);
            });
        });
    });
});
