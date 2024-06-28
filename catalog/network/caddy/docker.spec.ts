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
import { describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import * as caddy from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");

describe("(System/Network) caddy", () => {
    describe("Image", () => {
        it.runIf(isIntegration)("should build the image", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                return {
                    image: new caddy.Image(randomUUID(), { push: true }).ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "caddy",
                    projectName: "caddy",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "caddy",
                        runtime: "nodejs",
                        backend: {
                            url: `file://${tmpdir.name}`,
                        },
                    },
                },
            );
            const result = await stack.up();
            expect(result.summary.result).toBe("succeeded");
            expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/network\/caddy/);
            await stack.destroy();
        });
    });

    describe("Application", () => {
        it.runIf(isIntegration)("should run the application", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                const container = new caddy.Application(randomUUID(), {
                    configuration: new asset.FileAsset(`${__dirname}/fixtures/Caddyfile`),
                });
                return {
                    container: container.container.id,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "caddy",
                    projectName: "caddy",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "caddy",
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
