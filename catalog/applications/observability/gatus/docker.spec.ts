import { randomUUID } from "crypto";
import { getRandomPort } from "get-port-please";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { AlpineImage, Version as AlpineVersion } from "../../../os/alpine/3.19";
import { Gatus, Version } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const GatusImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/observability/gatus:${Version}`;

describe.runIf(isIntegration)("(Network) Gatus", () => {
    describe("Gatus", () => {
        describe("when it is deployed", { timeout }, async () => {
            const ports = {
                http: await getRandomPort(),
            };

            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
                const gatus = new Gatus(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/gatus.yaml`),

                    imageArgs: { from: alpine, tags: [GatusImageTag] },
                    containerArgs: {
                        ports: [{ internal: 8080, external: ports.http, protocol: "tcp" }],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...gatus.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "gatus",
                        projectName: "gatus",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "gatus",
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
                const response = await fetch(`http://localhost:${ports.http}/health`);

                expect(response.ok).toBeTruthy();
                expect(await response.json()).toStrictEqual({ status: "UP" });
            });
        });
    });
});
