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

import { TraefikConfiguration } from "./type";

describe("(System/Network) Traefik", () => {
    describe("#objectToCLI", () => {
        const cases: { configuration: TraefikConfiguration; flags: string[] }[] = [
            {
                configuration: {},
                flags: [],
            },
            {
                configuration: { experimental: { http3: true, kubernetesGateway: false } },
                flags: ["--experimental.http3", "--experimental.kubernetesGateway=false"],
            },
            {
                configuration: {
                    entryPoints: { web: { address: ":80" }, traefik: { address: ":9000" } },
                    experimental: { http3: true, kubernetesGateway: true },
                    ping: { entryPoint: "traefik", terminatingStatusCode: 503 },
                },
                flags: [
                    "--entryPoints.web.address=:80",
                    "--entryPoints.traefik.address=:9000",
                    "--experimental.http3",
                    "--experimental.kubernetesGateway",
                    "--ping.entryPoint=traefik",
                    "--ping.terminatingStatusCode=503",
                ],
            },
        ];

        cases.forEach(({ configuration, flags }) => {
            it(`should convert ${JSON.stringify(configuration)} to CLI`, () => {
                expect(TraefikConfiguration(configuration).sort()).toEqual(flags.sort());
            });
        });
    });
});
