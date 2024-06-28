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

import {
    CommandContainerArgs,
    ExposeContainerArgs,
    HostnameContainerArgs,
    LifecycleContainerArgs,
    LocalImage,
    RuntimeContainerArgs,
    SecurityContainerArgs,
    StorageContainerArgs,
    types,
} from "@chezmoi.sh/core/docker";
import { ReadAsset, SecretAsset } from "@chezmoi.sh/core/utils";
import { InjectAssets, InjectableChownableAsset } from "@chezmoi.sh/core/utils/docker";

import * as alpine from "@chezmoi.sh/catalog/os/alpine/3.19/docker";

// renovate: datasource=github-tags depName=caddyserver/xcaddy versioning=semver
export const Version = "v2.8.4";

/**
 * The arguments for building the Caddy Docker image.
 */
export interface ImageArgs extends types.ImageArgs {
    /**
     * The Caddy version to build.
     * @default "latest"
     */
    version?: string;

    /**
     * The base image to use in order to build the Caddy image.
     * WARNING: The base image must be compatible a Alpine Linux image.
     */
    baseImage?: pulumi.Input<types.Image>;
}

/**
 * This component builds the Docker image for the Caddy application.
 */
export class Image extends LocalImage {
    constructor(name: string, args: ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        // Get the base image to use for building the Caddy image. If no base image is provided,
        // we will use the latest Alpine Linux image.
        const base = pulumi.output(args.baseImage || new alpine.Image(`${name}:base`, args, { parent: opts?.parent }));
        const version = args.version ?? Version;

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
                    tags: [`oci.local.chezmoi.sh/network/caddy:${version}`],
                },
                ...args,

                // Build the image
                context: { location: __dirname },
                dockerfile: { location: path.join(__dirname, "Dockerfile") },
                buildArgs: {
                    ALPN_BASE: base.ref,
                    CADDY_VERSION: version,
                },
            },
            opts,
        );
    }
}

/**
 * The arguments for the Caddy application.
 * @see {@link Application}
 */
export interface ApplicationArgs {
    /**
     * The Caddy configuration file.
     */
    configuration: FileAsset | RemoteAsset | StringAsset | SecretAsset<FileAsset | RemoteAsset | StringAsset>;

    /**
     * The options for building the Authelia Docker image.
     */
    imageOpts?: ImageArgs & {
        /**
         * A function to transform the Authelia Docker image.
         */
        transformation?: types.ImageTransformation;
    };

    /**
     * The options for creating the Docker container.
     *
     */
    containerOpts?: Omit<
        docker.ContainerArgs,
        | CommandContainerArgs
        | ExposeContainerArgs
        | HostnameContainerArgs
        | LifecycleContainerArgs
        | RuntimeContainerArgs
        | SecurityContainerArgs
        | StorageContainerArgs
        | "name"
        | "gpus"
        | "uploads"
    >;
}

/**
 * This component deploys the Caddy application through a Docker container in a opinionated way.
 * Only the Caddy CLI arguments and some container options like network or resources are exposed
 * to the user.
 *
 * @see {@link https://caddy.com/}
 */
export class Application extends pulumi.ComponentResource {
    /**
     * The Docker image for the Caddy application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The Docker volume where all the certificates are stored.
     */
    public readonly certificates: pulumi.Output<docker.Volume>;

    /**
     * The Docker container for the Caddy application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: ApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:network:caddy:Application", name, {}, opts);

        const config = {
            source: new SecretAsset(args.configuration),
            destination: "/etc/caddy/caddy.json",
            mode: 0o400,
            user: "caddy",
        } as InjectableChownableAsset;

        let image = new Image(name, args?.imageOpts || { push: true }, { parent: this });
        let embedded = InjectAssets(image, config);
        const transformation = args?.imageOpts?.transformation;
        if (transformation) {
            embedded = embedded.then(transformation);
        }

        this.image = pulumi.output(
            embedded.catch((err) => {
                pulumi.log.error(`Failed to build the bundled Authelia image: ${err}`);
            }),
        );
        this.certificates = pulumi.output(
            new docker.Volume(`${name}-shared-certificates`, { name: `${name}-shared-certificates` }, { parent: this }),
        );
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    ports: [
                        { internal: 80, external: 8080 },
                        { internal: 443, external: 8443 },
                    ],
                },
                ...args,

                // Enforce some container options
                name: name,
                destroyGraceSeconds: 60, // Give enough time for Caddy to stop all connections
                image: this.image.ref,
                restart: "unless-stopped",
                tmpfs: {
                    "/var/lib/caddy/caddy": "exec,uid=64138,gid=64138",
                    "/tmp/souin-nuts": "exec,uid=64138,gid=64138",
                },
                user: "caddy",
                volumes: [
                    {
                        volumeName: new docker.Volume("persistent-volume", { name: `${name}-persistent` }).name,
                        containerPath: "/var/lib/caddy",
                    },
                    {
                        volumeName: this.certificates.name,
                        containerPath: "/var/lib/caddy/certificates",
                    },
                ],

                // Enforce security options
                capabilities: { drops: ["ALL"] },
                privileged: false,
                readOnly: true,

                // Add metadata to the container
                labels: pulumi
                    .all([args?.containerOpts?.labels, this.image.ref])
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
