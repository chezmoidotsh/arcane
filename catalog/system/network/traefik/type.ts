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
import _ from "lodash";

import { core } from "@pulumi/kubernetes/types/input";
import { Output } from "@pulumi/pulumi";

import { InputOnPrimitive } from "@pulumi.chezmoi.sh/core/pulumi/types";
import { WithEnvVar, extractEnvVarsFromObject, objectToArgs } from "@pulumi.chezmoi.sh/core/utils/configuration";

import { HttpsJsonSchemastoreOrgTraefikV2Json } from "./type.gen";

type _fixedHttpsJsonSchemastoreOrgTraefikV2Json = HttpsJsonSchemastoreOrgTraefikV2Json;

/**
 * Traefik configuration.
 */
export type TraefikConfiguration = WithEnvVar<
    InputOnPrimitive<
        _fixedHttpsJsonSchemastoreOrgTraefikV2Json & {
            // NOTE: traefik port is required for some internal checks (ping) and must not be edited
            entryPoints?: {
                traefik?: never;
            };
            ping?: { entryPoint?: never };

            // Disable some features
            experimental?: { localplugins?: never; plugins?: never };
            hub?: never;
            providers?: {
                consul?: never;
                consulCatalog?: never;
                docker?: never;
                ecs?: never;
                etcd?: never;
                file?: never;
                http?: never;
                marathon?: never;
                nomad?: never;
                plugin?: never;
                rancher?: never;
                redis?: never;
                rest?: never;
                swarm?: never;
                zooKeeper?: never;
            };
        }
    >
>;
export const TraefikConfiguration = {
    toCLI: (
        opts: Parameters<typeof objectToArgs>[1],
        ...configurations: TraefikConfiguration[]
    ): [core.v1.EnvVar[], Output<string>[]] => {
        const [envs, configuration] = extractEnvVarsFromObject<TraefikConfiguration>(_.merge({}, ...configurations));
        return [envs, objectToArgs(configuration, opts)];
    },
};
