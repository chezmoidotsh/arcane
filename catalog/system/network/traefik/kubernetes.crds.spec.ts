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

import { TraefikCRDs } from "./kubernetes.crds";

describe("(System/Network) Traefik - CRDs", () => {
    kubernetesScenario(
        "must install all Traefik CRDs",
        { timeout: 3 * 60 * 1000 },
        // -- Pulumi program
        async (opts) => {
            const crds = new TraefikCRDs({ ...optsWithProvider(kubernetes.Provider, opts) });

            return { crds };
        },
        // -- Assertions
        async (context) => {
            it("must install all CRDs", { retry: 5 }, async () => {
                const client = context.kubeconfig.makeApiClient(ApiextensionsV1Api);

                const crds = await client.listCustomResourceDefinition();

                expect(crds.body.items).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "ingressroutes.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "ingressroutetcps.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "ingressrouteudps.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "middlewares.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "middlewaretcps.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "serverstransports.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "serverstransporttcps.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "tlsoptions.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "tlsstores.traefik.io" }),
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: "traefikservices.traefik.io" }),
                        }),
                    ]),
                );
            });
        },
    );
});
