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

import * as alpine from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");

describe("(OS) Alpine 3.19", () => {
    describe("Image", () => {
        it.runIf(isIntegration)("should build the image", { timeout: 60 * 1000 }, async () => {
            const program = async () => {
                return {
                    image: new alpine.Image(randomUUID(), { push: true }).ref,
                };
            };

            const tmpdir = tmp.dirSync();
            const stack = await automation.LocalWorkspace.createOrSelectStack(
                {
                    stackName: "alpine-3.19",
                    projectName: "alpine",
                    program,
                },
                {
                    secretsProvider: "passphrase",
                    projectSettings: {
                        name: "alpine",
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
                expect(result.outputs?.image.value).toMatch(/^oci\.local\.chezmoi\.sh\/os\/alpine:3\.19/);
            } finally {
                await stack.destroy();
            }
        });
    });
});
