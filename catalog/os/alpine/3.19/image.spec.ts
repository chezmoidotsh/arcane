import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

import * as pulumi from "@pulumi/pulumi";

import { pulumiScenario } from "@pulumi.chezmoi.sh/vitest-scenario/pulumi";

import { AlpineImage } from "./image";

describe("(OS) Alpine 3.19", () => {
    const alpineTag = `oci.local.chezmoi.sh:5000/os/alpine:${randomUUID()}`;

    pulumiScenario(
        "when the image is built",
        { timeout: 15 * 60 * 1000 },
        // -- Pulumi program
        async () => {
            const alpine = new AlpineImage(randomUUID(), {
                builder: { name: "pulumi-buildkit" },
                exports: [{ image: { ociMediaTypes: true, push: true } }],
                push: false,
                tags: [alpineTag],
            });
            return { ref: alpine.ref };
        },
        // -- Assertions
        async (context) => {
            it("should be pushed the image in the registry", async () => {
                const ref = context.result?.outputs.ref.value as string | undefined;
                expect(ref).toBeDefined();

                const [tag, digest] = ref!.split("@");
                expect(tag).toBe(alpineTag);
                expect(digest).not.toBe("");
            });
        },
    );
});
