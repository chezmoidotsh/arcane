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
import * as docker from "@pulumi/docker";
import * as buildkit from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";

/**
 * ImageTransformation is a callback signature to modify a Docker image prior to its utilisation.
 *
 * @param {buildkit.Image} image The image to transform.
 * @returns {buildkit.Image} The transformed image. If undefined, the image will not be transformed.
 */
export declare type ImageTransformation = (image: buildkit.Image) => buildkit.Image;

/**
 * The set of arguments for constructing a RemoteImage resource.
 */
export type RemoteImageArgs = Omit<docker.RemoteImageArgs, "build" | "forceRemove" | "pullTriggers">;
/**
 * Pulls a Docker image to a given Docker host from a Docker Registry.
 * This resource will *not* pull new layers of the image automatically unless used in conjunction with
 * docker.RegistryImage data source to update the `pullTriggers` field.
 *
 * NOTE: This resource is a wrapper around the {@link docker.RemoteImage} resource from the `@pulumi/docker` package
 *       to implement the {@link types.Image} interface. For this reason, it does provide undefined values for
 *       fields required generally by the {@link types.Image} interface but cannot be set on a remote image.
 *       The single exception is the `push` field which is set to `true` by default.
 */
export class RemoteImage extends pulumi.ComponentResource implements buildkit.Image {
    public readonly addHosts: pulumi.Output<string[] | undefined> =
        pulumi.output<pulumi.Output<string[] | undefined>>(undefined);
    public readonly buildArgs: pulumi.Output<{ [key: string]: string } | undefined> =
        pulumi.output<pulumi.Output<{ [key: string]: string } | undefined>>(undefined);
    public readonly buildOnPreview: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(
        undefined,
    );
    public readonly builder: pulumi.Output<buildkit.types.output.BuilderConfig | undefined> = pulumi.output<
        buildkit.types.output.BuilderConfig | undefined
    >(undefined);
    public readonly cacheFrom: pulumi.Output<buildkit.types.output.CacheFrom[] | undefined> = pulumi.output<
        buildkit.types.output.CacheFrom[] | undefined
    >(undefined);
    public readonly cacheTo: pulumi.Output<buildkit.types.output.CacheTo[] | undefined> = pulumi.output<
        buildkit.types.output.CacheTo[] | undefined
    >(undefined);
    public readonly context: pulumi.Output<buildkit.types.output.BuildContext | undefined> = pulumi.output<
        buildkit.types.output.BuildContext | undefined
    >(undefined);
    public readonly contextHash: pulumi.Output<string> = pulumi.output("");
    public readonly dockerfile: pulumi.Output<buildkit.types.output.Dockerfile | undefined> = pulumi.output<
        buildkit.types.output.Dockerfile | undefined
    >(undefined);
    public readonly exec: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly exports: pulumi.Output<buildkit.types.output.Export[] | undefined> = pulumi.output<
        buildkit.types.output.Export[] | undefined
    >(undefined);
    public readonly labels: pulumi.Output<{ [key: string]: string } | undefined> = pulumi.output<
        { [key: string]: string } | undefined
    >(undefined);
    public readonly load: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly network: pulumi.Output<buildkit.NetworkMode | undefined> = pulumi.output<
        buildkit.NetworkMode | undefined
    >(undefined);
    public readonly noCache: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly pull: pulumi.OutputInstance<boolean | undefined> = pulumi.output<boolean | undefined>(undefined);
    public readonly push: pulumi.OutputInstance<boolean> = pulumi.output<boolean>(true);
    public readonly registries: pulumi.Output<buildkit.types.output.Registry[] | undefined> = pulumi.output<
        buildkit.types.output.Registry[] | undefined
    >(undefined);
    public readonly secrets: pulumi.Output<{ [key: string]: string } | undefined> = pulumi.output<
        { [key: string]: string } | undefined
    >(undefined);
    public readonly ssh: pulumi.Output<buildkit.types.output.SSH[] | undefined> = pulumi.output<
        buildkit.types.output.SSH[] | undefined
    >(undefined);
    public readonly tags: pulumi.Output<string[] | undefined> = pulumi.output<string[] | undefined>(undefined);
    public readonly target: pulumi.Output<string | undefined> = pulumi.output<string | undefined>(undefined);

