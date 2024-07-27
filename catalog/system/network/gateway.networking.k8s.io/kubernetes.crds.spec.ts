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
import { ApiextensionsV1Api } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

import * as kubernetes from "@pulumi/kubernetes";

import { optsWithProvider } from "@pulumi.chezmoi.sh/core/pulumi";
import { kubernetesScenario } from "@pulumi.chezmoi.sh/vitest-scenario/kubernetes";

import { GatewayAPICRDs } from "./kubernetes.crds";

describe("(System/Network) Traefik - CRDs", () => {
    kubernetesScenario(
        "must install all Traefik CRDs",
        { timeout: 3 * 60 * 1000 },
        // -- Pulumi program
        async (opts) => {
            new GatewayAPICRDs(opts);
        },
        // -- Assertions
        async (context) => {
            it("All CRDs should be installed", { retry: 5 }, async () => {
                const client = context.kubeconfig.makeApiClient(ApiextensionsV1Api);
                const crds = await client.listCustomResourceDefinition();

                expect(crds.body.items).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "backendlbpolicies.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "backendtlspolicies.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "gatewayclasses.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "gateways.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "grpcroutes.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "httproutes.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "referencegrants.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "tcproutes.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "tlsroutes.gateway.networking.k8s.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "udproutes.gateway.networking.k8s.io" }),
                        }),
                    ]),
                );
            });
        },
    );
});
