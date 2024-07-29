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
import fetch from "node-fetch";
import { describe, expect, it } from "vitest";

import * as kubernetes from "@pulumi/kubernetes";
import { ComponentResourceOptions } from "@pulumi/pulumi";

import { AlpineImage } from "@catalog.chezmoi.sh/os~alpine-3.19";
import { GatewayAPICRDs } from "@catalog.chezmoi.sh/system.network~gateway.networking.k8s.io/kubernetes.crds";
import { gateway } from "@catalog.chezmoi.sh/system.network~gateway.networking.k8s.io/types/types/input";
import { optsWithProvider } from "@pulumi.chezmoi.sh/core/pulumi";
import { EnvVar } from "@pulumi.chezmoi.sh/core/utils/configuration";
import { fakeKubernetesScenario, kubernetesScenario } from "@pulumi.chezmoi.sh/vitest-scenario/kubernetes";
import { toHaveCompliantLabels, toHaveCompliantSecurity } from "@pulumi.chezmoi.sh/vitest-scenario/kubernetes.expect";

import { Traefik } from "./kubernetes";
import { TraefikCRDs } from "./kubernetes.crds";
import { traefik } from "./types/types/input";

expect.extend({ toHaveCompliantLabels, toHaveCompliantSecurity });

const timeout = 15 * 60 * 1000; // 15 minutes because traefik needs to be built

