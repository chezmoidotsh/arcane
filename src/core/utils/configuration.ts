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
import { core } from "@pulumi/kubernetes/types/input";
import { Output, interpolate, output } from "@pulumi/pulumi";

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
    if (Output.isInstance(object)) {
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

/**
 * Environment variable definition.
 */
export type EnvVar = Required<Omit<core.v1.EnvVar, "value">> & {
    opts?: {
        /**
         * Function to format the EnvVar name.
         * @param name Environment variable name
         * @default (s) => ${s}
         */
        format?: (name: string) => string;
    };
};
export const EnvVar = {
    /**
     * Check if the given object is an instance of Environ.
     * @param object Object to check
     * @returns True if the object is an instance of Environ
     */
    isInstance: (object: any): object is EnvVar => {
        return typeof object === "object" && object !== null && "name" in object && "valueFrom" in object;
    },
};

/**
 * Enforce environment variables to be used in the given object where primitives are expected.
 */
export type WithEnvVar<T> = T extends string | number | boolean
    ? EnvVar | T
    : T extends Output<infer U>
      ? U extends string | number | boolean
          ? EnvVar | Output<U>
          : Output<U>
      : T extends (infer U)[]
        ? WithEnvVar<U>[]
        : T extends object
          ? { [K in keyof T]: WithEnvVar<T[K]> }
          : T;

/**
 * Remove all EnvVar instances from the given object and replace them with their value.
 */
export type WithoutEnvVar<T> = T extends EnvVar
    ? Output<string>
    : T extends Output<infer U>
      ? Output<U>
      : T extends (infer U)[]
        ? WithoutEnvVar<U>[]
        : T extends object
          ? { [K in keyof T]: WithoutEnvVar<T[K]> }
          : T;

/**
 * Extract environment variables from the given object and replace them with a reference to the environ.
 * @param object Object to extract environs from
 * @param opts Options used to control the extraction
 * @returns Tuple of extracted environs and the object with environs replaced
 */
export function extractEnvVarsFromObject<T>(
    object: T,
    opts?: Pick<EnvVar, "opts">["opts"],
): [core.v1.EnvVar[], WithoutEnvVar<T>] {
    const [environs, ret] = extractEnvVarsFromObjectImpl(object, {
        ...{ format: (name) => `$\{${name}\}` },
        ...opts,
    });

    return [
        environs.map((e) => {
            delete e.opts;
            return e;
        }),
        ret,
    ];
}

function extractEnvVarsFromObjectImpl<T>(
    object: T,
    opts: { format: (s: string) => string },
    path: string = "",
): [EnvVar[], WithoutEnvVar<T>] {
    if (object === null || object === undefined || Output.isInstance(object)) {
        // No environs possible to extract
        return [[], object as WithoutEnvVar<T>];
    }

    if (EnvVar.isInstance(object)) {
        return [[object], output(object.name).apply(object.opts?.format ?? opts.format) as WithoutEnvVar<T>];
    }

    if (typeof object === "object") {
        if (Array.isArray(object)) {
            const environs: EnvVar[] = [];
            const elements: unknown[] = [];
            for (const [index, element] of object.entries()) {
                const [envs, ret] = extractEnvVarsFromObjectImpl(element, opts, `${path}[${index}]`);
                environs.push(...envs);
                elements.push(ret);
            }
            return [environs, elements as WithoutEnvVar<T>];
        } else {
            const environs: EnvVar[] = [];
            const elements: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(object)) {
                const [envs, ret] = extractEnvVarsFromObjectImpl(value, opts, path ? `${path}.${key}` : key);
                environs.push(...envs);
                elements[key] = ret;
            }
            return [environs, elements as WithoutEnvVar<T>];
        }
    }

    return [[], object as WithoutEnvVar<T>];
}
