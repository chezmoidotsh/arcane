import * as dns from "dns/promises";
import { randomUUID } from "crypto";
import { getRandomPort } from "get-port-please";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { AlpineImage, Version as AlpineVersion } from "../../../os/alpine/3.19";
import { AdGuardHome, Version } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const AdGuardHomeImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/network/adguardhome:${Version}`;

describe.runIf(isIntegration)("(Network) AdGuardHome", () => {
    describe("AdGuardHome", () => {
        describe("when it is deployed", { timeout }, async () => {
            const ports = {
                dns: await getRandomPort(),
                http: await getRandomPort(),
            };

            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
                const adguardhome = new AdGuardHome(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/AdGuardHome.yaml`),

                    imageArgs: { from: alpine, push: true, tags: [AdGuardHomeImageTag] },
                    containerArgs: {
                        ports: [
                            { internal: 3000, external: ports.http, protocol: "tcp" },
                            { internal: 3053, external: ports.dns, protocol: "udp" },
                        ],
                        wait: true,
                    },
                });
                return { ...adguardhome.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
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
                result = await stack.up();
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be locally accessible", { concurrent: true }, async () => {
                const response = await fetch(`http://localhost:${ports.http}/`);

                expect(response.ok).toBeTruthy();
            });

            it("should be able to resolve DNS queries", { concurrent: true }, async () => {
                // NOTE: validate that current host is able to resolve DNS queries
                expect(await dns.resolve4("one.one.one.one")).toEqual(expect.arrayContaining(["1.1.1.1"]));

                const resolver = new dns.Resolver();
                resolver.setServers([`127.0.0.1:${ports.dns}`]);
                expect(await resolver.resolve4("one.one.one.one")).toEqual(expect.arrayContaining(["1.1.1.1"]));
            });
        });
    });
});
