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
import { describe, expect } from "vitest";
import { it } from "vitest";

import { core } from "@pulumi/kubernetes/types/input";
import { all, output } from "@pulumi/pulumi";

import { promisifyPulumiOutput } from "../../vitest-scenario/pulumi";
import { EnvVar, WithEnvVar, extractEnvVarsFromObject, objectToArgs } from "./configuration";

describe("#objectToArgs", () => {
    const cases: { name: string; object: any; opts?: Parameters<typeof objectToArgs>[1]; expect: string[] }[] = [
        {
            name: `should convert {} to CLI argument`,
            object: {},
            expect: [],
        },
        {
            name: `should convert undefined to CLI argument`,
            object: undefined,
            expect: [],
        },
        {
            name: `should convert null to CLI argument`,
            object: null,
            expect: [],
        },
        {
            name: `should convert { a: "value" } to CLI argument "--a=value"`,
            object: { a: "value" },
            expect: ["--a=value"],
        },
        {
            name: `should convert { a: 10 } to CLI argument "--a=10"`,
            object: { a: 10 },
            expect: ["--a=10"],
        },
        {
            name: `should convert { a: true } to CLI argument "--a"`,
            object: { a: true },
            expect: ["--a"],
        },
        {
            name: `should convert { a: false } to CLI argument "--a=false"`,
            object: { a: false },
            expect: ["--a=false"],
        },
        {
            name: `should convert { a: {} } to CLI argument "--a"`,
            object: { a: {} },
            expect: ["--a"],
        },
        {
            name: `should convert { a: { b: {} } } to CLI argument "--a.b"`,
            object: { a: { b: {} } },
            expect: ["--a.b"],
        },
        {
            name: `should convert { a: ["value"] } to CLI argument "--a[0]=value"`,
            object: { a: ["value"] },
            expect: ["--a[0]=value"],
        },
        {
            name: `should convert { a: [{ b: "value" }] } to CLI argument "--a[0].b=value"`,
            object: { a: [{ b: "value" }] },
            expect: ["--a[0].b=value"],
        },
        {
            name: `should convert { a: { b: "value" } } to CLI argument "--a.b=value"`,
            object: { a: { b: "value" } },
            expect: ["--a.b=value"],
        },
        {
            name: `should convert { a: { b: "value" }, c: true } to CLI argument ["--a.b=value", "--c"]`,
            object: { a: { b: "value" }, c: true },
            expect: ["--a.b=value", "--c"],
        },
        {
            name: `should convert { a: { b: "value" }, c: { d: true } } with a flag prefix of '-' to CLI argument ["-a.b=value", "-c.d"]`,
            object: { a: { b: "value" }, c: { d: true } },
            opts: { flagPrefix: "-" },
            expect: ["-a.b=value", "-c.d"],
        },
        {
            name: `should convert { a: { b: "value" }, c: { d: true } } with a filter on 'a.b' to CLI argument ["--c.d"]`,
            object: { a: { b: "value" }, c: { d: true } },
            opts: { allowed: (path) => path !== "--a.b" },
            expect: ["--c.d"],
        },
        {
            name: `should convert { a: { b: "value" }, c: { d: true } } with an uppecase transform to CLI argument ["--A.B=value", "--C.D"]`,
            object: { a: { b: "value" }, c: { d: true } },
            opts: { transform: (path) => path.toUpperCase() },
            expect: ["--A.B=value", "--C.D"],
        },
        {
            name: `should convert { a: pulumi.output("value") } to CLI argument "--a=value"`,
            object: { a: output(new Promise((r) => r("value"))) },
            expect: ["--a=value"],
        },
        {
            name: `(UNFIXABLE) should convert { a: pulumi.output({ b: "value" }) } to CLI argument "--a=[object Object]"`,
            object: { a: output(output({ b: "value" })) },
            expect: ["--a=[object Object]"],
        },
    ];

    for (const { name, object, opts, expect: args } of cases) {
        it(name, () => {
            expect(
                Promise.all(objectToArgs(object, opts).map((a) => promisifyPulumiOutput<string>(a))),
            ).resolves.toEqual(args);
        });
    }

    describe("when object is unsupported", () => {
        it("should throw an error with an unhandled type", () => {
            expect(() => objectToArgs({ a: () => {} })).toThrowError("Unsupported type for 'a': function");
        });

        it.todo("should throw an error with a non-primitive type from pulumi.output");
    });
});

