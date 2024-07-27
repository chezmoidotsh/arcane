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
import { expect, it } from "vitest";
import { describe } from "vitest";

import * as pulumi from "@pulumi/pulumi";

import { promisifyPulumiOutput } from "../../vitest-scenario/pulumi";
import {
    AdditionnalSpec,
    KubernetesApplication,
    KubernetesApplicationArgs,
    KubernetesApplicationStatus,
} from "./applications";

describe("KubernetesApplication", () => {
    describe("#constructor", () => {
        describe("with a Dummy implementation", () => {
            const Version = "1.0.0";
            interface DummySpec {
                dummyNo?: number;
            }
            class Dummy extends KubernetesApplication<
                typeof Version,
                "A" | "B",
                AdditionnalSpec.Autoscaling & DummySpec
            > {
                readonly status: pulumi.Output<KubernetesApplicationStatus<typeof Version>>;

                constructor(
                    name: string,
                    args: KubernetesApplicationArgs<"A" | "B", AdditionnalSpec.Autoscaling & DummySpec>,
                    opts: pulumi.ComponentResourceOptions,
                ) {
                    super("dummy", Version, name, args, opts);
                    this.status = pulumi.output({ version: Version });
                }
            }

            describe("should have all required labels", () => {
                const dummy = new Dummy(
                    "dummy",
                    { metadata: { namespace: "default" }, spec: { images: { A: {} as any, B: {} as any } } },
                    {},
                );
                it(`should have the required label 'app.kubernetes.io/name'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["app.kubernetes.io/name"])),
                    ).resolves.toEqual("dummy");
                });
                it(`should have the required label 'app.kubernetes.io/instance'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["app.kubernetes.io/instance"])),
                    ).resolves.toEqual("dummy-project-stack");
                });
                it(`should have the required label 'app.kubernetes.io/version'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["app.kubernetes.io/version"])),
                    ).resolves.toEqual(Version);
                });
                it(`should have the required label 'app.kubernetes.io/managed-by'`, () => {
                    expect(
                        promisifyPulumiOutput(
                            dummy.metadata?.labels?.apply((l) => l?.["app.kubernetes.io/managed-by"]),
                        ),
                    ).resolves.toEqual("pulumi.chezmoi.sh");
                });
                it(`should have the required label 'pulumi.com/project'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["pulumi.com/project"])),
                    ).resolves.toEqual("project");
                });
                it(`should have the required label 'pulumi.com/stack'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["pulumi.com/stack"])),
                    ).resolves.toEqual("stack");
                });
            });

            describe("required labels should be immutable", () => {
                const dummy = new Dummy(
                    "dummy",
                    {
                        metadata: { labels: { "app.kubernetes.io/name": "new-dummy" }, namespace: "default" },
                        spec: { images: { A: {} as any, B: {} as any } },
                    },
                    {},
                );
                if (dummy.metadata?.labels === undefined) {
                    expect.fail("metadata.labels is undefined");
                }

                it(`should have the required label 'app.kubernetes.io/name' defined by super`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["app.kubernetes.io/name"])),
                    ).resolves.toEqual("dummy");
                });
            });

            describe("should export all metadata", () => {
                const dummy = new Dummy(
                    "dummy",
                    {
                        metadata: { annotations: { a: "b" }, labels: { c: "d" }, namespace: "e" },
                        spec: { images: { A: {} as any, B: {} as any } },
                    },
                    {},
                );
                it(`should have the given annotation 'a'`, () => {
                    expect(promisifyPulumiOutput(dummy.metadata?.annotations?.apply((a) => a?.["a"]))).resolves.toEqual(
                        "b",
                    );
                });
                it(`should have the given label 'c'`, () => {
                    expect(promisifyPulumiOutput(dummy.metadata?.labels?.apply((l) => l?.["c"]))).resolves.toEqual("d");
                });
                it(`should have the given namespace 'e'`, () => {
                    expect(promisifyPulumiOutput(dummy.metadata?.namespace)).resolves.toEqual("e");
                });
            });

            describe("should export all spec", () => {
                const dummy = new Dummy(
                    "dummy",
                    {
                        metadata: { namespace: "default" },
                        spec: {
                            images: { A: {} as any, B: {} as any },
                            imagePullSecrets: [{ name: "secret" }],
                            scheduling: {
                                affinity: {
                                    nodeAffinity: {
                                        preferredDuringSchedulingIgnoredDuringExecution: [
                                            {
                                                preference: {
                                                    matchFields: [
                                                        { key: "kubernetes.io/os", operator: "In", values: ["linux"] },
                                                    ],
                                                },
                                                weight: 1,
                                            },
                                        ],
                                    },
                                },
                                nodeSelector: {
                                    "kubernetes.io/os": "linux",
                                },
                                tolerations: [
                                    {
                                        operator: "Equal",
                                        value: "value",
                                        effect: "NoSchedule",
                                    },
                                ],
                            },
                            resources: {
                                A: {
                                    requests: { cpu: "100m", memory: "100Mi" },
                                    limits: { cpu: "200m", memory: "200Mi" },
                                },
                                B: {
                                    requests: { cpu: "200m", memory: "200Mi" },
                                    limits: { cpu: "400m", memory: "400Mi" },
                                },
                            },
                            autoscaling: { minReplicas: 1, maxReplicas: 30 },
                            dummyNo: 1,
                        },
                    },
                    {},
                );
                it(`should have the given imagePullSecrets 'secret'`, () => {
                    expect(promisifyPulumiOutput(dummy.spec?.apply((s) => s?.imagePullSecrets))).resolves.toEqual([
                        { name: "secret" },
                    ]);
                });
                it(`should have the given scheduling 'affinity'`, () => {
                    expect(promisifyPulumiOutput(dummy.spec?.apply((s) => s?.scheduling?.affinity))).resolves.toEqual({
                        nodeAffinity: {
                            preferredDuringSchedulingIgnoredDuringExecution: [
                                {
                                    preference: {
                                        matchFields: [{ key: "kubernetes.io/os", operator: "In", values: ["linux"] }],
                                    },
                                    weight: 1,
                                },
                            ],
                        },
                    });
                });
                it(`should have the given scheduling 'nodeSelector'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.spec?.apply((s) => s?.scheduling?.nodeSelector)),
                    ).resolves.toEqual({
                        "kubernetes.io/os": "linux",
                    });
                });
                it(`should have the given scheduling 'tolerations'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.spec?.apply((s) => s?.scheduling?.tolerations)),
                    ).resolves.toEqual([
                        {
                            operator: "Equal",
                            value: "value",
                            effect: "NoSchedule",
                        },
                    ]);
                });
                it(`should have the given resources 'A'`, () => {
                    expect(promisifyPulumiOutput(dummy.spec?.apply((s) => s?.resources?.A))).resolves.toEqual({
                        requests: { cpu: "100m", memory: "100Mi" },
                        limits: { cpu: "200m", memory: "200Mi" },
                    });
                });
                it(`should have the given resources 'B'`, () => {
                    expect(promisifyPulumiOutput(dummy.spec?.apply((s) => s?.resources?.B))).resolves.toEqual({
                        requests: { cpu: "200m", memory: "200Mi" },
                        limits: { cpu: "400m", memory: "400Mi" },
                    });
                });
                it(`should have the given autoscaling 'minReplicas'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.spec?.apply((s) => s?.autoscaling?.minReplicas)),
                    ).resolves.toEqual(1);
                });
                it(`should have the given autoscaling 'maxReplicas'`, () => {
                    expect(
                        promisifyPulumiOutput(dummy.spec?.apply((s) => s?.autoscaling?.maxReplicas)),
                    ).resolves.toEqual(30);
                });
                it(`should have the given dummyNo`, () => {
                    expect(promisifyPulumiOutput(dummy.spec?.apply((s) => s?.dummyNo))).resolves.toEqual(1);
                });
            });
        });
    });
});
