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
import { FileAsset, StringAsset } from "@pulumi/pulumi/asset";

import { SecretAsset } from "@chezmoi.sh/core/utils";

export interface TailscaleConfiguration {
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