describe("(Network) Traefik", async () => {
    const alpineTag = `oci.local.chezmoi.sh:5000/os/alpine:${randomUUID()}`;
    const traefikTag = `oci.local.chezmoi.sh:5000/security/traefik:${randomUUID()}`;

    // Helper function to create an Alpine image
    const alpine = (opts: ComponentResourceOptions) =>
        new AlpineImage(
            randomUUID(),
            {
                builder: { name: "pulumi-buildkit" },
                exports: [{ image: { ociMediaTypes: true, push: true } }],
                push: false,
                tags: [alpineTag],
            },
            opts,
        );

    // scenario: Traefik must be compliant with catalog conventions
    fakeKubernetesScenario(
        "must be compliant with catalog conventions",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {},
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("all required labels must be set", () => {
                const traefik = context.result?.outputs.traefik?.value;

                expect(traefik).toHaveCompliantLabels();
                expect(traefik?.status.resourceRefs.rbac.serviceAccount).toHaveCompliantLabels();
                expect(traefik?.status.resourceRefs.rbac.clusterRole).toHaveCompliantLabels();
                expect(traefik?.status.resourceRefs.rbac.clusterRoleBinding).toHaveCompliantLabels();
                expect(traefik?.status.resourceRefs.service).toHaveCompliantLabels();
                expect(traefik?.status.resourceRefs.workload).toHaveCompliantLabels();
            });

            it("should follow security best practices", () => {
                const traefik = context.result?.outputs.traefik.value as Traefik | undefined;

                expect(traefik?.status.resourceRefs.workload).toHaveCompliantSecurity();
            });
        },
    );

    // scenario: Traefik must have a service in adequation with the configuration
    fakeKubernetesScenario(
        "must have a service in adequation with the configuration",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {
                            entryPoints: {
                                web: { address: ":80/tcp" },
                                dns: { address: ":853/udp" },
                            },
                        },
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                            listeners: {
                                web: { exposedOnPort: 80 },
                                dns: { exposedOnPort: 53 },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should create service with traefik entrypoint", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.workload).toBeDefined();
                expect(traefik?.status.resourceRefs.workload?.spec?.template.spec.containers[0].ports).toEqual([
                    {
                        containerPort: 9000,
                        name: "traefik",
                        protocol: "TCP",
                    },
                    {
                        containerPort: 80,
                        name: "web",
                        protocol: "TCP",
                    },
                    {
                        containerPort: 853,
                        name: "dns",
                        protocol: "UDP",
                    },
                ]);

                expect(traefik?.status.resourceRefs.service).toBeDefined();
                expect(traefik?.status.resourceRefs.service?.spec?.ports).toEqual([
                    { name: "web", port: 80, protocol: "TCP", targetPort: 80 },
                    { name: "dns", port: 53, protocol: "UDP", targetPort: 853 },
                ]);
            });
        },
    );

    // scenario: Traefik must be able to interact with the Kubernetes API when no provider is specified
    fakeKubernetesScenario(
        "must be able to interact with the Kubernetes API when no provider is specified",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {},
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should have the minimum required RBAC resources", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.rbac.serviceAccount).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRole).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRoleBinding).toBeDefined();

                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toEqual([
                    {
                        apiGroups: [""],
                        resources: ["nodes", "services", "secrets"],
                        verbs: ["get", "list", "watch"],
                    },
                    {
                        apiGroups: ["extensions", "networking.k8s.io"],
                        resources: ["ingressclasses", "ingresses"],
                        verbs: ["get", "list", "watch"],
                    },
                    {
                        apiGroups: ["discovery.k8s.io"],
                        resources: ["endpointslices"],
                        verbs: ["list", "watch"],
                    },
                ]);
            });
        },
    );

    // scenario: Traefik must be able to interact with the Kubernetes API when provider kubernetesCRD is specified
    fakeKubernetesScenario(
        "must be able to interact with the Kubernetes API when provider kubernetesCRD is specified",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {
                            providers: { kubernetesCRD: {} },
                        },
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should have the minimum required RBAC resources and ones for Traefik CRDs", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.rbac.serviceAccount).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRole).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRoleBinding).toBeDefined();

                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toHaveLength(4);
                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toContainEqual({
                    apiGroups: ["traefik.io"],
                    resources: [
                        "ingressroutes",
                        "ingressroutetcps",
                        "ingressrouteudps",
                        "middlewares",
                        "middlewaretcps",
                        "serverstransports",
                        "serverstransporttcps",
                        "tlsoptions",
                        "tlsstores",
                        "traefikservices",
                    ],
                    verbs: ["get", "list", "watch"],
                });
            });
        },
    );

    // scenario: Traefik must be able to interact with the Kubernetes API when provider kubernetesIngress is specified
    fakeKubernetesScenario(
        "must be able to interact with the Kubernetes API when provider kubernetesIngress is specified",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {
                            providers: { kubernetesIngress: {} },
                        },
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should have the minimum required RBAC resources and ones for Ingress", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.rbac.serviceAccount).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRole).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRoleBinding).toBeDefined();

                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toHaveLength(4);
                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toContainEqual({
                    apiGroups: ["extensions", "networking.k8s.io"],
                    resources: ["ingresses/status"],
                    verbs: ["update"],
                });
            });
        },
    );

    // scenario: Traefik must be able to interact with the Kubernetes API when provider kubernetesGateway is specified
    fakeKubernetesScenario(
        "must be able to interact with the Kubernetes API when provider kubernetesGateway is specified",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {
                            providers: { kubernetesGateway: {} },
                        },
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should have the minimum required RBAC resources and ones for Gateway", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.rbac.serviceAccount).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRole).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRoleBinding).toBeDefined();

                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toHaveLength(7);
                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toContainEqual({
                    apiGroups: [""],
                    resources: ["namespaces"],
                    verbs: ["list", "watch"],
                });
                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toContainEqual({
                    apiGroups: [""],
                    resources: ["services", "secrets"],
                    verbs: ["get", "list", "watch"],
                });
                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toContainEqual({
                    apiGroups: ["gateway.networking.k8s.io"],
                    resources: [
                        "gateways",
                        "gatewayclasses",
                        "httproutes",
                        "referencegrants",
                        "tcproutes",
                        "tlsroutes",
                        "udproutes",
                    ],
                    verbs: ["get", "list", "watch"],
                });
                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toContainEqual({
                    apiGroups: ["gateway.networking.k8s.io"],
                    resources: [
                        "gateways/status",
                        "gatewayclasses/status",
                        "httproutes/status",
                        "tcproutes/status",
                        "tlsroutes/status",
                        "udproutes/status",
                    ],
                    verbs: ["update"],
                });
            });
        },
    );

    // scenario: Traefik must be able to interact with the Kubernetes API when all providers are specified
    fakeKubernetesScenario(
        "must be able to interact with the Kubernetes API when all providers are specified",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {
                            providers: {
                                kubernetesCRD: {},
                                kubernetesIngress: {},
                                kubernetesGateway: {},
                            },
                        },
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should have the all required RBAC resources", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.rbac.serviceAccount).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRole).toBeDefined();
                expect(traefik?.status.resourceRefs.rbac.clusterRoleBinding).toBeDefined();

                expect(traefik?.status.resourceRefs.rbac.clusterRole.rules).toHaveLength(9);
            });
        },
    );

    // scenario: Traefik container must have the correct GOROUTINE and GOMAXPROCS settings
    fakeKubernetesScenario(
        "must have the correct GOROUTINE and GOMAXPROCS settings",
        { timeout },
        // -- Program definition
        async (opts, randomDNS1035) => {
            return {
                traefik: new Traefik(
                    randomDNS1035(),
                    {
                        metadata: { namespace: "default" },
                        configuration: {},
                        spec: {
                            images: {
                                traefik: { from: alpine(opts), tags: [traefikTag] },
                            },
                            resources: { traefik: { limits: { cpu: "100m" } } },
                        },
                    },
                    opts,
                ),
            };
        },
        // -- Assertions
        async (context) => {
            it("should have the correct GOROUTINE and GOMAXPROCS settings", () => {
                const traefik = context.result?.outputs.traefik?.value;
                expect(traefik?.status.resourceRefs.workload?.spec?.template.spec.containers[0].env).toEqual([
                    {
                        name: "GOMAXPROCS",
                        valueFrom: { resourceFieldRef: { resource: "limits.cpu", divisor: "1" } },
                    },
                    {
                        name: "GOMEMLIMIT",
                        valueFrom: { resourceFieldRef: { resource: "limits.memory", divisor: "1" } },
                    },
                ]);
            });
        },
    );

    // scenario: Traefik should work as expected when deployed as a ingress controller
    kubernetesScenario(
        "when deployed as an ingress controller",
        { timeout },
        // -- Program definition
        async (opts, namespace, randomDNS1035) => {
            const ingressClass = new kubernetes.networking.v1.IngressClass(
                randomDNS1035(),
                {
                    metadata: { namespace },
                    spec: { controller: "traefik.io/ingress-controller" },
                },
                optsWithProvider(kubernetes.Provider, opts),
            );

            const traefik = new Traefik(
                randomDNS1035(),
                {
                    metadata: { namespace },
                    configuration: {
                        entryPoints: { web: { address: ":80" } },
                        providers: { kubernetesIngress: { ingressClass: ingressClass.metadata.name as any } },
                        log: { level: "DEBUG" },
                    },
                    spec: {
                        images: {
                            traefik: { from: alpine(opts), tags: [traefikTag] },
                        },
                        listeners: { traefik: { exposedOnPort: 9000 }, web: { exposedOnPort: 80 } },
                    },
                },
                opts,
            );

            new kubernetes.networking.v1.Ingress(
                randomDNS1035(),
                {
                    metadata: { namespace },
                    spec: {
                        ingressClassName: ingressClass.metadata.name,
                        rules: [
                            {
                                http: {
                                    paths: [
                                        {
                                            path: "/",
                                            pathType: "Prefix",
                                            backend: {
                                                service: traefik.status.apply((status) => ({
                                                    name: status.resourceRefs.service.metadata.name,
                                                    port: { name: "traefik" },
                                                })),
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
                optsWithProvider(kubernetes.Provider, opts),
            );
        },
        // -- Assertions
        async (context) => {
            it("should be able to route traffic to the traefik entrypoint", async () => {
                const addr = new URL(context.kubeconfig.getCurrentCluster()?.server ?? "").hostname;
                const request = await fetch(`http://${addr}/ping`);

                expect(request.ok).toBeTruthy();
                expect(await request.text()).toBe("OK");
            });
        },
    );

    // scenario: Traefik should work as expected when deployed as a Gateway controller
    kubernetesScenario(
        "when deployed as a Gateway controller",
        { timeout },
        // -- Program definition
        async (opts, namespace, randomDNS1035) => {
            new GatewayAPICRDs(opts);

            const gatewayClass = new kubernetes.apiextensions.CustomResource(
                randomDNS1035(),
                {
                    apiVersion: "gateway.networking.k8s.io/v1",
                    kind: "GatewayClass",
                    metadata: { namespace },
                    spec: { controllerName: "traefik.io/gateway-controller" },
                },
                optsWithProvider(kubernetes.Provider, opts),
            );
            const _gateway = new kubernetes.apiextensions.CustomResource(
                randomDNS1035(),
                {
                    apiVersion: "gateway.networking.k8s.io/v1",
                    kind: "Gateway",
                    metadata: { namespace },
                    spec: {
                        gatewayClassName: gatewayClass.metadata.name,
                        listeners: [
                            {
                                name: "web",
                                port: 80,
                                protocol: "HTTP",
                            },
                        ],
                    },
                },
                optsWithProvider(kubernetes.Provider, opts),
            );

            const traefik = new Traefik(
                randomDNS1035(),
                {
                    metadata: { namespace },
                    configuration: {
                        entryPoints: { web: { address: ":80" } },
                        providers: { kubernetesGateway: {} },
                        log: { level: "DEBUG" },
                    },
                    spec: {
                        images: {
                            traefik: { from: alpine(opts), tags: [traefikTag] },
                        },
                        listeners: { traefik: { exposedOnPort: 9000 }, web: { exposedOnPort: 80 } },
                    },
                },
                opts,
            );

            new kubernetes.apiextensions.CustomResource(
                randomDNS1035(),
                {
                    apiVersion: "gateway.networking.k8s.io/v1",
                    kind: "HTTPRoute",
                    metadata: { namespace },
                    spec: {
                        parentRefs: [
                            { kind: "Gateway", name: _gateway.metadata.name, namespace: _gateway.metadata.namespace },
                        ],
                        rules: [
                            {
                                backendRefs: [
                                    {
                                        kind: "Service",
                                        name: traefik.status.resourceRefs.service.metadata.name,
                                        namespace: traefik.status.resourceRefs.service.metadata.namespace,
                                        port: 9000,
                                    },
                                ],
                            },
                        ],
                    } as gateway.v1.HTTPRouteSpecArgs,
                },
                optsWithProvider(kubernetes.Provider, opts),
            );

            return { traefik };
        },
        // -- Assertions
        async (context) => {
            it("should be able to route traffic to the traefik entrypoint", async () => {
                const traefik = context.result?.outputs.traefik.value as Traefik | undefined;
                if (!traefik) {
                    expect.fail("Traefik resource is not defined");
                }

                const addr = new URL(context.kubeconfig.getCurrentCluster()?.server ?? "").hostname;
                const request = await fetch(`http://${addr}/ping`);

                expect(request.ok).toBeTruthy();
                expect(await request.text()).toBe("OK");
            });
        },
    );

    // scenario: Traefik should work as expected when deployed with its own CRDs
    kubernetesScenario(
        "when deployed with its own CRDs",
        { timeout },
        // -- Program definition
        async (opts, namespace, randomDNS1035) => {
            new TraefikCRDs(opts);

            const traefik = new Traefik(
                randomDNS1035(),
                {
                    metadata: { namespace },
                    configuration: {
                        entryPoints: { web: { address: ":80" } },
                        providers: { kubernetesCRD: {} },
                        log: { level: "DEBUG" },
                    },
                    spec: {
                        images: {
                            traefik: { from: alpine(opts), tags: [traefikTag] },
                        },
                        listeners: { traefik: { exposedOnPort: 9000 }, web: { exposedOnPort: 80 } },
                    },
                },
                opts,
            );

            new kubernetes.apiextensions.CustomResource(
                randomDNS1035(),
                {
                    apiVersion: "traefik.io/v1alpha1",
                    kind: "IngressRoute",
                    metadata: { namespace },
                    spec: {
                        entryPoints: ["web"],
                        routes: [
                            {
                                kind: "Rule",
                                match: "HostRegexp(`^.*$`)",
                                services: [
                                    {
                                        name: traefik.status.resourceRefs.service.metadata.name,
                                        port: 9000,
                                    },
                                ],
                            },
                        ],
                    } as traefik.v1alpha1.IngressRouteSpecArgs,
                },
                optsWithProvider(kubernetes.Provider, opts),
            );

            return { traefik };
        },
        // -- Assertions
        async (context) => {
            it("should be able to route traffic to the traefik entrypoint", async () => {
                const traefik = context.result?.outputs.traefik.value as Traefik | undefined;
                if (!traefik) {
                    expect.fail("Traefik resource is not defined");
                }

                const addr = new URL(context.kubeconfig.getCurrentCluster()?.server ?? "").hostname;
                const request = await fetch(`http://${addr}/ping`);

                expect(request.ok).toBeTruthy();
                expect(await request.text()).toBe("OK");
            });
        },
    );
});
