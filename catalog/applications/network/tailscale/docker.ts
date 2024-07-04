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
import { ContainerDevice, ContainerVolume } from "@pulumi/docker/types/input";

import {
    CommandContainerArgs,
    ExposeContainerArgs,
    HostnameContainerArgs,
    LifecycleContainerArgs,
    RuntimeContainerArgs,
    SecurityContainerArgs,
    StorageContainerArgs,
    types,
} from "@chezmoi.sh/core/docker";
import { ReadAsset } from "@chezmoi.sh/core/utils";

import { ImageArgs, TailscaleImage } from "./image";
import { TailscaleConfiguration } from "./types";
import { Version } from "./version";

export { TailscaleImage, Version };

/**
 * The set of arguments for constructing a Tailscale application.
 * @see {@link Tailscale}
 */
export interface TailscaleArgs extends TailscaleConfiguration {
    /**
     * The set of arguments for constructing the Tailscale Docker image.
     */
    imageArgs: ImageArgs;

    /**
     * The set of arguments for constructing the Tailscale Docker container.
     */
    containerArgs?: Omit<
        docker.ContainerArgs,
        | CommandContainerArgs
        | ExposeContainerArgs
        | HostnameContainerArgs
        | LifecycleContainerArgs
        | RuntimeContainerArgs
        | SecurityContainerArgs
        | StorageContainerArgs
        | "gpus"
        | "uploads"
    > & {
        volumes?: [ContainerVolume & { containerPath: "/var/lib/tailscale" }];
        devices?: [ContainerDevice & { containerPath: "/dev/net/tun" }];
    };
}

/**
 * This component deploys the Tailscale application through a Docker container in a opinionated way.
 * Only the Tailscale CLI arguments and some container options like network or resources are exposed
 * to the user.
 *
 * @see {@link https://tailscale.com/}
 */
export class Tailscale extends pulumi.ComponentResource {
    /**
     * The Docker image for the Tailscale application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The Docker container for the Tailscale application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: TailscaleArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:network:tailscale:Application", name, {}, opts);

        // Generate the Tailscale CLI arguments
        const flags = Object.entries(args)
            .filter(([key, _]) => !(key in ["imageOpts", "containerOpts"]))
            .map(([key, value]) => [key.replace(/([a-z0–9])([A-Z])/g, "$1-$2").toLowerCase(), value])
            .map(([key, value]) => {
                if (typeof value === "boolean") {
                    return `--${key}${value ? "" : "=false"}`;
                }
                if (typeof value === "string") {
                    return `--${key}=${value}`;
                }
                if (Array.isArray(value)) {
                    return `--${key}=${value.join(",")}`;
                }
                return "";
            })
            .filter((flag) => flag !== "")
            .join(" ");

        const image = new TailscaleImage(name, args.imageArgs, { parent: this });
        this.image = pulumi.output(image);
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    name: name,
                    dns: ["9.9.9.9", "1.1.1.1"], // Use external DNS servers in order to avoid any local DNS issues
                },
                ...args.containerArgs,

                // Enforce some container options
                destroyGraceSeconds: 60, // Give enough time for Tailscale to stop all connections
                envs: [
                    pulumi.interpolate`TS_AUTHKEY=${pulumi.secret(
                        ReadAsset(args.authkey.asset)
                            .then((asset) => asset.toString("utf-8"))
                            .catch((err) => {
                                pulumi.log.error(`Failed to read the Tailscale authkey: ${err}`);
                            }),
                    )}`,
                    `TS_EXTRA_ARGS=${flags}`,
                ],
                image: this.image.ref,
                restart: "unless-stopped",
                tmpfs: { "/var/run/tailscale": "uid=64241,gid=64241" },
                user: "tailscale",

                // Enforce security options
                capabilities: { adds: ["NET_ADMIN", "SYS_MODULE"], drops: ["ALL"] },
                privileged: false,
                readOnly: true,
                sysctls: args.advertiseRoutes
                    ? {
                          "net.ipv4.conf.all.forwarding": "1",
                          "net.ipv6.conf.all.forwarding": "1",
                      }
                    : {},

                // Add TUN device
                devices: args.containerArgs?.devices ?? [
                    {
                        hostPath: "/dev/net/tun",
                        containerPath: "/dev/net/tun",
                    },
                ],

                // Add persistent storage
                volumes: args.containerArgs?.volumes ?? [
                    {
                        volumeName: new docker.Volume(
                            "var.lib.tailscale",
                            { name: `${name}-persistent` },
                            { parent: this },
                        ).name,
                        containerPath: "/var/lib/tailscale",
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
