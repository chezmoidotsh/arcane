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
import * as pulumi from "@pulumi/pulumi";
import { ContainerVolume } from "@pulumi/docker/types/input";

import {
    CommandContainerArgs,
    HostnameContainerArgs,
    LifecycleContainerArgs,
    RuntimeContainerArgs,
    SecurityContainerArgs,
    StorageContainerArgs,
    types,
} from "@chezmoi.sh/core/docker";
import { InjectAssets, InjectableChownableAsset } from "@chezmoi.sh/core/utils/docker";

import { GatusImage, ImageArgs } from "./image";
import { GatusConfiguration } from "./types";
import { Version } from "./version";

export { GatusImage, Version };

/**
 * The set of arguments for constructing a Gatus application.
 * @see {@link Gatus}
 */
export interface GatusArgs extends GatusConfiguration {
    /**
     * The set of arguments for constructing the Gatus Docker image.
     */
    imageArgs: ImageArgs;

    /**
     * The set of arguments for constructing the Gatus Docker container.
     */
    containerArgs?: Omit<
        docker.ContainerArgs,
        | CommandContainerArgs
        | HostnameContainerArgs
        | LifecycleContainerArgs
        | RuntimeContainerArgs
        | SecurityContainerArgs
        | StorageContainerArgs
        | "name"
        | "gpus"
        | "uploads"
    > & {
        volumes?: [ContainerVolume & { containerPath: "/var/lib/gatus" }];
    };
}

/**
 * This component deploys the Gatus application through a Docker container in a opinionated way.
 * Only the Gatus configuration and some container options like network or resources are exposed
 * to the user.
 *
 * @see {@link https://gatus.io}
 */
export class Gatus extends pulumi.ComponentResource {
    /**
     * The version of the Gatus application.
     */
    public readonly version: string = Version;

    /**
     * The Docker image used by the Gatus application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The deployed Gatus Docker container.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: GatusArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:observability:gatus:Application", name, {}, opts);

        const config = {
            source: args.configuration,
            destination: "/etc/gatus/gatus.yaml",
            mode: 0o400,
            user: "gatus",
        } as InjectableChownableAsset;

        const image = new GatusImage(name, args.imageArgs, { parent: this });
        this.image = pulumi.output(
            InjectAssets(image, config).catch((err) => {
                pulumi.log.error(`Failed to build the bundled Gatus image: ${err}`);
            }),
        );
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    ports: [
                        { internal: 8080, external: 80, protocol: "tcp" }, // Web interface (HTTP)
                    ],
                },
                ...args.containerArgs,

                // Enforce some container options
                name: name,
                destroyGraceSeconds: 15,
                image: this.image.ref,
                restart: "unless-stopped",
                user: "gatus",

                // Enforce security options
                capabilities: { drops: ["ALL"] },
                privileged: false,
                readOnly: true,

                // Add persistent storage
                volumes: args.containerArgs?.volumes ?? [
                    {
                        volumeName: new docker.Volume("var.lib.gatus", { name: `${name}-persistent` }, { parent: this })
                            .name,
                        containerPath: "/var/lib/gatus",
                    },
                ],

                // Add metadata to the container
                labels: pulumi
                    .all([args?.containerArgs?.labels, this.image.ref])
                    .apply(([labels, ref]) =>
                        (labels ?? []).concat([{ label: "org.opencontainers.image.source.ref", value: ref }]),
                    ),
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
