import { randomUUID } from "crypto";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { StringAsset } from "@pulumi/pulumi/asset";

import { SecretAsset } from "@chezmoi.sh/core/utils";

import { AlpineImage, Version as AlpineVersion } from "../../../os/alpine/3.19";
import { Tailscale, Version } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 3 * 60 * 1000; // 3 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const TailscaleImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/network/tailscale:${Version}`;

describe.runIf(isIntegration)("(Network) Tailscale", () => {
    describe("Tailscale", () => {
        describe("when it is deployed", { timeout }, () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
                const tailscale = new Tailscale(randomUUID(), {
                    authkey: new SecretAsset(new StringAsset("authkey")),
                    acceptDNS: false,
                    acceptRoutes: true,
                    advertiseRoutes: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],

                    imageArgs: { from: alpine, tags: [TailscaleImageTag] },
                    containerArgs: {
                        wait: false, // Tailscale cannot be healthy without a valid authkey
                    },
                });
                return { ...tailscale.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "tailscale",
                        projectName: "tailscale",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "tailscale",
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
            it("environment should be correctly configured", () => {
                const envs = result.outputs?.envs.value as string[];

                expect(envs).toEqual(
                    expect.arrayContaining([
                        "TS_AUTHKEY=authkey",
                        "TS_EXTRA_ARGS=--accept-dns=false --accept-routes --advertise-routes=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
                    ]),
                );
            });
        });
    });
});
