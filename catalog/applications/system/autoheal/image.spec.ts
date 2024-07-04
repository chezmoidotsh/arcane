import { randomUUID } from "crypto";
import tmp from "tmp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { automation } from "@pulumi/pulumi";

import { AlpineImage, Version as AlpineVersion } from "@catalog.chezmoi.sh/os~alpine-3.19";

import { AutoHealImage, Version } from "./image";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const AutoHealImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/system/autoheal:${Version}`;

describe.runIf(isIntegration)("(System) AutoHeal", () => {
    describe("AutoHealImage", () => {
        // -- Prepare Pulumi execution --
        const program = async () => {
            const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
            const autoheal = new AutoHealImage(randomUUID(), {
                from: alpine,
                tags: [AutoHealImageTag],
            });
            return { ...autoheal };
        };

        let stack: automation.Stack;
        let result: automation.UpResult;
        beforeAll(async () => {
            const tmpdir = tmp.dirSync();
            stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "autoheal",
                    projectName: "autoheal",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "autoheal",
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
            expect(result.outputs?.ref.value).toContain(AutoHealImageTag);
        });
    });
});
