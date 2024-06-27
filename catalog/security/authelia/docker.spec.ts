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

import * as pulumi from "@pulumi/pulumi";
import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import * as authelia from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");

describe("(Security) Authelia", () => {
    describe("Image", () => {
        it.runIf(isIntegration)("should build the image", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                return {
                    image: new authelia.Image(randomUUID(), { push: true }).ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "authelia",
                    projectName: "authelia",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "authelia",
                        runtime: "nodejs",
                        backend: {
                            url: `file://${tmpdir.name}`,
                        },
                    },
                },
            );
            const result = await stack.up();
            expect(result.summary.result).toBe("succeeded");
            expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/security\/authelia/);
            await stack.destroy();
        });
    });

    describe("Application", () => {
        it.runIf(isIntegration)("should run the application", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                const container = new authelia.Application(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/configuration.yaml`),
                    userDatabase: {
                        source: new asset.FileAsset(`${__dirname}/fixtures/users_database.yaml`),
                        destination: "/etc/authelia/users_database.yml",
                    },
                    containerOpts: { wait: true },
                });
                return {
                    image: container.image.ref,
                    container: container.container.id,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "authelia",
                    projectName: "authelia",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "authelia",
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
                expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/security\/authelia/);
                expect(result.outputs?.container.value).toBeDefined();
            } finally {
                await stack.destroy();
            }
        });

        it.runIf(isIntegration)(
            "should log if something goes wrong during the build",
            { timeout: 10 * 60 * 1000 },
            async () => {
                const log_error = vi.spyOn(pulumi.log, "error");
                const program = async () => {
                    const container = new authelia.Application(randomUUID(), {
                        configuration: new asset.FileAsset(`${__dirname}/nonexistent.yaml`),
                        containerOpts: { wait: true },
                    });
                    return {
                        image: container.image.ref,
                        container: container.container.id,
                    };
                };

                const tmpdir = tmp.dirSync();
                const stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "authelia",
                        projectName: "authelia",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "authelia",
                            runtime: "nodejs",
                            backend: {
                                url: `file://${tmpdir.name}`,
                            },
                        },
                    },
                );

                try {
                    await expect(stack.up()).rejects.toThrow();
                    expect(log_error).toHaveBeenCalledWith(
                        `Failed to build the bundled Authelia image: Error: Failed to open asset file '${__dirname}/nonexistent.yaml': ENOENT: no such file or directory`,
                    );
                } finally {
                    await stack.destroy();
                }
            },
        );
    });
});
