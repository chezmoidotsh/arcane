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
import { FromSchema } from "json-schema-to-ts";

import * as buildkit from "@pulumi/docker-build";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import {
    AdditionnalSpec,
    KubernetesApplication,
    KubernetesApplicationArgs,
    KubernetesApplicationStatus,
} from "@pulumi.chezmoi.sh/core/kubernetes/applications";
import { optsWithProvider } from "@pulumi.chezmoi.sh/core/pulumi";
import { ValueType } from "@pulumi.chezmoi.sh/core/utils/type";

import { TraefikImage } from "./image";
import { TraefikV2JsonSchema } from "./json-schema";
import { TraefikConfiguration } from "./type";
import { splitHostPortProtocol } from "./utils";
import { Version } from "./version";

export { TraefikImage, Version };
export const Defaults = {
    resources: {
        traefik: {
            requests: { cpu: "128m", memory: "128Mi" },
            limits: { memory: "128Mi" },
        },
    },
};

type TraefikSpec = AdditionnalSpec.Autoscaling &
    AdditionnalSpec.DistruptionBudget & {
        /**
         * List of listeners to expose and on which port. If the listener is not exposed,
         * it will not be added to the Traefik service.
         * @throws {Error} if the listener address doesn't exist
         */
        listeners?: { [k: string]: { exposedOnPort: number } };
    };

interface TraefikStatus extends KubernetesApplicationStatus<typeof Version> {
    resourceRefs: {
        images: { traefik: buildkit.Image };
        rbac: {
            serviceAccount: kubernetes.core.v1.ServiceAccount;
            clusterRole: kubernetes.rbac.v1.ClusterRole;
            clusterRoleBinding: kubernetes.rbac.v1.ClusterRoleBinding;
        };
        service: kubernetes.core.v1.Service;
        workload: kubernetes.apps.v1.Deployment;
    };
}

/**
 * The set of arguments for constructing a Traefik application.
 * @see {@link Traefik}
 */
export interface TraefikArgs extends KubernetesApplicationArgs<"traefik", TraefikSpec> {
    /**
     * The configuration for the Traefik application.
     *
     * Some configuration are managed by the application itself and are not exposed to the user :
     * - `ping.entryPoint` has a `traefik` entrypoint enforced (required for internal checks)
     * - `hub` is disabled
     * - `plugins` are disabled
     * - all providers but Kubernetes based ones are disabled
     *
     * @see {@link https://doc.traefik.io/traefik/reference/static-configuration/cli/}
     *      for more information.
     */
    configuration: FromSchema<typeof TraefikV2JsonSchema> & {
        // NOTE: Treafik JSON schema is not complete
        providers?: {
            kubernetesGateway?: {
                statusAddress?: { hostname?: string; ip?: string; service?: { name?: string; namespace?: string } };
            };
        };
    } & {
        // NOTE: traefik port is required for some internal checks (ping)
        entryPoints: {
            traefik: { address: string } & ValueType<FromSchema<typeof TraefikV2JsonSchema>["entryPoints"]>;
        };
        ping?: { entryPoint?: never };

        // Disable some features
        experimental?: { localplugins?: never; plugins?: never };
        hub?: never;
        providers?: {
            consul?: never;
            consulCatalog?: never;
            docker?: never;
            ecs?: never;
            etcd?: never;
            file?: never;
            http?: never;
            marathon?: never;
            nomad?: never;
            plugin?: never;
            rancher?: never;
            redis?: never;
            rest?: never;
            swarm?: never;
            zooKeeper?: never;
        };
    };
}

/**
 * This component deploys the Traefik application through a Kubenretes workload in a opinionated way.
 * Only the Traefik configuration and some others options like scheduling, endpoints or resources are
 * exposed to the user. This means that some features like Traefik hub nor Traefik plugins may not be
 * available.
 *
 * Here is the list of all "opinionated" configuration enforced by this component:
 * - Some configuration parts are disabled / enforced by the application
 *   - `ping.entryPoint` has a `traefik` entrypoint enforced (required for internal checks)
 *   - `hub` is disabled
 *   - `plugins` are disabled
 *   - all providers but Kubernetes based ones are disabled
 *   - if the `kubernetesIngress` provider is enabled, the `ingressEndpoint.publishedService` is set to
 *     the Traefik service by default
 *   - log level is set to `INFO` by default
 * - Traefik is clustered scoped
 * - Traefik is deployed with a `LoadBalancer` service type
 * - No IngressClass nor GatewayClass are created by default
 *
 *
 * @see {@link https://github.com/chezmoi-sh/Traefik}
 */
export class Traefik extends KubernetesApplication<typeof Version, "traefik", TraefikSpec> {
    public readonly status: pulumi.Output<TraefikStatus>;

