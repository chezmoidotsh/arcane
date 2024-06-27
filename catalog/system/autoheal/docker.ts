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
import * as path from "path";

import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import { FileAsset, RemoteAsset, StringAsset } from "@pulumi/pulumi/asset";

import { LocalImage, types } from "@chezmoi.sh/core/docker";
import { InjectAssets, IsDefined, SecretAsset } from "@chezmoi.sh/core/utils";
import { InjectableChownableAsset } from "@chezmoi.sh/core/utils/docker";

import * as alpine from "@chezmoi.sh/catalog/os/alpine/3.19/docker";

export const Version = "1.0.0";

/**
 * The arguments for building the autoheal Docker image.
 */
export interface ImageArgs extends types.ImageArgs {
    /**
     * The base image to use in order to build the autoheal image.
     * WARNING: The base image must be compatible a Alpine Linux image.
     */
    baseImage?: pulumi.Input<types.Image>;
}

/**
 * This component builds the Docker image for the autoheal application.
 */
export class Image extends LocalImage {
    constructor(name: string, args: ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        // Get the base image to use for building the autoheal image. If no base image is provided,
        // we will use the latest Alpine Linux image.
        const base = pulumi.output(args.baseImage || new alpine.Image(`${name}:base`, args, { parent: opts?.parent }));

        super(
            name,
            {
                // Copy base image configuration options
                ...{
                    addHosts: base.addHosts.apply((v) => v ?? []),
                    builder: base.builder.apply((v) => v ?? {}),
                    buildOnPreview: base.buildOnPreview.apply((v) => v ?? true),
                    cacheFrom: base.cacheFrom.apply((v) => v ?? []),
                    cacheTo: base.cacheTo.apply((v) => v ?? []),
                    exec: base.exec.apply((v) => v ?? false),
                    exports: base.exports.apply((v) => v ?? []),
                    load: base.load.apply((v) => v ?? false),
                    network: base.network.apply((v) => v ?? "default"),
                    noCache: base.noCache.apply((v) => v ?? false),
                    platforms: base.platforms.apply((v) => v ?? []),
                    pull: base.pull.apply((v) => v ?? false),
                    push: base.push,
                    registries: base.registries.apply((v) => v ?? []),
                    ssh: base.ssh.apply((v) => v ?? []),
                    tags: base.tags.apply((v) => v ?? []),
                },

                // Default image options
                ...{
                    tags: [`oci.local.chezmoi.sh/system/autoheal:${Version}`],
                },
                ...args,

                // Build the image
                context: { location: __dirname },
                dockerfile: { location: path.join(__dirname, "Dockerfile") },
                buildArgs: {
                    ALPN_BASE: base.ref,
                    AUTOHEAL_VERSION: Version,
                },
            },
            opts,
        );
    }
}

/**
 * The arguments for the autoheal application.
 * @see {@link Application}
 */
export interface ApplicationArgs {
    /**
     * Container selector watched by autoheal. If all is specified, all containers will be watched.
     * @default all
     */
    container_label?: string | "all";

    /**
     * Duration to wait before considering the Docker API request as failed (in seconds).
     * @default 30
     */
    docker_timeout?: number;

    /**
     * Default duration to wait before restarting the container (in seconds) if the label 'autoheal.stop.timeout'
     * is not set on the watched container.
     * @default 10
     */
    default_graceful_period?: number;

    /**
     * Interval to check the Docker API for unhealthy containers (in seconds).
     * @default 5
     */
    interval?: number;

    /**
     * Duration to wait just after the container has been started before starting to watch it (in seconds).
     * @default 0
     */
    start_period?: number;

    /**
     * The Docker socket to use for connecting to the Docker API.
     * @default /var/run/docker.sock
     */
    docker_socket?: string;

    /**
     * The options for building the autoheal Docker image.
     */
    imageOpts?: ImageArgs;

    /**
     * The options for creating the Docker container.
     */
    containerOpts?: Omit<docker.ContainerArgs, "name" | "image">;
}

/**
 * This component deploys the autoheal application through a Docker container.
 */
export class Application extends pulumi.ComponentResource {
    /**
     * The Docker image for the autoheal application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The Docker container for the autoheal application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: ApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:security:autoheal:Application", name, {}, opts);

        const image = new Image(name, args?.imageOpts || { push: true }, { parent: this });
        this.image = pulumi.output(image);
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    name: name,

                    // Security defaults
                    capabilities: { drops: ["ALL"] },
                    readOnlyRootFilesystem: true,
                    privileged: false,

                    // Resource defaults
                    // memory: 64,
                    // memorySwap: 64,

                    // Network defaults
                    volumes: [
                        {
                            hostPath: pulumi.output(args.docker_socket ?? "/var/run/docker.sock"),
                            containerPath: "/var/run/docker.sock",
                            readOnly: true,
                        },
                    ],
                },
                ...args,

                // Enforce some options
                image: this.image.ref,
                user: "root",
                envs: pulumi
                    .output(args.containerOpts?.envs ?? [])
                    .apply((v) => [
                        ...v,
                        `AUTOHEAL_CONTAINER_LABEL=${args?.container_label ?? "all"}`,
                        `AUTOHEAL_DEFAULT_STOP_TIMEOUT=${args?.default_graceful_period ?? 10}`,
                        `AUTOHEAL_INTERVAL=${args?.interval ?? 5}`,
                        `AUTOHEAL_START_PERIOD=${args?.start_period ?? 0}`,
                        `CURL_TIMEOUT=${args?.docker_timeout ?? 30}`,
                    ]),

                labels: pulumi
                    .all([args?.containerOpts?.labels, this.image.ref])
                    .apply(([labels, ref]) =>
                        (labels ?? []).concat([{ label: "org.opencontainers.image.source.ref", value: ref }]),
                    ),

                networkMode: "none",
            },
            {
                parent: this,
                // @pulumi/docker-build uses https://github.com/kreuzwerker/terraform-provider-docker
                // to interact with the Docker API. Unfortunately, the provider uses SHA256 hashes
                // as identifiers for images. Because of this and the fact that the image is built
                // using buildx, the SHA256 hash of the image is not always the one that will be
                // used by Docker. To avoid drift, we will ignore any changes on the image property
                // and recreate the container if the label "org.opencontainers.image.source.ref" changes.
                ignoreChanges: ["image"],
                dependsOn: this.image,
                replaceOnChanges: ['labels["org.opencontainers.image.source.ref"]'],
            },
        );
    }
}
