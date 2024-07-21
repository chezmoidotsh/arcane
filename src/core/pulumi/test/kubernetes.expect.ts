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
import { expect } from "vitest";

/**
 * Extends the `expect` vitest object with custom matchers to validate Kubernetes objects
 * labels for compliance with the required `catalog` labels.
 * These requried labels are:
 *   - app.kubernetes.io/instance → The instance of the application
 *   - app.kubernetes.io/managed-by → The tool being used to manage the application
 *   - app.kubernetes.io/name → The name of the application
 *   - app.kubernetes.io/part-of → The name of the higher level application this one is part of
 *   - app.kubernetes.io/version → The version of the application
 *   - pulumi.com/project → The Pulumi project name
 *   - pulumi.com/stack → The Pulumi stack name
 */
export function toHaveCompliantLabels(received: any) {
    if (received?.metadata?.labels === undefined || typeof received.metadata.labels !== "object") {
        return {
            message: () => `expected to be a Kubernetes object (metadata.labels is missing)`,
            pass: false,
        };
    }

    const expectedLabels = [
        "app.kubernetes.io/instance",
        "app.kubernetes.io/managed-by",
        "app.kubernetes.io/name",
        "app.kubernetes.io/part-of",
        "app.kubernetes.io/version",
        "pulumi.com/project",
        "pulumi.com/stack",
    ];
    const receivedLabels = Object.keys(received.metadata.labels);
    const missingLabels = expectedLabels.filter((label) => !receivedLabels.includes(label));

    return {
        message: () => "expected to have all required labels",
        pass: missingLabels.length === 0,
        actual: receivedLabels,
        expected: expectedLabels,
    };
}

/**
 * Extends the `expect` vitest object with custom matchers to validate Kubernetes workloads
 * for compliance with the required security best-practices.
 * These best-practices are:
 * - spec.template.spec.securityContext.runAsGroup MUST be defined
 * - spec.template.spec.securityContext.runAsUser MUST be defined
 * - spec.template.spec.securityContext.fsGroup MUST be equal to runAsGroup
 * - spec.template.spec.securityContext.runAsNonRoot MUST be true
 * - spec.template.spec.containers[*].securityContext.allowPrivilegeEscalation MUST be false
 * - spec.template.spec.containers[*].securityContext.capabilities.add MUST be empty
 * - spec.template.spec.containers[*].securityContext.capabilities.drop MUST be ['ALL']
 * - spec.template.spec.containers[*].securityContext.privileged MUST be false
 * - spec.template.spec.containers[*].securityContext.readOnlyRootFilesystem MUST be true
 * - spec.template.spec.containers[*].securityContext.runAsGroup MUST NOT be defined as it is inherited from the Pod
 * - spec.template.spec.containers[*].securityContext.runAsNonRoot MUST NOT be defined as it is inherited from the Pod
 * - spec.template.spec.containers[*].securityContext.runAsUser MUST NOT be defined as it is inherited from the Pod
 */
export function toHaveCompliantSecurity(received: any) {
    const hasSecurityContext =
        received?.spec?.template?.spec?.securityContext !== undefined &&
        typeof received.spec.template.spec.securityContext === "object";
    const hasContainers =
        received?.spec?.template?.spec?.containers !== undefined &&
        Array.isArray(received.spec.template.spec.containers);

    if (!hasSecurityContext || !hasContainers) {
        return {
            message: () =>
                `expected to have a Kubernetes workload with a PodTemplateSpec (spec.template.spec.securityContext and/or spec.template.spec.containers are missing)`,
            pass: false,
        };
    }

    const issues: string[] = [];

    const securityContext = received.spec.template.spec.securityContext;
    if (securityContext.runAsGroup === undefined) {
        issues.push("spec.template.spec.securityContext.runAsGroup is missing");
    }
    if (securityContext.runAsUser === undefined) {
        issues.push("spec.template.spec.securityContext.runAsUser is missing");
    }
    if (securityContext.fsGroup !== undefined && securityContext.fsGroup !== securityContext.runAsGroup) {
        issues.push("spec.template.spec.securityContext.fsGroup must be equal to runAsGroup");
    }
    if (securityContext.runAsNonRoot !== true) {
        issues.push("spec.template.spec.securityContext.runAsNonRoot must be true");
    }

    for (const idx in received.spec.template.spec.containers) {
        const container = received.spec.template.spec.containers[idx];

        if (container.securityContext === undefined) {
            issues.push(`spec.template.spec.containers[${idx}].securityContext is missing`);
        } else {
            if (container.securityContext.allowPrivilegeEscalation !== false) {
                issues.push(
                    `spec.template.spec.containers[${idx}].securityContext.allowPrivilegeEscalation must be false`,
                );
            }

            if (
                container.securityContext.capabilities?.drop === undefined ||
                !Array.isArray(container.securityContext.capabilities.drop) ||
                !container.securityContext.capabilities.drop.includes("ALL")
            ) {
                issues.push(`spec.template.spec.containers[${idx}].securityContext.capabilities.drop must be ['ALL']`);
            }

            if (
                container.securityContext.capabilities?.add !== undefined &&
                Array.isArray(container.securityContext.capabilities.add) &&
                container.securityContext.capabilities.add.length > 0
            ) {
                issues.push(`spec.template.spec.containers[${idx}].securityContext.capabilities.add must be empty`);
            }

            if (container.securityContext.privileged !== false) {
                issues.push(`spec.template.spec.containers[${idx}].securityContext.privileged must be false`);
            }

            if (container.securityContext.readOnlyRootFilesystem !== true) {
                issues.push(
                    `spec.template.spec.containers[${idx}].securityContext.readOnlyRootFilesystem must be true`,
                );
            }

            if (container.securityContext.runAsGroup !== undefined) {
                issues.push(`spec.template.spec.containers[${idx}].securityContext.runAsGroup must not be defined`);
            }
            if (container.securityContext.runAsUser !== undefined) {
                issues.push(`spec.template.spec.containers[${idx}].securityContext.runAsUser must not be defined`);
            }
            if (container.securityContext.runAsNonRoot !== undefined) {
                issues.push(`spec.template.spec.containers[${idx}].securityContext.runAsNonRoot must not be defined`);
            }
        }
    }

    if (issues.length) {
        return {
            message: () =>
                `expected to have a Kubernetes workload with compliant security settings: \n  - ${issues.join("\n  - ")}`,
            pass: false,
        };
    }
    return { message: () => "all security settings are compliant", pass: true };
}
