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

import { output } from "@pulumi/pulumi";

import { promisifyPulumiOutput } from "../../vitest-scenario/pulumi";
import { objectToArgs } from "./configuration";

describe("objectToArgs", () => {
    // should convert {} to an empty list of CLI argument
    // should convert { a: "value" } to CLI argument "--a=value"
    // should convert { a: 10 } to CLI argument "--a=10"
    // should convert { a: true } to CLI argument "--a"
    // should convert { a: false } to CLI argument "--a=false"
    // should convert { a: {} } to CLI argument "--a"
    // should convert { a: { b: {} } } to CLI argument "--a.b"
    // should convert { a: ["value"] } to CLI argument "--a[0]=value"
    // should convert { a: [{ b: "value" }] } to CLI argument "--a[0].b=value"
    // should convert { a: { b: "value" } } to CLI argument "--a.b=value"
    // should convert { a: { b: "value" }, c: true } to CLI argument ["--a.b=value", "--c"]
    // should convert { a: { b: "value" }, c: { d: true } } with a filter on 'a.b' to CLI argument ["--c.d"]
    // should convert { a: { b: "value" }, c: { d: true } } with an uppecase transform to CLI argument ["--A.B=value", "--C.D"]
    // should convert { a: pulumi.output("value") } to CLI argument "--a=value"

    const cases: { name: string; object: any; opts?: Parameters<typeof objectToArgs>[1]; args: string[] }[] = [
        {
            name: `should convert {} to CLI argument`,
            object: {},
            args: [],
        },
        {
            name: `should convert { a: "value" } to CLI argument "--a=value"`,
            object: { a: "value" },
            args: ["--a=value"],
        },
        {
            name: `should convert { a: 10 } to CLI argument "--a=10"`,
            object: { a: 10 },
            args: ["--a=10"],
        },
        {
            name: `should convert { a: true } to CLI argument "--a"`,
            object: { a: true },
            args: ["--a"],
        },
        {
            name: `should convert { a: false } to CLI argument "--a=false"`,
            object: { a: false },
            args: ["--a=false"],
        },
        {
            name: `should convert { a: {} } to CLI argument "--a"`,
            object: { a: {} },
            args: ["--a"],
        },
        {
            name: `should convert { a: { b: {} } } to CLI argument "--a.b"`,
            object: { a: { b: {} } },
            args: ["--a.b"],
        },
        {
            name: `should convert { a: ["value"] } to CLI argument "--a[0]=value"`,
            object: { a: ["value"] },
            args: ["--a[0]=value"],
        },
        {
            name: `should convert { a: [{ b: "value" }] } to CLI argument "--a[0].b=value"`,
            object: { a: [{ b: "value" }] },
            args: ["--a[0].b=value"],
        },
        {
            name: `should convert { a: { b: "value" } } to CLI argument "--a.b=value"`,
            object: { a: { b: "value" } },
            args: ["--a.b=value"],
        },
        {
            name: `should convert { a: { b: "value" }, c: true } to CLI argument ["--a.b=value", "--c"]`,
            object: { a: { b: "value" }, c: true },
            args: ["--a.b=value", "--c"],
        },
        {
            name: `should convert { a: { b: "value" }, c: { d: true } } with a flag prefix of '-' to CLI argument ["-a.b=value", "-c.d"]`,
            object: { a: { b: "value" }, c: { d: true } },
            opts: { flagPrefix: "-" },
            args: ["-a.b=value", "-c.d"],
        },
        {
            name: `should convert { a: { b: "value" }, c: { d: true } } with a filter on 'a.b' to CLI argument ["--c.d"]`,
            object: { a: { b: "value" }, c: { d: true } },
            opts: { allowed: (path) => path !== "--a.b" },
            args: ["--c.d"],
        },
        {
            name: `should convert { a: { b: "value" }, c: { d: true } } with an uppecase transform to CLI argument ["--A.B=value", "--C.D"]`,
            object: { a: { b: "value" }, c: { d: true } },
            opts: { transform: (path) => path.toUpperCase() },
            args: ["--A.B=value", "--C.D"],
        },
        {
            name: `should convert { a: pulumi.output("value") } to CLI argument "--a=value"`,
            object: { a: output(new Promise((r) => r("value"))) },
            args: ["--a=value"],
        },
        {
            name: `(UNFIXABLE) should convert { a: pulumi.output({ b: "value" }) } to CLI argument "--a=[object Object]"`,
            object: { a: output(output({ b: "value" })) },
            args: ["--a=[object Object]"],
        },
    ];

    for (const { name, object, opts, args } of cases) {
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
