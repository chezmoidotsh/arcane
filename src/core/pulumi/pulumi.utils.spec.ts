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

import * as pulumi from "@pulumi/pulumi";

import { getProvider, optsWithProvider } from "./pulumi.utils";

describe("#getProvider", () => {
    it("should return the current provider if is the same as the given provider", () => {
        const provider = { isInstance: (_: any) => true } as any;
        const opts: pulumi.ComponentResourceOptions = { provider: provider };

        expect(getProvider(provider, opts)).toBe(provider);
    });

    it("should return the provider if found (array of provider)", () => {
        const provider = { isInstance: (_: any) => true } as any;
        const opts: pulumi.ComponentResourceOptions = { providers: [provider] };

        expect(getProvider(provider, opts)).toBe(provider);
    });

    it("should return the provider if found (object of provider)", () => {
        const provider = { isInstance: (_: any) => true } as any;
        const opts: pulumi.ComponentResourceOptions = { providers: { provider: provider } };

        expect(getProvider(provider, opts)).toBe(provider);
    });

    it("should return undefined if provider is not found (array of provider)", () => {
        const provider = { isInstance: (_: any) => false } as any;
        const opts: pulumi.ComponentResourceOptions = { providers: [provider] };

        expect(getProvider(provider, opts)).toBeUndefined();
    });

    it("should return undefined if provider is not found (object of provider)", () => {
        const provider = { isInstance: (_: any) => false } as any;
        const opts: pulumi.ComponentResourceOptions = { providers: { provider: provider } };

        expect(getProvider(provider, opts)).toBeUndefined();
    });

    it("should return undefined when no providers are provided", () => {
        const provider = { isInstance: (_: any) => true } as any;
        const opts: pulumi.ComponentResourceOptions = {};

        expect(getProvider(provider, opts)).toBeUndefined();
    });

    it("should return undefined when no options is provided", () => {
        const provider = { isInstance: (_: any) => true } as any;

        expect(getProvider(provider, undefined)).toBeUndefined();
    });
});

describe("#optsWithProvider", () => {
    it("should return all options with the provider if found in providers", () => {
        const provider = { isInstance: (_: any) => true } as any;
        const opts: pulumi.ComponentResourceOptions = { providers: [provider], retainOnDelete: true, protect: true };

        expect(optsWithProvider(provider, opts)).toStrictEqual({ provider, retainOnDelete: true, protect: true });
    });

    it("should return all options withouth the provider if not found in providers", () => {
        const provider = { isInstance: (_: any) => false } as any;
        const opts: pulumi.ComponentResourceOptions = { providers: [provider], retainOnDelete: true, protect: true };

        expect(optsWithProvider(provider, opts)).toStrictEqual({ retainOnDelete: true, protect: true });
    });

    it("should return undefined when no options is provided", () => {
        const provider = { isInstance: (_: any) => true } as any;

        expect(optsWithProvider(provider, undefined)).toStrictEqual({});
    });
});
