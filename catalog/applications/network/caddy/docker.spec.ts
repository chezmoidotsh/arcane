import { randomUUID } from "crypto";
import { getRandomPort } from "get-port-please";
import fetch, { Request } from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { AlpineImage, Version as AlpineVersion } from "../../../os/alpine/3.19";
import { Caddy, Version } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const CaddyImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/network/caddy:${Version}`;

describe.runIf(isIntegration)("(Network) Caddy", () => {
    describe("Caddy", () => {
        describe("when it is deployed", { timeout }, async () => {
            const ports = {
                http: await getRandomPort(),
                layer7: await getRandomPort(),
            };

            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
                const caddy = new Caddy(randomUUID(), {
                    caddyfile: new asset.FileAsset(`${__dirname}/fixtures/Caddyfile`),
                    layer4: new asset.FileAsset(`${__dirname}/fixtures/layer4.json`),

                    imageArgs: { from: alpine, push: true, tags: [CaddyImageTag] },
                    containerArgs: {
                        ports: [
                            { internal: 8080, external: ports.http, protocol: "tcp" },
                            { internal: 5000, external: ports.layer7, protocol: "tcp" },
                        ],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...caddy.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
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
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be locally accessible", { concurrent: true, timeout: 500 }, async () => {
                const response = await fetch(`http://localhost:${ports.http}/`);

                expect(response.ok).toBeTruthy();
                expect(await response.text()).toContain("Hello, world!");
            });

            it("should be able to use the embedded error pages", { concurrent: true, timeout: 500 }, async () => {
                const request = new Request(`http://localhost:${ports.http}/404`, { timeout: 250 });
                const response = await fetch(request);

                expect(response.ok).not.toBeTruthy();
                expect(response.status).toBe(404);
                expect(response.text()).resolves.toContain("Error 404: Not Found");
            });

            it("should be able to proxify using l4 configuration", { concurrent: true, timeout: 50000 }, async () => {
                const request = new Request(`http://localhost:${ports.layer7}/`, {
                    headers: { Host: "1.1.1.1" },
                    redirect: "manual",
                    // timeout: 250,
                });
                const response = await fetch(request);

                expect(response.status).toBe(301);
            });
        });
    });
});
