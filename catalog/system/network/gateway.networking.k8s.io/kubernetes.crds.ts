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

import { optsWithProvider } from "@pulumi.chezmoi.sh/core/pulumi";

import {
    backendlbpoliciesgatewaynetworkingksio,
    backendtlspoliciesgatewaynetworkingksio,
    gatewayclassesgatewaynetworkingksio,
    gatewaysgatewaynetworkingksio,
    grpcroutesgatewaynetworkingksio,
    httproutesgatewaynetworkingksio,
    referencegrantsgatewaynetworkingksio,
    tcproutesgatewaynetworkingksio,
    tlsroutesgatewaynetworkingksio,
    udproutesgatewaynetworkingksio,
} from "./kubernetes.crds.gen";

/**
 * The `GatewayAPICRDs` component creates the GatewayAPI CRDs required for the GatewayAPI Ingress Controller.
 */
export class GatewayAPICRDs extends pulumi.ComponentResource {
    /**
     * The CRDs created by this component.
     */
    public readonly crds: kubernetes.apiextensions.v1.CustomResourceDefinition[];

    constructor(opts?: pulumi.ComponentResourceOptions) {
        super("catalog:system:network:traefik:GatewayAPI:CRDs", "GatewayAPICRDs", {});

        this.crds = [
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "backendlbpolicies.gateway.networking.k8s.io",
                backendlbpoliciesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "backendtlspolicies.gateway.networking.k8s.io",
                backendtlspoliciesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "gatewayclasses.gateway.networking.k8s.io",
                gatewayclassesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "gateways.gateway.networking.k8s.io",
                gatewaysgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "grpcroutes.gateway.networking.k8s.io",
                grpcroutesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "httproutes.gateway.networking.k8s.io",
                httproutesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "referencegrants.gateway.networking.k8s.io",
                referencegrantsgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "tcproutes.gateway.networking.k8s.io",
                tcproutesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "tlsroutes.gateway.networking.k8s.io",
                tlsroutesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
            new kubernetes.apiextensions.v1.CustomResourceDefinition(
                "udproutes.gateway.networking.k8s.io",
                udproutesgatewaynetworkingksio as kubernetes.apiextensions.v1.CustomResourceDefinitionArgs,
                optsWithProvider(kubernetes.Provider, opts),
            ),
        ];
    }
}
