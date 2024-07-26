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
import { CoreV1Api, RbacAuthorizationV1Api } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import { optsWithProvider } from "@pulumi.chezmoi.sh/core/pulumi";

import { fakeKubernetesScenario, kubernetesScenario } from "./kubernetes";

describe("#fakeKubernetesScenario", async () => {
    fakeKubernetesScenario(
        "should run deploy some Kubernetes resources without a kubeconfig",
        { timeout: 30 * 1000 },
        // -- Pulumi program
        async (opts) => {
            const namespace = new kubernetes.core.v1.Namespace(
                "test-namespace",
                {},
                { ...optsWithProvider(kubernetes.Provider, opts) },
            );
            const namespacedResource = new kubernetes.core.v1.ServiceAccount(
                "test-service-account",
                {
                    metadata: { namespace: namespace.metadata.name },
                },
                { ...optsWithProvider(kubernetes.Provider, opts) },
            );
            const clusterResource = new kubernetes.rbac.v1.ClusterRole(
                "test-cluster-role",
                {},
                { ...optsWithProvider(kubernetes.Provider, opts) },
            );

            return {
                namespace: namespace,
                namespacedResource: namespacedResource,
                clusterResource: clusterResource,
            };
        },
        // -- Assertions
        async (context) => {
            it("should have created a namespace", async () => {
                const namespace = context.result?.outputs.namespace.value as
                    | pulumi.Unwrap<kubernetes.core.v1.Namespace>
                    | undefined;

                expect(namespace?.metadata.name).toBeDefined();
            });
            it("should have created a namespaced resource", async () => {
                const namespacedResource = context.result?.outputs.namespacedResource.value as
                    | pulumi.Unwrap<kubernetes.core.v1.ServiceAccount>
                    | undefined;

                expect(namespacedResource?.metadata.name).toBeDefined();
            });
            it("should have created a cluster resource", async () => {
                const clusterResource = context.result?.outputs.clusterResource.value as
                    | pulumi.Unwrap<kubernetes.rbac.v1.ClusterRole>
                    | undefined;

                expect(clusterResource?.metadata.name).toBeDefined();
            });
        },
    );
});

describe("#kubernetesScenario", async () => {
    kubernetesScenario(
        "should run deploy some Kubernetes resources",
        { timeout: 30 * 1000 },
        // -- Pulumi program
        async (opts, namespace, randomDNS1035) => {
            const namespacedResource = new kubernetes.core.v1.ServiceAccount(
                randomDNS1035(),
                {
                    metadata: { namespace },
                },
                { ...optsWithProvider(kubernetes.Provider, opts) },
            );
            const clusterResource = new kubernetes.rbac.v1.ClusterRole(
                randomDNS1035(),
                {},
                { ...optsWithProvider(kubernetes.Provider, opts) },
            );

            return {
                namespacedResource: namespacedResource,
                clusterResource: clusterResource,
            };
        },
        // -- Assertions
        async (context) => {
            it("should have created a namespaced resource", async () => {
                const client = context.kubeconfig.makeApiClient(CoreV1Api);
                const namespacedResource = context.result?.outputs.namespacedResource.value as
                    | pulumi.Unwrap<kubernetes.core.v1.ServiceAccount>
                    | undefined;

                expect(namespacedResource?.metadata.name).toBeDefined();
                expect(namespacedResource?.metadata.namespace).toBeDefined();

                const serviceAccounts = await client.listNamespacedServiceAccount(
                    namespacedResource?.metadata.namespace as any,
                );
                expect(serviceAccounts.body.items).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name: namespacedResource?.metadata.name }),
                        }),
                    ]),
                );
            });
            it("should have created a cluster resource", async () => {
                const client = context.kubeconfig.makeApiClient(RbacAuthorizationV1Api);
                const clusterResource = context.result?.outputs.clusterResource.value as
                    | pulumi.Unwrap<kubernetes.rbac.v1.ClusterRole>
                    | undefined;

                const name = clusterResource?.metadata.name;
                expect(name).toBeDefined();

                const clusterRoles = await client.listClusterRole();
                expect(clusterRoles.body.items).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            metadata: expect.objectContaining({ name }),
                        }),
                    ]),
                );
            });
        },
    );
});
