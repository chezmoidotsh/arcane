import { randomUUID } from "crypto";
import tmp from "tmp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { automation } from "@pulumi/pulumi";

import { AlpineImage, Version } from "./image";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 60 * 1000; // 1 minute

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${Version}`;

describe.runIf(isIntegration)("(OS) Alpine 3.19", () => {
    describe("AlpineImage", () => {
        describe("when it is built", { timeout }, () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), {
                    push: true,
                    tags: [AlpineImageTag],
                });
                return { ...alpine };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "alpine",
                        projectName: "alpine",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "alpine",
                            runtime: "nodejs",
                            backend: {
                                url: `file://${tmpdir.name}`,
                            },
                        },
                    },
                );
                result = await stack.up();
            }, timeout);

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be successfully built", () => {
                expect(result.summary.result).toBe("succeeded");
                expect(result.outputs?.ref.value).toContain(AlpineImageTag);
            });
        });
    });
});
