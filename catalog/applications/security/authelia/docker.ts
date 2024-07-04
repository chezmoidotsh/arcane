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
import { ContainerVolume } from "@pulumi/docker/types/input";

import {
    CommandContainerArgs,
    HostnameContainerArgs,
    LifecycleContainerArgs,
    RuntimeContainerArgs,
    SecurityContainerArgs,
    StorageContainerArgs,
} from "@chezmoi.sh/core/docker";
import { InjectAssets } from "@chezmoi.sh/core/utils";
import { InjectableChownableAsset } from "@chezmoi.sh/core/utils/docker";

import { AutheliaImage, ImageArgs } from "./image";
import { AutheliaConfiguration } from "./types";
import { Version } from "./version";

export { AutheliaImage, Version };

/**
 * The set of arguments for constructing a Authelia application.
 * @see {@link Authelia}
 */
export interface AutheliaArgs extends AutheliaConfiguration {
    /**
     * The set of arguments for constructing the Authelia Docker image.
     */
    imageArgs: ImageArgs;

    /**
     * The set of arguments for constructing the Authelia Docker container.
     */
    containerArgs?: Omit<
        docker.ContainerArgs,
        | CommandContainerArgs
        | HostnameContainerArgs
        | LifecycleContainerArgs
        | RuntimeContainerArgs
        | SecurityContainerArgs
        | StorageContainerArgs
        | "gpus"
        | "uploads"
    > & {
        volumes?: [ContainerVolume & { containerPath: "/var/lib/authelia" }];
    };
}

/**
 * This component deploys the Authelia application through a Docker container in a opinionated way.
 * Only the Authelia configuration and some container options like network or resources are exposed
 * to the user.
 *
 * @see {@link https://www.authelia.com/}
 */
export class Authelia extends pulumi.ComponentResource {
    /**
     * The version of the Authelia application.
     */
    public readonly version: string = Version;

    /**
     * The Docker image for the Authelia application.
     */
    public readonly image: pulumi.Output<buildkit.Image>;

    /**
     * The Docker container for the Authelia application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: AutheliaArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:security:authelia:Application", name, {}, opts);

        const assets = [
            {
                source: args.configuration,
                destination: "/etc/authelia/configuration.yaml",
                mode: 0o400,
                user: "authelia",
            } as InjectableChownableAsset,
        ];
        if (args.userDatabase) {
            assets.push({
                source: args.userDatabase.source,
                destination: args.userDatabase.destination,
                mode: 0o400,
                user: "authelia",
            });
        }
        const image = new AutheliaImage(name, args.imageArgs, { parent: this });
        this.image = pulumi.output(
            InjectAssets(image, ...assets).catch((err) => {
                pulumi.log.error(`Failed to build the bundled Authelia image: ${err}`);
            }),
        );
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    name: name,
                    ports: [
                        { internal: 9091, external: 80, protocol: "tcp" }, // Web interface (HTTP)
                    ],
                },
                ...args.containerArgs,

                // Enforce some container options
                destroyGraceSeconds: 20,
                image: this.image.ref,
                restart: "unless-stopped",
                user: "authelia",

                // Enforce security options
                capabilities: { drops: ["ALL"] },
                privileged: false,
                readOnly: true,

                // Add persistent storage
                volumes: args.containerArgs?.volumes ?? [
                    {
                        volumeName: new docker.Volume(
                            "var.lib.authelia",
                            { name: `${name}-persistent` },
                            { parent: this },
                        ).name,
                        containerPath: "/var/lib/authelia",
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
