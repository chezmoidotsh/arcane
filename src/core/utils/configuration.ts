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
import { Output, interpolate } from "@pulumi/pulumi";

/**
 * Generate CLI arguments based on the given object.
 * @param object Object to convert to CLI arguments
 * @param opts Options used to control the conversion
 * @returns List of CLI arguments
 */
export function objectToArgs(
    object: any,
    opts?: {
        /*
         * Prefix to use for flags.
         * @default "--"
         */
        flagPrefix?: string;

        /*
         * Function to determine if a flag is allowed.
         * @default all allowed
         */
        allowed?: (path: string) => boolean;

        /*
         * Function to transform the flag path.
         * @default none
         */
        transform?: (path: string) => string;
    },
): Output<string>[] {
    return objectToArgsImpl(object, {
        ...{ flagPrefix: "--", allowed: () => true, transform: (path) => path },
        ...opts,
    });
}

function objectToArgsImpl(
    object: any,
    opts: Required<Parameters<typeof objectToArgs>[1]>,
    path: string = "",
): Output<string>[] {
    if (object === null || object === undefined) {
        return [];
    }

    switch (typeof object) {
        case "object":
            if (Output.isInstance(object)) {
                // handle this kind of value later
                break;
            }

            if (Object.keys(object).length === 0) {
                // ignore root object
                if (!path) {
                    return [];
                }

                const flag = opts!.transform(`${opts!.flagPrefix}${path}`);
                if (opts!.allowed(flag)) {
                    return [interpolate`${flag}`];
                }
            } else if (Array.isArray(object)) {
                const args: Output<string>[] = [];
                for (const [index, element] of object.entries()) {
                    args.push(...objectToArgsImpl(element, opts, `${path}[${index}]`));
                }
                return args;
            } else {
                const args: Output<string>[] = [];
                for (const [key, value] of Object.entries(object)) {
                    args.push(...objectToArgsImpl(value, opts, path ? `${path}.${key}` : key));
                }
                return args;
            }
            break;

        case "boolean":
        case "number":
        case "string":
            // ignore root object
            if (!path) {
                return [];
            }

            const flag = opts!.transform(`${opts!.flagPrefix}${path}`);
            if (opts!.allowed(flag)) {
                if (typeof object === "boolean" && object === true) {
                    return [interpolate`${flag}`];
                } else {
                    return [interpolate`${flag}=${object}`];
                }
            }
            return [];

        default:
            throw new Error(`Unsupported type for '${path}': ${typeof object}`);
    }

    // NOTE: handle the case where the object is a pulumi.Output
    if (Output.isInstance<"boolean" | "number" | "string">(object)) {
        // ignore root object
        if (!path) {
            return [];
        }

        const flag = opts!.transform(`${opts!.flagPrefix}${path}`);
        if (opts!.allowed(flag)) {
            return [interpolate`${flag}=${object}`];
        }
    }

    throw new Error(`Unsupported type for '${path}': unknown type`);
}
