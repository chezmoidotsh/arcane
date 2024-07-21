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
import { KubeConfig } from "@kubernetes/client-node";
import { randomUUID } from "crypto";
import tmp from "tmp";
import { TestOptions } from "vitest";

import * as kubernetes from "@pulumi/kubernetes";
import { ComponentResourceOptions, automation } from "@pulumi/pulumi";

import { toHaveCompliantLabels, toHaveCompliantSecurity } from "./kubernetes.expect";
import { pulumiScenario } from "./pulumi";

export { toHaveCompliantLabels, toHaveCompliantSecurity };

/**
 * `fakeKubernetesScenario` sets up a test scenario using a fake Kubernetes
 * environment. It extends the `pulumiScenario` function by creating a specific
 * provider that does not rely on any kubeconfig file, ensuring no interaction
 * with a real Kubernetes cluster.
 *
 * The function sets up the necessary Pulumi environment for the test scenario,
 * runs the provided Pulumi program, and executes the assertions once the stack operations are complete.
 *
 * @param name - The name of the test scenario.
 * @param options - The test options, including an optional expected result.
 * @param program - The Pulumi program function. It receives options for use
 *                  inside a component resource and a function that generates DNS-1035
 *                  compliant names.
 * @param assertions - The assertions to be executed after the Pulumi stack is created.
 *                     This is a callback function that receives a context object containing
 *                     the result of the stack update operation, allowing you to perform assertions
 *                     on the stack's state and outputs.
 */
export function fakeKubernetesScenario(
    name: string,
    options: TestOptions & { expectedResult?: automation.UpdateResult },
    program: (opts: ComponentResourceOptions, dns1035: () => string) => Promise,
    assertions: (context: { result?: automation.UpResult }) => void,
) {
    pulumiScenario(
        `${name} (on fake kubernetes)`,
        options,
        async () => {
            // NOTE: this is a workaround to prevent the kubernetes provider from
            //       using the kubeconfig file, as we want to use a fake kubernetes
            //       environment.
            delete process.env.KUBECONFIG;
            return await program(
                {
                    // NOTE: we create a specific provider that is not relying on any
                    //       kubeconfig file, as we don't want to use the real kubernetes
                    //       cluster.
                    providers: [
                        new kubernetes.Provider(randomUUID(), {
                            renderYamlToDirectory: tmp.dirSync({ unsafeCleanup: true }).name,
                        }),
                    ],
                },
                randomName,
            );
        },
        assertions,
    );
}

/**
 * `kubernetesScenario` sets up a test scenario using a real Kubernetes environment.
 * It extends the `pulumiScenario` function by creating a specific provider that
 * relies on a kubeconfig file, ensuring interaction with a real Kubernetes cluster.
 *
 * The function sets up the necessary Pulumi environment for the test scenario,
 * runs the provided Pulumi program, and executes the assertions once the stack operations are complete.
 *
 * @param name - The name of the test scenario.
 * @param options - The test options, including an optional expected result.
 * @param program - The Pulumi program function. It receives options for use
 *                  inside a component resource and a function that generates DNS-1035
 *                  compliant names.
 * @param assertions - The assertions to be executed after the Pulumi stack is created.
 *                     This is a callback function that receives a context object containing
 *                     the result of the stack update operation and the kubeconfig object,
 *                     allowing you to perform assertions on the stack's state and outputs,
 *                     as well as interact with the Kubernetes cluster.
 */
export function kubernetesScenario(
    name: string,
    options: TestOptions & { expectedResult?: automation.UpdateResult },
    program: (opts: ComponentResourceOptions, dns1035: () => string) => Promise,
    assertions: (context: { result?: automation.UpResult; kubeconfig: KubeConfig }) => void,
) {
    const kubeconfig = new KubeConfig();
    kubeconfig.loadFromDefault();
    options.skip = options.skip || !kubeconfig.contexts.length || kubeconfig.currentContext === "loaded-context";

    pulumiScenario(
        `${name} (on real kubernetes${options.skip ? "" : ` - '${kubeconfig.currentContext}'`})`,
        options,
        async () => {
            const namespace = new kubernetes.core.v1.Namespace(
                randomUUID(),
                { metadata: { name: randomName(), annotations: { "scenario.pulumi.dev/description": name } } },
                { provider: new kubernetes.Provider(randomUUID(), { kubeconfig: kubeconfig.exportConfig() }) },
            );

            return await program(
                {
                    providers: [
                        new kubernetes.Provider(randomUUID(), {
                            kubeconfig: kubeconfig.exportConfig(),
                            namespace: namespace.metadata.name,
                        }),
                    ],
                    dependsOn: [namespace],
                },
                randomName,
            );
        },
        (context) => {
            // NOTE: we must not deference the `context` object, as it is a
            //       reference to an object that will be updated by the
            //       `beforeAll` function, later on.
            const k_context = context as { result?: automation.UpResult; kubeconfig: KubeConfig };
            k_context.kubeconfig = kubeconfig;
            assertions(k_context);
        },
    );
}

/**
 * Generates a random name compliant with the DNS-1035 standard.
 * NOTE: the output is not guaranteed to be unique across multiple calls and the
 *       format is arbitrary because I found it "cool" and easy to see using tools
 *       like `kubectl get pods` ou `k9s`.
 *
 * @returns A random name compliant with the DNS-1035 standard and composed of 2 parts:
 *         - a 8 characters long hexadecimal number
 *         - a 2 characters long hexadecimal number
 */
function randomName(): string {
    const p1 = "abcdef"[Math.floor(Math.random() * 6)];
    const p2 = Math.floor(Math.random() * 0x10000000)
        .toString(16)
        .padStart(8, "0");
    const p3 = Math.floor(Math.random() * 0x100)
        .toString(16)
        .padStart(2, "0");
    return `${p1}${p2}-${p3}`;
}
