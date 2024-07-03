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
 * Enum of possible Trivy severity thresholds.
 */
export declare enum SeverityThreshold {
    Low = "low",
    Medium = "medium",
    High = "high",
    Critical = "critical",
}
const SeverityThresholds: Record<string, string> = {
    ["low"]: "LOW,MEDIUM,HIGH,CRITICAL",
    ["medium"]: "MEDIUM,HIGH,CRITICAL",
    ["high"]: "HIGH,CRITICAL",
    ["critical"]: "CRITICAL",
};

/**
 * Enum of possible Trivy vulnerability types.
 */
export declare enum VulnerabilityType {
    OS = "os",
    Library = "library",
}

/**
 * Options for the Trivy scan.
 */
export interface ScanOpts {
    /**
     * Do not issue API requests to identify dependencies.
     */
    offlineScan: boolean;

    /**
     * Skip update of vulnerability database.
     */
    skipUpdate?: boolean;

    /**
     * Ignore vulnerabilities that cannot be fixed.
     */
    ignoreUnfixed?: boolean;

    /**
     * Show all progress and log messages.
     */
    verbose?: boolean;

    /**
     * List of vulnerability types to scan for.
     */
    vulnerabilityTypes?: VulnerabilityType[];

    /**
     * The severity threshold to fail on.
     */
    severityThreshold?: SeverityThreshold;
}

/**
 * Scans Docker images for vulnerabilities using Trivy.
 */
export async function scanImage(image: string, opts?: ScanOpts): Promise<void> {
    const commandArgs = ["image", "--format=table", "--exit-code=254", "--exit-on-eol=253", "--no-progress"];
    if (opts?.offlineScan) {
        commandArgs.push("--offline-scan");
    }
    if (opts?.skipUpdate) {
        commandArgs.push("--skip-update");
    }
    if (opts?.ignoreUnfixed) {
        commandArgs.push("--ignore-unfixed");
    }
    if (!(opts?.verbose ?? false)) {
        commandArgs.push("--quiet");
    }

    commandArgs.push(`--severity=${SeverityThresholds[opts?.severityThreshold ?? SeverityThreshold.Critical]}`);
    commandArgs.push(
        `--vuln-type=${(opts?.vulnerabilityTypes ?? [VulnerabilityType.OS, VulnerabilityType.Library]).join(",")}`,
    );
    commandArgs.push(image);

    await new Promise<void>((resolve, reject) => {
        const child = spawn("trivy", commandArgs);
        const stdout: string[] = [];
        const stderr: string[] = [];

        child.stdout.on("data", (data) => {
            stdout.push(data.toString());
        });
        child.stderr.on("data", (data) => {
            stderr.push(data.toString());
        });

        child.on("error", (err) => {
            reject(`Trivy validation failed: ${err}`);
        });
        child.on("exit", (code) => {
            if (code !== 0) {
                let err = `Trivy validation failed with code ${code}`;
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
