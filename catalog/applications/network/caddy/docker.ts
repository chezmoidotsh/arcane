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
import { StringAsset } from "@pulumi/pulumi/asset";

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

import { CaddyImage, ImageArgs } from "./image";
import { CaddyConfiguration } from "./types";
import { Version } from "./version";

export { CaddyImage, Version };

/**
 * The set of arguments for constructing a Caddy application.
 * @see {@link Caddy}
 */
export interface CaddyArgs extends CaddyConfiguration {
    /**
     * The set of arguments for constructing the Caddy Docker image.
     */
    imageArgs: ImageArgs;

    /**
     * The set of arguments for constructing the Caddy Docker container.
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
        volumes?:
            | [ContainerVolume & { containerPath: "/var/lib/caddy" }]
            | [
                  Omit<ContainerVolume, "fromContainer" | "hostPath"> & {
                      containerPath: "/var/lib/caddy/certificates";
                      volumeName: pulumi.Input<string>;
                  },
              ]
            | [
                  ContainerVolume & { containerPath: "/var/lib/caddy" },
                  Omit<ContainerVolume, "fromContainer" | "hostPath"> & {
                      containerPath: "/var/lib/caddy/certificates";
                      volumeName: pulumi.Input<string>;
                  },
              ];
    };
}

/**
 * This component deploys the Caddy application through a Docker container in a opinionated way.
 * Only the Caddy CLI arguments and some container options like network or resources are exposed
 * to the user.
 *
 * @see {@link https://caddy.com/}
 */
export class Caddy extends pulumi.ComponentResource {
    /**
     * The Docker image for the Caddy application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The Docker volume name where all the certificates are stored.
     */
    public readonly certificates: pulumi.Output<string>;

    /**
     * The Docker container for the Caddy application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: CaddyArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:network:caddy:Application", name, {}, opts);

        // NOTE: Find or create the volume for shared certificates
        const certificateVolumes = args.containerArgs?.volumes?.filter(
            (v) => v.containerPath === "/var/lib/caddy/certificates",
        );
        if (certificateVolumes?.length && certificateVolumes[0].volumeName) {
            this.certificates = pulumi.output(certificateVolumes[0].volumeName);
        } else {
            this.certificates = new docker.Volume(
                "shared-certificates",
                { name: `${name}-shared-certificates` },
                { parent: this },
            ).name;
        }

        const assets = [
            {
                source: args.caddyfile,
                destination: "/etc/caddy/Caddyfile",
                mode: 0o400,
                user: "caddy",
            } as InjectableChownableAsset,
            {
                source: args.layer4 ?? new StringAsset("{}"),
                destination: "/etc/caddy/caddy.layer4.json",
                mode: 0o400,
                user: "caddy",
            } as InjectableChownableAsset,
        ];

        const image = new CaddyImage(name, args.imageArgs, { parent: this });
        this.image = pulumi.output(
            InjectAssets(image, ...assets).catch((err) => {
                pulumi.log.error(`Failed to build the bundled Caddy image: ${err}`);
            }),
        );
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    ports: [
                        { internal: 8080, external: 80 },
                        { internal: 8443, external: 443 },
                    ],
                },
                ...args.containerArgs,

                // Enforce some container options
                name: name,
                destroyGraceSeconds: 60, // Give enough time for Caddy to stop all connections
                image: this.image.ref,
                restart: "unless-stopped",
                tmpfs: {
                    "/var/lib/caddy/caddy": "exec,uid=64138,gid=64138",
                    "/var/run/caddy": "exec,uid=64138,gid=64138",
                    "/tmp/souin-nuts": "exec,uid=64138,gid=64138",
                },
                user: "caddy",

                // Enforce security options
                capabilities: { drops: ["ALL"] },
                privileged: false,
                readOnly: true,

                // Add persistent storage
                volumes: [
                    {
                        volumeName: this.certificates,
                        containerPath: "/var/lib/caddy/certificates",
                    },
                    (args.containerArgs?.volumes ?? []).find((v) => v.containerPath === "/var/lib/caddy") ?? {
                        volumeName: new docker.Volume("var.lib.caddy", { name: `${name}-persistent` }, { parent: this })
                            .name,
                        containerPath: "/var/lib/caddy",
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
