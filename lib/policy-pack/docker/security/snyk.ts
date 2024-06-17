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

import { spawn } from "child_process";

/**
 * Enum of possible Snyk severity thresholds.
 */
export declare enum SeverityThreshold {
    Low = "low",
    Medium = "medium",
    High = "high",
    Critical = "critical",
}

/**
 * Options for the Snyk scan.
 */
export interface ScanOpts {
    /**
     * Whether to exclude base image vulnerabilities.
     */
    excludeBaseImageVulns: boolean;

    /**
     * The severity threshold to fail on.
     */
    severityThreshold: SeverityThreshold;
}

/**
 * Scans Docker images for vulnerabilities using Snyk.
 */
export async function scanImage(image: string, opts?: ScanOpts): Promise<void> {
    const commandArgs = ["container", "test", image];
    if (opts?.excludeBaseImageVulns) {
        commandArgs.push("--exclude-base-image-vulns");
    }
    commandArgs.push(`--severity-threshold=${opts?.severityThreshold ?? SeverityThreshold.Critical}`);

    await new Promise<void>((resolve, reject) => {
        const child = spawn("snyk", commandArgs);
        const stdout: string[] = [];
        const stderr: string[] = [];

        child.stdout.on("data", (data) => {
            stdout.push(data.toString());
        });
        child.stderr.on("data", (data) => {
            stderr.push(data.toString());
        });

        child.on("error", (err) => {
            reject(`Snyk validation failed: ${err}`);
        });
        child.on("exit", (code) => {
            if (code !== 0) {
                let err = `Snyk validation failed with code ${code}`;
                if (stdout) {
                    err += `\n${stdout.join("\n")}`;
                }
                if (stderr) {
                    err += `\n${stderr.join("\n")}`;
                }

                reject(err);
            } else {
                resolve();
            }
        });
    });
}
