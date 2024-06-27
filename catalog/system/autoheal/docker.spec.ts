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

import * as autoheal from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");

describe("(System) autoheal", () => {
    describe("Image", () => {
        it.runIf(isIntegration)("should build the image", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                return {
                    image: new autoheal.Image(randomUUID(), { push: true }).ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "autoheal",
                    projectName: "autoheal",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "autoheal",
                        runtime: "nodejs",
                        backend: {
                            url: `file://${tmpdir.name}`,
                        },
                    },
                },
            );
            const result = await stack.up();
            expect(result.summary.result).toBe("succeeded");
            expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/system\/autoheal/);
            await stack.destroy();
        });
    });

    describe("Application", () => {
        it.runIf(isIntegration)("should run the application", { timeout: 10 * 60 * 1000 }, async () => {
            const program = async () => {
                const container = new autoheal.Application(randomUUID(), {
                    container_label: "autoheal",
                    default_graceful_period: 5,
                    docker_timeout: 10,
                    interval: 15,
                    start_period: 10,
                    containerOpts: { wait: true, envs: ["UNEXPECTED_ENV=value"] },
                });
                return {
                    image: container.image.ref,
                    container: container.container.id,
                    environment: container.container.envs,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "autoheal",
                    projectName: "autoheal",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "autoheal",
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
                expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/system\/autoheal/);
                expect(result.outputs?.container.value).toBeDefined();
                expect((result.outputs?.environment.value as Array<string>).sort()).toEqual([
                    "AUTOHEAL_CONTAINER_LABEL=autoheal",
                    "AUTOHEAL_DEFAULT_STOP_TIMEOUT=5",
                    "AUTOHEAL_INTERVAL=15",
                    "AUTOHEAL_START_PERIOD=10",
                    "CURL_TIMEOUT=10",
                    "UNEXPECTED_ENV=value",
                ]);
            } finally {
                await stack.destroy();
            }
        });
    });
});
