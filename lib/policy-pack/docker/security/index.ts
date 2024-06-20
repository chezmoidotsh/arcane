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

import { PolicyPack, ReportViolation, StackValidationArgs } from "@pulumi/policy";

import * as trivy from "./trivy";

const policies = new PolicyPack("docker-security", {
    enforcementLevel: "advisory",
    policies: [
        // -- Policy to scan Docker images for vulnerabilities using Trivy
        {
            name: "trivy-container-scan",
            description: "Scans Docker Images with Trivy",
            enforcementLevel: "advisory",
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
            validateStack: async (args: StackValidationArgs, reportViolation: ReportViolation) => {
                const opts = args.getConfig<trivy.ScanOpts>();

                const legacyImages = args.resources
                    .filter((r) => r.type === "docker:index/image:Image")
                    .map((r) => r.props.imageName as string);
                const remoteImages = args.resources
                    .filter((r) => r.type === "docker:index/remoteImage:RemoteImage")
                    .map((r) => r.props.repoDigest as string);
                const buildxImages = args.resources
                    .filter((r) => r.type === "docker-build:index:Image")
                    .map((r) => r.props.ref as string);
                const images = [...legacyImages, ...buildxImages, ...remoteImages];

                let scan: Array<Promise<void>> = [];
                for (const image of images) {
                    scan.push(trivy.scanImage(image, opts).catch((e: any) => reportViolation(e)));
                }

                await Promise.all(scan);
            },
        },
    ],
});
