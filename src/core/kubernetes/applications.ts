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
import * as buildkit from "@pulumi/docker-build";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

/**
 * The `RequiredLabelSet` interface contains all labels required by all Kubernetes
 * resources managed by Pulumi.
 */
type RequiredLabelSet<Version> = {
    "app.kubernetes.io/name": string;
    "app.kubernetes.io/instance": string;
    "app.kubernetes.io/version": Version;
    "app.kubernetes.io/managed-by": "pulumi.chezmoi.sh";
    "pulumi.com/project": string;
    "pulumi.com/stack": string;
};

/**
 * The `KubernetesApplicationImageArgs` interface contains all information required to create a new
 * container image on Pulumi.
 * It only contains the "base" information required by any container image.
 */
export type KubernetesApplicationImageArgs = Partial<
    Omit<buildkit.ImageArgs, "buildArgs" | "context" | "dockerfile">
> & {
    /**
     * The base image to use in order to build the container image.
     */
    from: pulumi.Input<buildkit.Image>;
};

/**
 * The `KubernetesApplicationArgs` interface contains all information required to create a new
 * Kubernetes application on Pulumi.
 * It only contains the "base" information required by any Kubernetes application.
 */
export interface KubernetesApplicationArgs<Containers extends string, AdditionalSpec = {}> {
    /**
     * Standard object's metadata. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
     */
    metadata: Pick<kubernetes.types.input.meta.v1.ObjectMeta, "annotations" | "labels"> &
        Required<Pick<kubernetes.types.input.meta.v1.ObjectMeta, "namespace">>;

    /**
     * Specification of the desired behavior of the Application.
     */
    spec: {
        images: { [K in Containers]: KubernetesApplicationImageArgs };

        /**
         * List of references to secrets in the same namespace to use for pulling any of the
         * images used by the application workload.
         */
        imagePullSecrets?: pulumi.Input<kubernetes.types.input.core.v1.LocalObjectReference[]>;

        /**
         * Scheduling constraints required the application workload.
         */
        scheduling?: Pick<kubernetes.types.input.core.v1.PodSpec, "affinity" | "nodeSelector" | "tolerations">;

        /**
         * Compute Resources required by the application workload.
         * More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         */
        resources?: { [K in Containers]?: pulumi.Input<kubernetes.types.input.core.v1.ResourceRequirements> };
    } & AdditionalSpec;
}

export namespace AdditionnalSpec {
    /**
     * Additional specification for Kubernetes application that needs to be scaled automatically.
     */
    export interface Autoscaling {
        /**
         * Autoscaling configuration for the application workload.
         * More info: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
         *
         * NOTE: The `minReplicas` field is required in order to specify the replica count when the
         * application is first deployed.
         */
        autoscaling?: Omit<kubernetes.types.input.autoscaling.v2.HorizontalPodAutoscalerSpec, "scaleTargetRef"> & {
            minReplicas: pulumi.Input<number>;
        };
    }

    /**
     * Additional specification for Kubernetes application that needs to be protected against
     * disruptions.
     */
    export interface DistruptionBudget {
        /**
         * PodDisruptionBudget configuration for the application workload.
         * More info: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
         */
        disruptionBudget?: Omit<kubernetes.types.input.policy.v1beta1.PodDisruptionBudgetSpec, "selector">;
    }
}

/**
 * The `KubernetesApplicationStatus` interface contains all information required to retrieve the
 * status of a Kubernetes application on Pulumi, like which version is currently or which workload
 * is running.
 */
export interface KubernetesApplicationStatus<Version extends string> {
    /**
     * Version of the application.
     */
    version: Version;
}

/**
 * The `KubernetesApplication` abstract class is the base class for all Kubernetes applications on
 * Pulumi.
 */
export abstract class KubernetesApplication<
    Version extends string,
    Containers extends string,
    AdditionalSpec = {},
> extends pulumi.ComponentResource {
    /**
     * APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
     */
    public readonly apiVersion = "catalog.chezmoi.sh/v1alpha1";
    /**
     * Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
     */
    public readonly kind = "Application";

    /**
     * Standard object's metadata. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
     */
    public readonly metadata: pulumi.Output<
        Pick<kubernetes.types.output.meta.v1.ObjectMeta, "labels" | "name" | "namespace"> &
            Partial<Pick<kubernetes.types.output.meta.v1.ObjectMeta, "annotations" | "ownerReferences">>
    >;

    /**
     * Specification of the desired behavior of the Deployment.
     */
    public readonly spec: pulumi.Output<pulumi.Unwrap<KubernetesApplicationArgs<Containers, AdditionalSpec>["spec"]>>;

    /**
     * Resource linked to the application.
     */
    public abstract readonly status: pulumi.Output<KubernetesApplicationStatus<Version>>;

    constructor(
        type: string,
        version: Version,
        name: string,
        args: KubernetesApplicationArgs<Containers, AdditionalSpec>,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(`catalog.chezmoi.sh:${type}`, name, opts);

        this.labels = {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/instance": `${name}-${pulumi.getProject()}-${pulumi.getStack()}`.substring(0, 63),
            "app.kubernetes.io/version": version,
            "app.kubernetes.io/managed-by": "pulumi.chezmoi.sh",
            "pulumi.com/project": pulumi.getProject(),
            "pulumi.com/stack": pulumi.getStack(),
        };
        this.metadata = pulumi.output({
            ...args.metadata,
            labels: {
                ...args.metadata?.labels,
                ...this.labels,
            },
            name: name,
            namespace: args.metadata?.namespace,
        });
        this.spec = pulumi.output(args.spec);
    }

    /**
     * Common labels shared by all applications and that can be used as selectors.
     */
    protected readonly labels: RequiredLabelSet<Version>;
}