describe("#extractEnvVarsFromObject", () => {
    const envVarCtr = (name: string, opts?: Pick<EnvVar, "opts">["opts"]): EnvVar => ({
        name,
        valueFrom: { configMapKeyRef: { name: "configmap", key: "key" } },
        opts: opts,
    });
    const kubeEnvVarCtr = (name: string): core.v1.EnvVar => ({
        name,
        valueFrom: { configMapKeyRef: { name: "configmap", key: "key" } },
    });

    const cases: {
        name: string;
        object: WithEnvVar<unknown>;
        opts?: Parameters<typeof extractEnvVarsFromObject>[1];
        expect: ReturnType<typeof extractEnvVarsFromObject>;
    }[] = [
        {
            name: `should extract environment vars from {}`,
            object: {},
            expect: [[], {}],
        },
        {
            name: `should extract environment vars from undefined`,
            object: undefined,
            expect: [[], undefined],
        },
        {
            name: `should extract environment vars from null`,
            object: null,
            expect: [[], null],
        },
        {
            name: `should extract environment vars from { a: Environ }`,
            object: { a: envVarCtr("VAR") },
            expect: [[kubeEnvVarCtr("VAR")], { a: "${VAR}" }],
        },
        {
            name: `should extract environment vars from { a: { b: Environ } }`,
            object: {
                a: { b: envVarCtr("VAR") },
            },
            expect: [[kubeEnvVarCtr("VAR")], { a: { b: "${VAR}" } }],
        },
        {
            name: `should extract environment vars from { a: [Environ] }`,
            object: { a: [envVarCtr("VAR")] },
            expect: [[kubeEnvVarCtr("VAR")], { a: ["${VAR}"] }],
        },
        {
            name: `should extract environment vars from { a: [{b: Environ}] }`,
            object: { a: [{ b: envVarCtr("VAR") }] },
            expect: [[kubeEnvVarCtr("VAR")], { a: [{ b: "${VAR}" }] }],
        },
        {
            name: `should extract environment vars from { a: Environ, b: Environ }`,
            object: { a: envVarCtr("VAR1"), b: envVarCtr("VAR2") },
            expect: [[kubeEnvVarCtr("VAR1"), kubeEnvVarCtr("VAR2")], { a: "${VAR1}", b: "${VAR2}" }],
        },
        {
            name: `should extract environment vars from { a: Environ, b: { c: Environ }, d: [{e: Environ, f: Environ}] }`,
            object: {
                a: envVarCtr("VAR1"),
                b: { c: envVarCtr("VAR2") },
                d: [{ e: envVarCtr("VAR3"), f: envVarCtr("VAR4") }],
            },
            expect: [
                [kubeEnvVarCtr("VAR1"), kubeEnvVarCtr("VAR2"), kubeEnvVarCtr("VAR3"), kubeEnvVarCtr("VAR4")],
                { a: "${VAR1}", b: { c: "${VAR2}" }, d: [{ e: "${VAR3}", f: "${VAR4}" }] },
            ],
        },
        {
            name: `should extract environment vars from { a: Environ } with a custom format "{{ .env.X }}"`,
            object: { a: envVarCtr("VAR") },
            opts: { format: (name) => `{{ .env.${name} }}` },
            expect: [[kubeEnvVarCtr("VAR")], { a: "{{ .env.VAR }}" }],
        },
        {
            name: `should extract environment vars from { a: Environ, b: Environ } with a custom format "{{ .env.X }}" and "{{ .env.X | lower }}" only for b`,
            object: {
                a: envVarCtr("VAR1"),
                b: envVarCtr("VAR2", { format: (name) => `{{ .env.${name} | lower }}` }),
            },
            opts: { format: (name) => `{{ .env.${name} }}` },
            expect: [
                [kubeEnvVarCtr("VAR1"), kubeEnvVarCtr("VAR2")],
                { a: "{{ .env.VAR1 }}", b: "{{ .env.VAR2 | lower }}" },
            ],
        },
        {
            name: `should not extract environment vars from { a: Output(Environ) }`,
            object: { a: output(envVarCtr("VAR")) },
            expect: [[], { a: envVarCtr("VAR") }],
        },
        {
            name: `should not extract environment vars from { a: () => {} }`,
            object: { a: () => {} },
            expect: [[], { a: () => {} }],
        },
    ];

    for (const { name, object, opts, expect: extected } of cases) {
        it(name, async () => {
            const [envs, ret] = extractEnvVarsFromObject(object, opts);

            expect(envs).toStrictEqual(extected[0]);
            expect(promisifyPulumiOutput(all([ret]).apply(([r]) => r))).resolves.toStrictEqual(extected[1]);
        });
    }
});
