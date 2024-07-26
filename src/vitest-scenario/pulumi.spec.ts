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
import { describe, expect, it } from "vitest";

import { pulumiScenario } from "./pulumi";

describe("#pulumiScenario", async () => {
    pulumiScenario(
        "should run a pulumi program",
        { timeout: 30 * 1000 },
        // -- Pulumi program
        async () => {
            return { helloWorld: "Hello, World!" };
        },
        // -- Assertions
        async (context) => {
            it("should output 'Hello, World!'", async () => {
                expect(context.result?.outputs.helloWorld.value).toEqual("Hello, World!");
            });
        },
    );
});
