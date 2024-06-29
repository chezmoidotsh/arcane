import { randomUUID } from "crypto";
import tmp from "tmp";
import { describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { Gatus, Version } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 10 * 60 * 1000; // 10 minutes

const GatusImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/observability/probes/gatus:${Version}`;

describe.runIf(isIntegration)("(Observability/Probes) Gatus", () => {
    describe("Gatus", () => {
        it("should deploy the container", { timeout }, async () => {
            const program = async () => {
                const container = new Gatus(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/gatus.yaml`),
                    imageOpts: { push: true, tags: [GatusImageTag] },
                    containerOpts: { ports: [] },
                });
                return {
                    container: container.container.id,
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
                expect(result.outputs?.container.value).toBeDefined();
            } finally {
                await stack.destroy();
            }
        });
    });
});
