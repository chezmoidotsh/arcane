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
import _ from "lodash";

import { Input } from "@pulumi/pulumi";

import { objectToArgs } from "@pulumi.chezmoi.sh/core/utils/configuration";

import { TraefikV2JsonSchema } from "./json-schema";

/**
 * Traefik configuration.
 */
export type TraefikConfiguration = FromSchema<typeof TraefikV2JsonSchema>;
export const TraefikConfiguration = {
    toCLI: (opts: Parameters<typeof objectToArgs>[1], ...configuration: TraefikConfiguration[]) =>
        objectToArgs(_.merge({}, ...configuration), opts),
};
