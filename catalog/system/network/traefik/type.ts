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
import { FromSchema } from "json-schema-to-ts";

import { TraefikV2JsonSchema } from "./json-schema";

/**
 * Traefik configuration.
 */
export type TraefikConfiguration = FromSchema<typeof TraefikV2JsonSchema>;

/**
 * Generate CLI arguments from a Traefik configuration.
 * @param configuration Traefik configuration to convert to CLI arguments
 * @returns List of CLI arguments
 */
export function TraefikConfiguration(configuration: TraefikConfiguration): string[] {
    return objectToCLI(configuration);
}

function objectToCLI(obj: any, prefix: string = ""): string[] {
    const args: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        const flag = prefix ? `${prefix}.${key}` : key;

        if (typeof value === "object" && value !== null) {
            args.push(...objectToCLI(value, flag));
        } else if (typeof value === "boolean" && value === true) {
            args.push(`--${flag}`);
        } else {
            args.push(`--${flag}=${value}`);
        }
    }
    return args;
}