    constructor(name: string, args: TraefikArgs, opts?: pulumi.ComponentResourceOptions) {
        super("system:network:Traefik", Version, name, args, opts);

        // -- Table of content
        // 1. Generate some data required by other resources
        // 2. Generate Traefik RBAC
        //   2.1. Generate Traefik service account
        //   2.2. Generate Traefik ClusterRole
        //   2.3. Generate Traefik ClusterRoleBinding
        // 3. Generate Traefik deployment
        //   3.1. Generate Traefik flags
        //   3.2. Generate Traefik image
        //   3.3. Generate Traefik deployment
        // 4. Generate Traefik service

        // -- Step 1: Generate some data required by other resources
        // listeners are used required to expose the Traefik service
        const listeners = Object.entries(args.configuration.entryPoints ?? {}).map(([name, entry]) => {
            const [_, port, protocol] = splitHostPortProtocol(entry.address ?? "") ?? [];
            if (port === undefined || Number.isNaN(port)) {
                throw new Error(`Invalid Traefik entrypoint '${name}' address: '${entry.address}'`);
            }
            const exposedPort = args.spec.listeners?.[name]?.exposedOnPort;

            return { name, port, exposedPort, protocol: (protocol ?? "tcp").toUpperCase() };
        });

        // -- Step 2: Generate Traefik RBAC
        const serviceAccount = new kubernetes.core.v1.ServiceAccount(
            `${name}:service-account`,
            { metadata: this.metadata },
            optsWithProvider(kubernetes.Provider, opts),
        );
        const clusterRole = new kubernetes.rbac.v1.ClusterRole(
            `${name}:cluster-role`,
            {
                metadata: { ...this.metadata, name: `traefik:${name}:controller` },
                rules: [
                    {
                        apiGroups: [""],
                        resources: ["nodes", "services", "secrets"],
                        verbs: ["get", "list", "watch"],
                    },
                    {
                        apiGroups: ["extensions", "networking.k8s.io"],
                        resources: ["ingressclasses", "ingresses"],
                        verbs: ["get", "list", "watch"],
                    },
                    {
                        apiGroups: ["discovery.k8s.io"],
                        resources: ["endpointslices"],
                        verbs: ["list", "watch"],
                    },

                    ...(args.configuration.providers?.kubernetesIngress
                        ? [
                              {
                                  apiGroups: ["extensions", "networking.k8s.io"],
                                  resources: ["ingresses/status"],
                                  verbs: ["update"],
                              },
                          ]
                        : []),

                    ...(args.configuration.providers?.kubernetesGateway
                        ? [
                              { apiGroups: [""], resources: ["namespaces"], verbs: ["list", "watch"] },
                              {
                                  apiGroups: [""],
                                  resources: ["services", "secrets"],
                                  verbs: ["get", "list", "watch"],
                              },
                              {
                                  apiGroups: ["gateway.networking.k8s.io"],
                                  resources: [
                                      "gateways",
                                      "gatewayclasses",
                                      "httproutes",
                                      "referencegrants",
                                      "tcproutes",
                                      "tlsroutes",
                                      "udproutes",
                                  ],
                                  verbs: ["get", "list", "watch"],
                              },
                              {
                                  apiGroups: ["gateway.networking.k8s.io"],
                                  resources: [
                                      "gateways/status",
                                      "gatewayclasses/status",
                                      "httproutes/status",
                                      "tcproutes/status",
                                      "tlsroutes/status",
                                      "udproutes/status",
                                  ],
                                  verbs: ["update"],
                              },
                          ]
                        : []),

                    ...(args.configuration.providers?.kubernetesCRD
                        ? [
                              {
                                  apiGroups: ["traefik.io"],
                                  resources: [
                                      "ingressroutes",
                                      "ingressroutetcps",
                                      "ingressrouteudps",
                                      "middlewares",
                                      "middlewaretcps",
                                      "serverstransports",
                                      "serverstransporttcps",
                                      "tlsoptions",
                                      "tlsstores",
                                      "traefikservices",
                                  ],
                                  verbs: ["get", "list", "watch"],
                              },
                          ]
                        : []),
                ],
            },
            optsWithProvider(kubernetes.Provider, opts),
        );
        const clusterRoleBinding = new kubernetes.rbac.v1.ClusterRoleBinding(
            `${name}:cluster-role-binding`,
            {
                metadata: { ...this.metadata, name: `traefik:${name}:controller` },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: clusterRole.metadata.name,
                },
                subjects: [
                    { kind: "ServiceAccount", name: serviceAccount.metadata.name, namespace: this.metadata.namespace },
                ],
            },
            optsWithProvider(kubernetes.Provider, opts),
        );

