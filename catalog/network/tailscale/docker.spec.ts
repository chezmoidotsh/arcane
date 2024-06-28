/*
 * Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */
import { randomUUID } from "crypto";
import tmp from "tmp";
import { describe, expect, it, vi } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { StringAsset } from "@pulumi/pulumi/asset";

import { SecretAsset } from "@chezmoi.sh/core/utils";

import * as tailscale from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");

describe("(System/Network) tailscale", () => {
    describe("Image", () => {
        it.runIf(isIntegration)("should build the image", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                return {
                    image: new tailscale.Image(randomUUID(), { push: true }).ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
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
            const result = await stack.up();
            expect(result.summary.result).toBe("succeeded");
            expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/network\/tailscale/);
            await stack.destroy();
        });
    });

    describe("Application", () => {
        it.runIf(isIntegration)("should run the application", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                const container = new tailscale.Application(randomUUID(), {
                    authkey: new SecretAsset(new StringAsset("authkey")),

                    containerOpts: { start: false }, // Do not start the container
                });
                return {
                    container: container.container.id,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
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

            try {
                const result = await stack.up();
                expect(result.summary.result).toBe("succeeded");
                expect(result.outputs?.container.value).toBeDefined();
            } finally {
                await stack.destroy();
            }
        });

        it.runIf(isIntegration)(
            "should generate Tailscale CLI flags properly",
            { timeout: 10 * 60 * 1000 },
            async () => {
                const program = async () => {
                    const container = new tailscale.Application(randomUUID(), {
                        authkey: new SecretAsset(new StringAsset("authkey")),
                        ssh: true, // Validate --<flags>
                        acceptDNS: false, // Validate --<flags>=false
                        advertiseRoutes: ["0.0.0.0", "1.1.1.1"], // Validate --<flags>=<value1>,<value2>

                        containerOpts: { start: false }, // Do not start the container
                    });
                    return {
                        container: container.container.envs,
                    };
                };

                const tmpdir = tmp.dirSync();
                const stack = await automation.LocalWorkspace.createOrSelectStack(
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

                try {
                    const result = await stack.up();
                    expect(result.summary.result).toBe("succeeded");
                    expect(result.outputs?.container.value).toBeDefined();
                    expect((result.outputs?.container.value as string[]).sort()).toEqual([
                        "TS_AUTHKEY=authkey",
                        "TS_EXTRA_ARGS=--ssh --acceptDNS=false --advertiseRoutes=0.0.0.0,1.1.1.1",
                    ]);
                } finally {
                    await stack.destroy();
                }
            },
        );
    });
});
