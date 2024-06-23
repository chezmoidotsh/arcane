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
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import { PolicyPack, validateResourceOfType } from "@pulumi/policy";

import * as trivy from "./trivy";

const policies = new PolicyPack("docker-security", {
    enforcementLevel: "mandatory",
    policies: [
        // -- Policy to scan Docker images for vulnerabilities using Trivy
        {
            name: "trivy-container-scan",
            description: "Scans Docker Images with Trivy",
            configSchema: {
                properties: {
                    offlineScan: {
                        default: false,
                        type: "boolean",
                    },
                    skipUpdate: {
                        default: false,
                        type: "boolean",
                    },
                    ignoreUnfixed: {
                        default: false,
                        type: "boolean",
                    },
                    verbose: {
                        default: false,
                        type: "boolean",
                    },
                    severityThreshold: {
                        default: "critical",
                        enum: ["low", "medium", "high", "critical"],
                    },
                    vulnerabilityTypes: {
                        default: ["os", "library"],
                        items: {
                            enum: ["os", "library"],
                        },
                        type: "array",
                    },
                },
            },
            validateResource: [
                validateResourceOfType(docker.Container, async (container, args, reportViolation) => {
                    const opts = args.getConfig<trivy.ScanOpts>();
                    const sourceRef = container.labels?.find((l) => l.label === "org.opencontainers.image.source.ref");
                    if (!sourceRef && container.image.startsWith("sha256:")) {
                        pulumi.log.warn(
                            `Container image "${args.name}" (${args.urn}) does not have the label "org.opencontainers.image.source.ref", ` +
                                "which is required for this policy to work properly.\n" +
                                "NOTE: The field 'image.name' sometimes only contains the digest which is not enough for Trivy to find " +
                                "the image.",
                        );
                        return;
                    }

                    await trivy
                        .scanImage(sourceRef?.value ?? container.image, opts)
                        .catch((e: any) => reportViolation(e));
                }),
            ],
        },
    ],
});
