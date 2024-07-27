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
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import { getProvider } from "@pulumi.chezmoi.sh/core/pulumi";

import {
    ingressroutestraefikio,
    ingressroutetcpstraefikio,
    ingressrouteudpstraefikio,
    middlewarestraefikio,
    middlewaretcpstraefikio,
    serverstransportstraefikio,
    serverstransporttcpstraefikio,
    tlsoptionstraefikio,
    tlsstorestraefikio,
    traefikservicestraefikio,
} from "./kubernetes.crds.gen";

/**
 * The `TraefikCRDs` component creates the Traefik CRDs required for the Traefik Ingress Controller.
 */
export class TraefikCRDs extends pulumi.ComponentResource {
    /**
     * The CRDs created by this component.
     */
    public readonly crds: kubernetes.apiextensions.v1.CustomResourceDefinition[];

    constructor(opts?: pulumi.ComponentResourceOptions) {
        super("catalog:system:network:traefik:Traefik:CRDs", "TraefikCRDs", {});

        this.crds = [
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "ingressroutes.traefik.io",
                ingressroutestraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "ingressroutestcp.traefik.io",
                ingressroutetcpstraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "ingressrouteudp.traefik.io",
                ingressrouteudpstraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "middlewares.traefik.io",
                middlewarestraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "middlewarestcp.traefik.io",
                middlewaretcpstraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "serverstransports.traefik.io",
                serverstransportstraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "serverstransportstcp.traefik.io",
                serverstransporttcpstraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "tlsoptions.traefik.io",
                tlsoptionstraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "tlsstores.traefik.io",
                tlsstorestraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "traefikservices.traefik.io",
                traefikservicestraefikio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            ),
        ];
    }
}
