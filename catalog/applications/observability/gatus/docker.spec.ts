import { randomUUID } from "crypto";
import Dockerode from "dockerode";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { AlpineImage } from "../../../os/alpine/3.19";
import { Gatus } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/os/alpine:${randomUUID()}`;
const GatusImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/observability/gatus:${randomUUID()}`;

describe.runIf(isIntegration)("(Network) Gatus", () => {
    describe("Gatus", () => {
        describe("when it is deployed", { timeout }, async () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [AlpineImageTag],
                });
                const gatus = new Gatus(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/gatus.yaml`),

                    imageArgs: { from: alpine, tags: [GatusImageTag] },
                    containerArgs: {
                        ports: [],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...gatus.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            let container: Dockerode.ContainerInspectInfo;
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
                container = await new Dockerode().getContainer(result.outputs?.id.value).inspect();
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be locally accessible", { concurrent: true, timeout: 500 }, async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:8080/health`);

                expect(response.ok).toBeTruthy();
                expect(await response.json()).toStrictEqual({ status: "UP" });
            });
        });
    });
});
