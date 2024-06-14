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

import * as snyk from "./snyk";

const policies = new PolicyPack("docker-security", {
    enforcementLevel: "mandatory",
    policies: [
        // -- Policy to scan Docker images for vulnerabilities using Snyk
        {
            name: "snyk-container-scan",
            description: "Scans Docker Images with Snyk",
            enforcementLevel: "mandatory",
            configSchema: {
                properties: {
                    excludeBaseImageVulns: {
                        default: false,
                        type: "boolean",
                    },
                    severityThreshold: {
                        default: "critical",
                        enum: ["low", "medium", "high", "critical"],
                    },
                },
            },
            validateStack: async (args: StackValidationArgs, reportViolation: ReportViolation) => {
                const opts = args.getConfig<snyk.ScanOpts>();

                const legacyImages = args.resources.filter(r => r.type === "docker:index/image:Image").map(r => r.props.imageName as string);
                const buildxImages = args.resources.filter(r => r.type === "docker-build:index:Image").map(r => r.props.ref as string);
                const images = [...legacyImages, ...buildxImages];

                let scan: Array<Promise<void>> = [];
                for (const image of images) {
                    scan.push(
                        snyk.scanImage(image, opts)
                            .catch((e: any) => reportViolation(e))
                    );
                }

                await Promise.all(scan);
            },
        }
    ]
});
