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
import { describe, expect, it } from "vitest";

import { AlpineImage } from "@catalog.chezmoi.sh/os~alpine-3.19";
import { pulumiScenario } from "@pulumi.chezmoi.sh/vitest-scenario/pulumi";

import { TraefikImage } from "./image";

describe("(Network) Traefik", () => {
    const alpineTag = `oci.local.chezmoi.sh:5000/os/alpine:${randomUUID()}`;
    const traefikTag = `oci.local.chezmoi.sh:5000/system/network/traefik:${randomUUID()}`;

    pulumiScenario(
        "TraefikImage",
        { timeout: 15 * 60 * 1000 },
        async () => {
            const alpine = new AlpineImage(randomUUID(), {
                builder: { name: "pulumi-buildkit" },
                buildOnPreview: false,
                exports: [{ image: { ociMediaTypes: true, push: true } }],
                push: false,
                tags: [alpineTag],
            });
            const traefik = new TraefikImage(
                randomUUID(),
                {
                    from: alpine,
                    tags: [traefikTag],
                },
                { dependsOn: [alpine] },
            );
            return { ref: traefik.ref };
        },
        async (context) => {
            it("should be pushed the image in the registry", async () => {
                const ref = context.result?.outputs.ref.value as string | undefined;
                expect(ref).toBeDefined();

                const [tag, digest] = ref!.split("@");
                expect(tag).toBe(traefikTag);
                expect(digest).not.toBe("");
            });
        },
    );
});
