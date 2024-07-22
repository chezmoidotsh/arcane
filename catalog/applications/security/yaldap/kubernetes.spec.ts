import { randomUUID } from "crypto";
import LdapClient from "ldapjs-client";
import { describe, expect, it } from "vitest";

import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResourceOptions } from "@pulumi/pulumi";

import { AlpineImage } from "@catalog.chezmoi.sh/os~alpine-3.19";
import {
    fakeKubernetesScenario,
    kubernetesScenario,
    toHaveCompliantLabels,
    toHaveCompliantSecurity,
} from "@chezmoi.sh/core/pulumi/test/kubernetes";
import { SecretAsset, getProvider } from "@chezmoi.sh/core/utils";

import { Defaults, yaLDAP, yaLDAPArgs } from "./kubernetes";

expect.extend({ toHaveCompliantLabels, toHaveCompliantSecurity });

describe("(Security) yaLDAP", () => {
    const alpineTag = `oci.local.chezmoi.sh:5000/os/alpine:${randomUUID()}`;
    const yaldapTag = `oci.local.chezmoi.sh:5000/security/yaldap:${randomUUID()}`;

    fakeKubernetesScenario(
        "must be compliant with catalog conventions",
        { timeout: 30 * 1000 },
        // -- Program definition
        async (opts, randomName) => {
            const alpine = new AlpineImage(
                randomUUID(),
                {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [alpineTag],
                },
                {
                    ...opts,
                    ...{ provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );

            const yaldap = new yaLDAP(
                randomName(),
                {
                    image: { from: alpine, tags: [yaldapTag] },
                    configuration: { raw: SecretAsset.fromString("") },
                },
                {
                    ...opts,
                    ...{ provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );

            return { resources: yaldap.resources };
        },
        // -- Assertions
        async (context) => {
            it("all required labels must be set", () => {
                const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                expect(resources.workload).toHaveCompliantLabels();
                expect(resources.service).toHaveCompliantLabels();
                expect(resources.secret).toHaveCompliantLabels();
            });

            it("should follow security best practices", () => {
                const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                expect(resources.workload).toHaveCompliantSecurity();
            });
        },
    );

    describe("when it is deployed with customization", () => {
        const program = async (opts: ComponentResourceOptions, randomName: () => string, args: Partial<yaLDAPArgs>) => {
            const alpine = new AlpineImage(
                randomUUID(),
                {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [alpineTag],
                },
                {
                    ...opts,
                    ...{ provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );

            const yaldap = new yaLDAP(
                randomName(),
                {
                    image: { from: alpine, tags: [yaldapTag] },
                    configuration: { raw: SecretAsset.fromString("") },
                    ...args,
                },
                {
                    ...opts,
                    ...{ provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );

            return { resources: yaldap.resources };
        };

        fakeKubernetesScenario(
            "when it is deployed with additional metadata",
            { timeout: 30 * 1000 },
            // -- Program definition
            (opts, randomName) => {
                return program(opts, randomName, {
                    metadata: {
                        annotations: { "chezmoi.sh/test-engine": "vitest" },
                        labels: { "chezmoi.sh/test-engine": "vitest" },
                    },
                });
            },
            // -- Assertions
            async (context) => {
                it("should propagate the customizations", () => {
                    const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                    expect(resources.workload.metadata.annotations).toEqual({ "chezmoi.sh/test-engine": "vitest" });
                    expect(resources.workload.metadata.labels).toEqual(
                        expect.objectContaining({ "chezmoi.sh/test-engine": "vitest" }),
                    );
                    expect(resources.secret?.metadata.annotations).toEqual({ "chezmoi.sh/test-engine": "vitest" });
                    expect(resources.secret?.metadata.labels).toEqual(
                        expect.objectContaining({ "chezmoi.sh/test-engine": "vitest" }),
                    );
                    expect(resources.service.metadata.annotations).toEqual({ "chezmoi.sh/test-engine": "vitest" });
                    expect(resources.service.metadata.labels).toEqual(
                        expect.objectContaining({ "chezmoi.sh/test-engine": "vitest" }),
                    );
                });
            },
        );

        fakeKubernetesScenario(
            "when it is deployed with an external secret",
            { timeout: 30 * 1000 },
            // -- Program definition
            (opts, randomName) => {
                return program(opts, randomName, {
                    configuration: { secret: { secretName: "fake-secret" } },
                });
            },
            // -- Assertions
            async (context) => {
                it("should be successfully deployed without creating the secret", () => {
                    const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                    expect(context.result?.summary.result).toBe("succeeded");
                    expect(resources.service).toBeDefined();
                    expect(resources.workload).toBeDefined();
                    expect(resources.secret).toBeUndefined();
                    expect(resources.tcproute).toBeUndefined();
                });

                it("should have used the existing secret", async () => {
                    const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                    expect(resources.workload.spec.template.spec.volumes).toEqual([
                        {
                            name: "yaldap-backend",
                            secret: {
                                items: [{ key: "backend.yaml", path: "backend.yaml" }],
                                secretName: "fake-secret",
                            },
                        },
                    ]);
                });
            },
        );

        fakeKubernetesScenario(
            "when it is deployed with spec customization (imagePullSecrets and resources)",
            { timeout: 30 * 1000 },
            // -- Program definition
            (opts, randomName) => {
                return program(opts, randomName, {
                    spec: {
                        imagePullSecrets: [{ name: "fake-secret" }],
                        resources: { requests: { memory: "128Mi" }, limits: { cpu: "200m", memory: "256Mi" } },
                    },
                });
            },
            // -- Assertions
            async (context) => {
                it("should propagate the customizations", async () => {
                    const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                    expect(resources.workload.spec.template.spec.imagePullSecrets).toEqual([{ name: "fake-secret" }]);
                    expect(resources.workload.spec.template.spec.containers[0].resources).toEqual({
                        requests: { ...Defaults.resources.yaldap.requests, memory: "128Mi" },
                        limits: { ...Defaults.resources.yaldap.limits, cpu: "200m", memory: "256Mi" },
                    });
                });
            },
        );

        fakeKubernetesScenario(
            "when it is deployed with scheduling options",
            { timeout: 30 * 1000 },
            // -- Program definition
            (opts, randomName) => {
                return program(opts, randomName, {
                    spec: {
                        scheduling: {
                            nodeSelector: { "kubernetes.io/os": "linux" },
                            tolerations: [{ key: "dedicated", operator: "Equal", value: "ldap", effect: "NoSchedule" }],
                            affinity: {
                                nodeAffinity: {
                                    preferredDuringSchedulingIgnoredDuringExecution: [
                                        {
                                            weight: 1,
                                            preference: {
                                                matchExpressions: [
                                                    { key: "kubernetes.io/os", operator: "In", values: ["linux"] },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                });
            },
            // -- Assertions
            async (context) => {
                it("should propagate the customizations", async () => {
                    const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                    expect(resources.workload.spec.template.spec.nodeSelector).toEqual({ "kubernetes.io/os": "linux" });
                    expect(resources.workload.spec.template.spec.tolerations).toEqual([
                        { key: "dedicated", operator: "Equal", value: "ldap", effect: "NoSchedule" },
                    ]);
                    expect(resources.workload.spec.template.spec.affinity).toEqual({
                        nodeAffinity: {
                            preferredDuringSchedulingIgnoredDuringExecution: [
                                {
                                    weight: 1,
                                    preference: {
                                        matchExpressions: [
                                            { key: "kubernetes.io/os", operator: "In", values: ["linux"] },
                                        ],
                                    },
                                },
                            ],
                        },
                    });
                });
            },
        );

        fakeKubernetesScenario(
            "when it is deployed with an endpoint",
            { timeout: 30 * 1000 },
            // -- Program definition
            (opts, randomName) => {
                return program(opts, randomName, {
                    spec: {
                        endpoints: {
                            parentRefs: [
                                {
                                    group: "gateway.networking.k8s.io",
                                    kind: "Gateway",
                                    name: "fake-gateway",
                                    sectionName: "ldap",
                                },
                            ],
                        },
                    },
                });
            },
            // -- Assertions
            async (context) => {
                it("should have created the TCPRoute", async () => {
                    const resources = context.result?.outputs.resources.value as typeof yaLDAP.prototype.resources;

                    expect(resources.tcproute).toBeDefined();
                    expect(resources.tcproute).toHaveCompliantLabels();
                    expect((resources.tcproute as any).spec).toEqual({
                        parentRefs: [
                            {
                                group: "gateway.networking.k8s.io",
                                kind: "Gateway",
                                name: "fake-gateway",
                                sectionName: "ldap",
                            },
                        ],
                        rules: [
                            {
                                backendRefs: [
                                    {
                                        kind: "Service",
                                        name: resources.service.metadata.name,
                                        namespace: resources.service.metadata.namespace,
                                        port: 389,
                                    },
                                ],
                            },
                        ],
                    });
                });
            },
        );
    });

    kubernetesScenario(
        "when it is deployed for e2e testing",
        { timeout: 5 * 60 * 1000 },
        // -- Program definition
        async (opts, randomName) => {
            // NOTE: The gateway is required to be able to test the LDAP service
            // NOTE²: Unfortunately, the generated Gateway type by crd2pulumi crashes
            //        when it is used inside automation tests. This is why we are using
            //        the CustomResource type directly.
            const gateway = new kubernetes.apiextensions.CustomResource(
                randomUUID(),
                {
                    apiVersion: "gateway.networking.k8s.io/v1beta1",
                    kind: "Gateway",
                    metadata: { name: randomName() },
                    spec: {
                        gatewayClassName: "traefik",
                        listeners: [
                            {
                                name: "ldap",
                                protocol: "TCP",
                                port: 8389,
                            },
                        ],
                    },
                },
                {
                    ...opts,
                    ...{ provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );

            const alpine = new AlpineImage(randomUUID(), {
                builder: { name: "pulumi-buildkit" },
                exports: [{ image: { ociMediaTypes: true, push: true } }],
                push: false,
                tags: [`oci.local.chezmoi.sh:5000/os/alpine:${randomUUID()}`],
            });

            const yaldap = new yaLDAP(
                randomName(),
                {
                    image: { from: alpine, tags: [`oci.local.chezmoi.sh:5000/security/yaldap:${randomUUID()}`] },
                    configuration: { raw: SecretAsset.fromFile(`${__dirname}/fixtures/backend.yaml`) },

                    spec: {
                        endpoints: {
                            parentRefs: [
                                {
                                    group: "gateway.networking.k8s.io",
                                    kind: "Gateway",
                                    name: pulumi.output(gateway.metadata.apply((x) => x?.name ?? "")),
                                    sectionName: "ldap",
                                },
                            ],
                        },
                    },
                },
                opts,
            );

            return { resources: yaldap.resources };
        },
        // -- Assertions
        async (context) => {
            it("should be successfully deployed on kubernetes", () => {
                expect(context.result?.summary.result).toBe("succeeded");
            });

            let debounceRetry: number | undefined = undefined;
            it("should be able to resolve LDAP queries", { timeout: 10 * 1000, retry: 3 }, async () => {
                await new Promise((resolve) => {
                    setTimeout(resolve, debounceRetry ?? 0);
                });
                debounceRetry = debounceRetry ? debounceRetry * 2 : 1000;
                const addr = new URL(context.kubeconfig.getCurrentCluster()?.server ?? "").hostname;
                const client = new LdapClient({ url: `ldap://${addr}:389` });
                await client.bind("cn=alice,ou=people,c=fr,dc=example,dc=org", "alice");

                const entries = await client.search("dc=example,dc=org", { scope: "sub", filter: "(objectClass=*)" });
                expect(entries).toHaveLength(16);
            });
        },
    );
});
