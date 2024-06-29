import { randomUUID } from "crypto";
import tmp from "tmp";
import { describe, expect, it } from "vitest";

import { automation } from "@pulumi/pulumi";

import { GatusImage, Version } from "./image";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 10 * 60 * 1000; // 10 minutes

const GatusImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/observability/probes/gatus:${Version}`;

describe.runIf(isIntegration)("(Observability/Probes) Gatus", () => {
    describe("GatusImage", () => {
        it("should build the image", { timeout }, async () => {
            const program = async () => {
                const image = new GatusImage(randomUUID(), { push: true, tags: [GatusImageTag] });

                return {
                    image: image.ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
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

            try {
                const result = await stack.up();
                expect(result.summary.result).toBe("succeeded");
                expect(result.outputs?.image.value).toBeDefined();
                expect(result.outputs?.image.value).toContain(GatusImageTag);
            } finally {
                await stack.destroy();
            }
        });
    });
});
