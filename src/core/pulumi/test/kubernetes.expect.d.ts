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
import type { Assertion, AsymmetricMatchersContaining } from "vitest";

interface KubernetesExtendsMatchers<R = unknown> {
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
    toHaveCompliantLabels: () => R;

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
    toHaveCompliantSecurity: () => R;
}

declare module "vitest" {
    interface Assertion<T = any> extends KubernetesExtendsMatchers {}
    interface AsymmetricMatchersContaining {}
}
