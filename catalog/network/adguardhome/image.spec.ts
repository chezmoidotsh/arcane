import { randomUUID } from "crypto";
import tmp from "tmp";
import { describe, expect, it } from "vitest";

import { automation } from "@pulumi/pulumi";

import { AdGuardHomeImage, Version } from "./image";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 10 * 60 * 1000; // 10 minutes

const AdGuardHomeImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/network/adguardhome:${Version}`;

describe.runIf(isIntegration)("(Network) AdGuardHome", () => {
    describe("AdGuardHomeImage", () => {
        it("should build the image", { timeout }, async () => {
            const program = async () => {
                const image = new AdGuardHomeImage(randomUUID(), { push: true, tags: [AdGuardHomeImageTag] });

                return {
                    image: image.ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "adguardhome",
                    projectName: "adguardhome",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "adguardhome",
                        runtime: "nodejs",
                        backend: {
                            url: `file://${tmpdir.name}`,
                        },
                    },
                },
            );

            try {
                const result = await stack.up();
                expect(result.summary.result).toBe("succeeded");
                expect(result.outputs?.image.value).toBeDefined();
                expect(result.outputs?.image.value).toContain(AdGuardHomeImageTag);
            } finally {
                await stack.destroy();
            }
        });
    });
});