    public readonly platforms: pulumi.Output<buildkit.Platform[] | undefined>;
    public readonly digest: pulumi.Output<string>;
    public readonly id: pulumi.Output<string>;
    public readonly ref: pulumi.Output<string>;

    constructor(name: string, args: RemoteImageArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:docker:RemoteImage", name, opts);

        const image = new docker.RemoteImage(name, args, { parent: this });
        this.digest = image.repoDigest.apply((v) => v?.split("@").pop() ?? "");
        this.id = image.imageId;
        this.platforms = image.platform.apply((v) =>
            v ? [buildkit.Platform[v as keyof typeof buildkit.Platform]] : [],
        );
        this.ref = image.repoDigest;
    }
}

/**
 * ExecutionContainerArgs is a set of options that can be used to configure the execution of a container.
 */
export declare type ExecutionContainerArgs =
    | "attach"
    | "mustRun"
    | "start"
    | "stdinOpen"
    | "tty"
    | "wait"
    | "waitTimeout";

/**
 * CommandContainerArgs is a set of options that can be used to configure the command of a container.
 */
export declare type CommandContainerArgs = "command" | "entrypoints" | "envs" | "image" | "workingDir";

/**
 * DNSContainerArgs is a set of options that can be used to configure the DNS of a container.
 */
export declare type DNSContainerArgs = "dns" | "dnsOpts" | "dnsSearches";

/**
 * ExposeContainerArgs is a set of options that can be used to configure the exposed ports of a container.
 */
export declare type ExposeContainerArgs = "ports" | "publishAllPorts";

/**
 * HostnameContainerArgs is a set of options that can be used to configure some hostname-related settings
 * of a container.
 */
export declare type HostnameContainerArgs = "domainname" | "hostname" | "hosts";

/**
 * LifecycleContainerArgs is a set of options that can be used to configure the lifecycle of a container.
 */
export declare type LifecycleContainerArgs =
    | "containerReadRefreshTimeoutMilliseconds"
    | "destroyGraceSeconds"
    | "healthcheck"
    | "maxRetryCount"
    | "restart"
    | "rm"
    | "stopSignal"
    | "stopTimeout";

/**
 * NetworkContainerArgs is a set of options that can be used to configure the network of a container.
 */
export declare type NetworkContainerArgs = "hosts" | "networkMode" | "networksAdvanced";

/**
 * ResourceContainerArgs is a set of options that can be used to configure the resources of a container.
 */
export declare type ResourceContainerArgs =
    | "memory"
    | "memorySwap"
    | "cpuShares"
    | "cpuPeriod"
    | "cpuQuota"
    | "cpuSet"
    | "shmSize";

/**
 * RuntimeContainerArgs is a set of options that can be used to configure the runtime of a container.
 */
export declare type RuntimeContainerArgs =
    | "cgroupnsMode"
    | "groupAdds"
    | "init"
    | "ipcMode"
    | "logs"
    | "logDriver"
    | "logOpts"
    | "pidMode"
    | "runtime";

/**
 * SecurityContainerArgs is a set of options that can be used to configure the security of a container.
 */
export declare type SecurityContainerArgs =
    | "capabilities"
    | "privileged"
    | "readOnly"
    | "removeVolumes"
    | "securityOpts"
    | "sysctls"
    | "user"
    | "usernsMode";

/**
 * StorageContainerArgs is a set of options that can be used to configure the storage of a container.
 */
export declare type StorageContainerArgs = "mounts" | "storageOpts" | "tmpfs" | "volumes";
