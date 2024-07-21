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
import * as builkit from "@pulumi/docker-build";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { gateway } from "@pulumi/kubernetes-gateway.networking.k8s.io/types/input";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { ReadAsset, SecretAsset, getProvider } from "@chezmoi.sh/core/utils";

import { ImageArgs, yaLDAPImage } from "./image";
import { Version } from "./version";

export { yaLDAPImage, Version };
export const Defaults = {
    resources: {
        yaldap: {
            requests: { cpu: "100m", memory: "32Mi" },
            limits: { memory: "32Mi" },
        },
    },
};

/**
 * The set of arguments for constructing a yaLDAP application.
 * @see {@link yaLDAP}
 */
export interface yaLDAPArgs {
    /**
     * The metadata for the yaLDAP Kubernetes resources.
     */
    metadata?: Pick;

    /**
     * The set of arguments for constructing the yaLDAP Docker image.
     */
    image: ImageArgs;

    /**
     * The configuration for the yaLDAP application.
     */
    configuration:
        | {
              /**
               * Raw yaLDAP YAML backend configuration content.
               * @see {@link https://github.com/chezmoi-sh/yaldap}
               */
              raw: SecretAsset;
          }
        | {
              /**
               *
               */
              secret: pulumi.Input;
          };

    /**
     * The specification for the yaLDAP Kubernetes deployment.
     */
    spec?: {
        /**
         * List of references to secrets in the same namespace to use for pulling any of the
         * images used by the yaLDAP workload.
         */
        imagePullSecrets?: pulumi.Input;

        /**
         * Scheduling constraints required the yaLDAP workload.
         */
        scheduling?: Pick;

        /**
         * Compute Resources required by the yaLDAP workload.
         * More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         */
        resources?: kubernetes.types.input.core.v1.ResourceRequirements;

        /**
         * Ingress endpoints configuration for the yaLDAP workload.
         */
        endpoints?: Pick;
    };
}

/**
 * This component deploys the yaLDAP application through a Kubenretes work;oad in a opinionated way.
 * Only the yaLDAP configuration and some others options like scheduling, endpoints or resources are
 * exposed to the user.
 *
 * @see {@link https://github.com/chezmoi-sh/yaldap}
 */
export class yaLDAP extends pulumi.ComponentResource {
    /**
     * The version of the yaLDAP application.
     */
    public readonly version: string = Version;

    /**
     * The Kubernetes resources created by this component
     */
    public readonly resources: {
        image: builkit.Image;
        secret?: kubernetes.core.v1.Secret;
        service: kubernetes.core.v1.Service;
        tcproute?: kubernetes.apiextensions.CustomResource;
        workload: kubernetes.apps.v1.Deployment;
    };

