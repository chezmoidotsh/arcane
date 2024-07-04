import * as dns from "dns/promises";
import { randomUUID } from "crypto";
import Dockerode from "dockerode";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { AlpineImage } from "../../../os/alpine/3.19";
import { AdGuardHome } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/os/alpine:${randomUUID()}`;
const AdGuardHomeImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/network/adguardhome:${randomUUID()}`;

describe.runIf(isIntegration)("(Network) AdGuardHome", () => {
    describe("AdGuardHome", () => {
        describe("when it is deployed", { timeout }, async () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [AlpineImageTag],
                });
                const adguardhome = new AdGuardHome(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/AdGuardHome.yaml`),

                    imageArgs: { from: alpine, tags: [AdGuardHomeImageTag] },
                    containerArgs: {
                        ports: [],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...adguardhome.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            let container: Dockerode.ContainerInspectInfo;
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
                container = await new Dockerode().getContainer(result.outputs?.id.value).inspect();
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be locally accessible", { concurrent: true }, async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:3000/`, { timeout: 500 });

                expect(response.ok).toBeTruthy();
            });

            it("should be able to resolve DNS queries", { concurrent: true }, async () => {
                // NOTE: validate that current host is able to resolve DNS queries
                expect(await dns.resolve4("one.one.one.one")).toEqual(expect.arrayContaining(["1.1.1.1"]));

                const resolver = new dns.Resolver();
                resolver.setServers([`${container.NetworkSettings.IPAddress}:3053`]);
                expect(await resolver.resolve4("one.one.one.one")).toEqual(expect.arrayContaining(["1.1.1.1"]));
            });
        });
    });
});