        // -- Step 3: Generate Traefik deployment
        const flags = TraefikConfiguration.toCLI(
            { transform: (s) => s.toLowerCase() },
            // Default configuration
            {
                log: { level: "INFO" },

                // if the kubernetesIngress provider is enabled, the ingressEndpoint.publishedService is set to the Traefik
                // service by default
                ...(args.configuration.providers?.kubernetesIngress
                    ? {
                          providers: {
                              kubernetesIngress: {
                                  ingressEndpoint: {
                                      publishedService:
                                          pulumi.interpolate`${this.metadata.namespace}/${this.metadata.name}` as any,
                                  },
                              },
                          },
                      }
                    : {}),

                // if the kubernetesGateway provider is enabled, the statusAddress.service is set to the Traefik service by
                // default
                ...(args.configuration.providers?.kubernetesGateway
                    ? {
                          providers: {
                              kubernetesGateway: {
                                  statusAddress: {
                                      service: {
                                          name: this.metadata.name as any,
                                          namespace: this.metadata.namespace as any,
                                      },
                                  },
                              } as any,
                          },
                      }
                    : {}),
            },
            // User configuration
            args.configuration,
            // Enforced configuration
            { ping: { entryPoint: "traefik" } },
        );

        const image = new TraefikImage(name, args.spec.images.traefik, { parent: this });
        const workload = new kubernetes.apps.v1.Deployment(
            `${name}:deployment`,
            {
                metadata: this.metadata,
                spec: {
                    replicas: this.spec.autoscaling?.apply((a) => a?.minReplicas ?? 1) ?? 1,
                    selector: { matchLabels: { ...this.labels } },
                    template: {
                        metadata: { ...this.metadata, name: undefined },
                        spec: {
                            automountServiceAccountToken: true,
                            containers: [
                                {
                                    name: "traefik",

                                    args: flags,
                                    // NOTE: configure GOMAXPROCS and GOMEMLIMIT
                                    env: pulumi.all([args.spec.resources?.traefik]).apply(([r]) => [
                                        ...(r?.limits?.cpu
                                            ? [
                                                  {
                                                      name: "GOMAXPROCS",
                                                      valueFrom: {
                                                          resourceFieldRef: {
                                                              resource: "limits.cpu",
                                                              divisor: "1",
                                                          },
                                                      },
                                                  },
                                              ]
                                            : []),
                                        {
                                            name: "GOMEMLIMIT",
                                            valueFrom: {
                                                resourceFieldRef: {
                                                    resource: "limits.memory",
                                                    divisor: "1",
                                                },
                                            },
                                        },
                                    ]),

                                    image: image.ref,
                                    ports: listeners.map((l) => ({
                                        name: l.name,
                                        containerPort: l.port,
                                        protocol: l.protocol,
                                    })),
                                    livenessProbe: {
                                        failureThreshold: 3,
                                        httpGet: { path: "/ping", port: "traefik", scheme: "HTTP" },
                                        initialDelaySeconds: 2,
                                        periodSeconds: 10,
                                        successThreshold: 1,
                                        timeoutSeconds: 2,
                                    },
                                    readinessProbe: {
                                        failureThreshold: 1,
                                        httpGet: { path: "/ping", port: "traefik", scheme: "HTTP" },
                                        initialDelaySeconds: 2,
                                        periodSeconds: 10,
                                        successThreshold: 1,
                                        timeoutSeconds: 2,
                                    },

                                    resources: pulumi.all([args.spec.resources]).apply(([r]) => ({
                                        requests: {
                                            ...Defaults.resources.traefik.requests,
                                            ...(r?.traefik?.requests ?? {}),
                                        },
                                        limits: {
                                            ...Defaults.resources.traefik.limits,
                                            ...(r?.traefik?.limits ?? {}),
                                        },
                                        claims: r?.traefik?.claims,
                                    })),

                                    // enforced security best practices
                                    securityContext: {
                                        allowPrivilegeEscalation: false,
                                        capabilities: { drop: ["ALL"] },
                                        privileged: false,
                                        readOnlyRootFilesystem: true,
                                    },

                                    volumeMounts: [{ name: "tmp", mountPath: "/tmp" }],
                                },
                            ],
                            restartPolicy: "Always",
                            serviceAccountName: serviceAccount.metadata.name,
                            securityContext: {
                                fsGroup: 64611,
                                runAsGroup: 64611,
                                runAsNonRoot: true,
                                runAsUser: 64611,
                            },
                            terminationGracePeriodSeconds: 60,
                            volumes: [{ name: "tmp", emptyDir: {} }],
                        },
                    },
                },
            },
            optsWithProvider(kubernetes.Provider, opts),
        );

        // -- Step 4: Generate Traefik service
        const service = new kubernetes.core.v1.Service(
            `${name}:service`,
            {
                metadata: this.metadata,
                spec: {
                    ports: listeners
                        .filter((l) => l.exposedPort !== undefined)
                        .map((l) => ({
                            name: l.name,
                            port: l.exposedPort as number,
                            targetPort: l.port,
                            protocol: l.protocol,
                        })),
                    selector: this.labels,
                    type: "LoadBalancer",
                },
            },
            optsWithProvider(kubernetes.Provider, opts),
        );

        this.status = pulumi.output({
            version: Version,
            resourceRefs: {
                images: { traefik: image },
                rbac: {
                    serviceAccount,
                    clusterRole,
                    clusterRoleBinding,
                },
                service,
                workload,
            },
        });
    }
}
