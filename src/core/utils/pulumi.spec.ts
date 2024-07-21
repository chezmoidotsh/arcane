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

import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import * as kubernetes from "@pulumi/kubernetes";

import { getProvider } from "./pulumi";

describe("#getProvider", () => {
    describe("when no options is provided", () => {
        it("should return undefined", () => {
            expect(getProvider(aws.Provider, undefined)).toBeUndefined();
        });
    });

    describe("when opts.provider is provided", () => {
        const provider = new aws.Provider("aws");
        it("should return the provider if found", () => {
            expect(getProvider(aws.Provider, { provider })).toBe(provider);
        });

        it("should return undefined if provider is not found", () => {
            expect(getProvider(docker.Provider, { provider })).toBeUndefined();
        });
    });

    describe("when opts.providers is provided as a list of provider", () => {
        const providers = [new aws.Provider("aws"), new docker.Provider("docker")];
        it("should return the provider if found", () => {
            expect(getProvider(aws.Provider, { providers })).toBe(providers[0]);
            expect(getProvider(docker.Provider, { providers })).toBe(providers[1]);
        });

        it("should return undefined if provider is not found", () => {
            expect(getProvider(kubernetes.Provider, { providers })).toBeUndefined();
        });
    });

    describe("when opts.providers is provided as a map of provider", () => {
        const providers = {
            aws: new aws.Provider("aws"),
            docker: new docker.Provider("docker"),
        };
        it("should return the provider if found", () => {
            expect(getProvider(aws.Provider, { providers })).toBe(providers.aws);
            expect(getProvider(docker.Provider, { providers })).toBe(providers.docker);
        });

        it("should return undefined if provider is not found", () => {
            expect(getProvider(kubernetes.Provider, { providers })).toBeUndefined();
        });
    });
});