    constructor(name: string, args: yaLDAPArgs, opts?: pulumi.ComponentResourceOptions) {
        super("catalog:applications:security:yaLDAP", name, {}, opts);
        const metadata = {
            annotations: args.metadata?.annotations,
            labels: {
                ...(args.metadata?.labels ?? {}),
                "app.kubernetes.io/name": name,
                "app.kubernetes.io/instance": `${name}-${pulumi.getProject()}-${pulumi.getStack()}`,
                "app.kubernetes.io/version": this.version,
                "app.kubernetes.io/part-of": "yaldap",
                "app.kubernetes.io/managed-by": "pulumi.chezmoi.sh",
                "pulumi.com/project": pulumi.getProject(),
                "pulumi.com/stack": pulumi.getStack(),
            },
            namespace: args.metadata?.namespace,
        };
        const resources: any = {};

        // -- Create the yaLDAP backend configuration secret if needed
        let secretRef: kubernetes.types.input.core.v1.SecretVolumeSource;
        if ("secret" in args.configuration) {
            secretRef = {
                ...args.configuration.secret,
                items: [{ key: "backend.yaml", path: "backend.yaml" }],
            };
        } else {
            resources["secret"] = new kubernetes.core.v1.Secret(
                `${name}:yaldap-backend`,
                {
                    metadata: {
                        ...metadata,
                        labels: { ...metadata.labels, "apply.kubernetes.io/component": "yaldap-backend" },
                        name: `${name}-backend`,
                    },
                    data: {
                        "backend.yaml": pulumi.secret(
                            ReadAsset(args.configuration.raw.asset).then((content) => content.toString("base64")),
                        ),
                    },
                },
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );

            secretRef = {
                secretName: resources["secret"].metadata.name,
                items: [{ key: "backend.yaml", path: "backend.yaml" }],
            };
        }

        // -- Create the yaLDAP workload
        const image = new yaLDAPImage(name, args.image, { parent: this });
        resources["workload"] = new kubernetes.apps.v1.Deployment(
            `${name}:deployment`,
            {
                metadata: { ...metadata, name: `${name}-ldap` },
                spec: {
                    selector: { matchLabels: metadata.labels },
                    replicas: 1,
                    // NOTE: LDAP server is stateless, so we can use a rolling update strategy
                    strategy: { type: "RollingUpdate" },
                    template: {
                        metadata: { ...metadata, name: `${name}-ldap` },
                        spec: {
                            automountServiceAccountToken: false,
                            containers: [
                                {
                                    name: "yaldap",

                                    image: image.ref,
                                    ports: [{ containerPort: 8389, name: "ldap", protocol: "TCP" }],
                                    livenessProbe: {
                                        tcpSocket: { port: 8389 },
                                        initialDelaySeconds: 5,
                                        periodSeconds: 5,
                                        failureThreshold: 3,
                                    },
                                    readinessProbe: {
                                        tcpSocket: { port: 8389 },
                                        initialDelaySeconds: 5,
                                        periodSeconds: 5,
                                        failureThreshold: 3,
                                    },

                                    resources: {
                                        requests: {
                                            ...Defaults.resources.yaldap.requests,
                                            ...(args.spec?.resources?.requests ?? {}),
                                        },
                                        limits: {
                                            ...Defaults.resources.yaldap.limits,
                                            ...(args.spec?.resources?.limits ?? {}),
                                        },
                                    },

                                    // enforced security best practices
                                    securityContext: {
                                        allowPrivilegeEscalation: false,
                                        capabilities: { drop: ["ALL"] },
                                        privileged: false,
                                        readOnlyRootFilesystem: true,
                                    },

                                    volumeMounts: [
                                        {
                                            name: "yaldap-backend",
                                            mountPath: "/etc/yaldap",
                                            readOnly: true,
                                        },
                                    ],
                                },
                            ],
                            restartPolicy: "Always",
                            securityContext: {
                                fsGroup: 64885,
                                runAsGroup: 64885,
                                runAsNonRoot: true,
                                runAsUser: 64885,
                            },
                            terminationGracePeriodSeconds: 15,
                            volumes: [
                                {
                                    name: "yaldap-backend",
                                    secret: secretRef,
                                },
                            ],

                            affinity: args.spec?.scheduling?.affinity,
                            imagePullSecrets: args.spec?.imagePullSecrets,
                            nodeSelector: args.spec?.scheduling?.nodeSelector,
                            tolerations: args.spec?.scheduling?.tolerations,
                        },
                    },
                },
            },
            {
                ...opts,
                ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
            },
        );

        // -- Create the yaLDAP service and Gateway API route if needed
        resources["service"] = new kubernetes.core.v1.Service(
            `${name}:service`,
            {
                metadata: { ...metadata, name: `${name}-ldap` },
                spec: {
                    ports: [{ name: "ldap", port: 389, targetPort: 8389, protocol: "TCP" }],
                    selector: metadata.labels,
                },
            },
            {
                ...opts,
                ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
            },
        );
        if (args.spec?.endpoints?.parentRefs) {
            // NOTE: Unfortunately, the generated TCPRoute type by crd2pulumi crashes
            //       when it is used inside automation tests. This is why we are using
            //       the CustomResource type directly.
            resources["tcproute"] = new kubernetes.apiextensions.CustomResource(
                `${name}:tcp-route`,
                {
                    apiVersion: "gateway.networking.k8s.io/v1alpha2",
                    kind: "TCPRoute",
                    metadata: { ...metadata, name: `${name}-ldap` },
                    spec: {
                        parentRefs: args.spec?.endpoints?.parentRefs,
                        rules: [
                            {
                                backendRefs: [
                                    {
                                        kind: "Service",
                                        name: resources["service"].metadata.name,
                                        namespace: resources["service"].metadata.namespace,
                                        port: 389,
                                    },
                                ],
                            },
                        ],
                    },
                },
                {
                    ...opts,
                    ...{ parent: this, provider: getProvider(kubernetes.Provider, opts), providers: undefined },
                },
            );
        }

        this.resources = resources;
    }
}
