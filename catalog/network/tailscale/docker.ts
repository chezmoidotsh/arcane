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
import { FileAsset, StringAsset } from "@pulumi/pulumi/asset";

import {
    CommandContainerArgs,
    ExecutionContainerArgs,
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

import * as alpine from "@chezmoi.sh/catalog/os/alpine/3.19/docker";

// renovate: datasource=github-tags depName=tailscale/tailscale versioning=semver
export const Version = "v1.66.4";

/**
 * The arguments for building the Tailscale Docker image.
 */
export interface ImageArgs extends types.ImageArgs {
    /**
     * The Tailscale version to build.
     * @default "latest"
     */
    version?: string;

    /**
     * The base image to use in order to build the Tailscale image.
     * WARNING: The base image must be compatible a Alpine Linux image.
     */
    baseImage?: pulumi.Input<types.Image>;
}

/**
 * This component builds the Docker image for the Tailscale application.
 */
export class Image extends LocalImage {
    constructor(name: string, args: ImageArgs, opts?: pulumi.ComponentResourceOptions) {
        // Get the base image to use for building the Tailscale image. If no base image is provided,
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
                    tags: [`oci.local.chezmoi.sh/network/tailscale:${version}`],
                },
                ...args,

                // Build the image
                context: { location: __dirname },
                dockerfile: { location: path.join(__dirname, "Dockerfile") },
                buildArgs: {
                    ALPN_BASE: base.ref,
                    TAILSCALE_VERSION: version,
                },
            },
            opts,
        );
    }
}

/**
 * Tailscale CLI arguments based on the official documentation.
 */
export interface TailsscaleArgs {
    /**
     * Accept DNS configuration from the admin console.
     * Equivalent to `--accept-dns`
     * @default true
     */
    acceptDNS?: boolean;

    /**
     * Accept subnet routes that other nodes advertise.
     * Equivalent to `--accept-routes`
     * @default false
     */
    acceptRoutes?: boolean;

    /**
     * Offer to be an exit node for outbound internet traffic from the Tailscale network.
     * Equivalent to `--advertise-exit-node`
     * @default false
     */
    advertiseExitNode?: boolean;

    /**
     * Expose physical subnet routes to your entire Tailscale network.
     * Equivalent to `--advertise-routes`
     */
    advertiseRoutes?: string[];

    /**
     * Give tagged permissions to this device. You must be listed in "TagOwners" to be able to apply tags.
     * Equivalent to `--advertise-tags`
     */
    advertiseTags?: string[];

    /**
     * Provide an auth key to automatically authenticate the node as your user account.
     * Equivalent to `--authkey`
     */
    authkey: SecretAsset<StringAsset | FileAsset>;

    /**
     * Provide a Tailscale IP or machine name to use as an exit node. To disable the use of an exit node, pass the flag with
     *  an empty argument: --exit-node=.
     * Equivalent to `--exit-node`
     */
    exitNode?: string;

    /**
     * Allow the client node access to its own LAN while connected to an exit node. Defaults to not allowing access while
     * connected to an exit node.
     * Equivalent to `--exit-node-allow-lan-access`
     * @default false
     */
    exitNodeAllowLanAccess?: boolean;

    /**
     * Force re-authentication.
     * Equivalent to `--force-reauth`
     */
    forceReauth?: boolean;

    /**
     * Provide a hostname to use for the device instead of the one provided by the OS. Note that this will change the
     * machine name used in MagicDNS.
     * Equivalent to `--hostname`
     */
    hostname?: string;

    /**
     * Provide the base URL of a control server instead of https://controlplane.tailscale.com. If you are using
     * Headscale for your control server, use your Headscale instance's URL.
     * Equivalent to `--login-server`
     */
    loginServer?: string;

    /**
     * (Linux only) Advanced feature for controlling the degree of automatic firewall configuration.
     * Equivalent to `--netfilter-mode`
     * @default on
     */
    netfilterMode?: "off" | "nodivert" | "on";

    /**
     * Provide a Unix username other than root to operate tailscaled.
     * Equivalent to `--operator`
     */
    operator?: string;

    /**
     * Reset unspecified settings to default values.
     * Equivalent to `--reset`
     * @default false
     */
    reset?: boolean;

    /**
     * Block incoming connections from other devices on your Tailscale network. Useful for personal devices that only make
     * outgoing connections.
     * Equivalent to `--shields-up`
     * @default false
     */
    shieldsUp?: boolean;

    /**
     * (Linux only) Source NAT traffic to local routes that are advertised with --advertise-routes. Defaults to sourcing the
     * NAT traffic to the advertised routes. Set to false to disable subnet route masquerading.
     * Equivalent to `--snat-subnet-routes`
     * @default true
     */
    snatSubnetRoutes?: boolean;

    /**
     * (Linux only) Enable stateful filtering for subnet routers and exit nodes. When enabled, inbound packets with another
     * node's destination IP are dropped, unless they are a part of a tracked outbound connection from that node. Defaults
     * to disabled.
     * Equivalent to `--stateful-filtering`
     * @default false
     */
    statefulFiltering?: boolean;

    /**
     * Run a Tailscale SSH server, permitting access per the tailnet admin's declared access policy, or the default policy
     * if none is defined.
     * Equivalent to `--ssh`
     * @default false
     */
    ssh?: boolean;

    /**
     * Maximum amount of time to wait for the Tailscale service to initialize. duration can be any value parseable by
     * time.ParseDuration(). Defaults to 0s, which blocks forever.
     * Equivalent to `--timeout`
     * @default 0s
     */
    timeout?: string;
}

/**
 * The arguments for the Tailscale application.
 * @see {@link Application}
 */
export interface ApplicationArgs extends TailsscaleArgs {
    /**
     * The options for building the Tailscale Docker image.
     */
    imageOpts?: ImageArgs;

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
 * This component deploys the Tailscale application through a Docker container in a opinionated way.
 * Only the Tailscale CLI arguments and some container options like network or resources are exposed
 * to the user.
 *
 * @see {@link https://tailscale.com/}
 */
export class Application extends pulumi.ComponentResource {
    /**
     * The Docker image for the Tailscale application.
     */
    public readonly image: pulumi.Output<types.Image>;

    /**
     * The Docker container for the Tailscale application.
     */
    public readonly container: docker.Container;

    constructor(name: string, args: ApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("chezmoi.sh:network:tailscale:Application", name, {}, opts);

        let image = Promise.resolve(new Image(name, args?.imageOpts || { push: true }, { parent: this }));

        // Generate the Tailscale CLI arguments
        const flags = Object.entries(args)
            .filter(([key, _]) => !(key in ["imageOpts", "containerOpts"]))
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

        this.image = pulumi.output(image);
        this.container = new docker.Container(
            name,
            {
                // Default container options
                ...{
                    devices: [{ hostPath: "/dev/net/tun", containerPath: "/dev/net/tun" }],
                    dns: ["9.9.9.9", "1.1.1.1"], // Use external DNS servers in order to avoid any local DNS issues
                },
                ...args,

                // Enforce some container options
                name: name,
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
                tmpfs: { "/var/run/tailscale": "exec,uid=64241,gid=64241" },
                user: "tailscale",
                volumes: [
                    {
                        volumeName: new docker.Volume("persistent-volume", { name: `${name}-persistent` }).name,
                        containerPath: "/var/lib/tailscale",
                    },
                ],

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
