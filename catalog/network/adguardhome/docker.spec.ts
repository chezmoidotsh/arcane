import { randomUUID } from "crypto";
import tmp from "tmp";
import { describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import * as adguardhome from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 10 * 60 * 1000; // 10 minutes

const AdGuardHomeImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/network/adguardhome:${adguardhome.Version}`;

describe.runIf(isIntegration)("(Network) AdGuardHome", () => {
    describe("AdGuardHome", () => {
        it("should deploy the container", { timeout }, async () => {
            const program = async () => {
                const container = new adguardhome.AdGuardHome(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/AdGuardHome.yaml`),
                    imageOpts: { push: true, tags: [AdGuardHomeImageTag] },
                    containerOpts: { ports: [] },
                });
                return {
                    container: container.container.id,
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
                expect(result.outputs?.container.value).toBeDefined();
            } finally {
                await stack.destroy();
            }
        });
    });
});
