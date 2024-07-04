import { randomUUID } from "crypto";
import tmp from "tmp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { automation } from "@pulumi/pulumi";

import { AlpineImage, Version as AlpineVersion } from "@catalog.chezmoi.sh/os~alpine-3.19";

import { GatusImage, Version } from "./image";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 3 * 60 * 1000; // 3 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const GatusImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/observability/gatus:${Version}`;

describe.runIf(isIntegration)("(Network) Gatus", () => {
    describe("GatusImage", () => {
        // -- Prepare Pulumi execution --
        const program = async () => {
            const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
            const gatus = new GatusImage(randomUUID(), {
                from: alpine,
                tags: [GatusImageTag],
            });
            return { ...gatus };
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

        afterAll(async () => {
            await stack.destroy();
        }, timeout);

        // -- Assertions --
        it("should be successfully built", () => {
            expect(result.summary.result).toBe("succeeded");
            expect(result.outputs?.ref.value).toContain(GatusImageTag);
        });
    });
});
