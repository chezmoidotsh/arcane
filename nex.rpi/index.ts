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

import * as pulumi from "@pulumi/pulumi";

import * as alpine from "@chezmoi.sh/catalog/os/alpine/3.19/docker";
import * as yaldap from "@chezmoi.sh/catalog/security/yaldap/docker";
import * as utils from "@chezmoi.sh/core/utils";

const config = new pulumi.Config();
const assets = new utils.DirectoryAsset("..", {
    recursive: true,
    predicates: [
        (file) => file.isFile(),
        (file) => !file.name.includes(".git") && !file.name.includes("node_modules") && !file.name.includes("vendor"),
    ],
}).assets.map((file) => ({
    source: file,
    destination: `/src${file.path}`,
    chown: { user: "yaldap", group: "yaldap" },
}));

const alpn = new alpine.Image("alpine", {
    push: true,
    buildOnPreview: false,
    platforms: ["linux/amd64"],
});
const yldp = new yaldap.Application("security.yaldap", {
    imageOpts: {
        push: true,
        baseImage: alpn,
        // TODO: This part will be possible once we have the ability to inject assets into the `dockerfile` property.
        //       See https://github.com/pulumi/pulumi-docker-build/issues/96 for more information.
        transformation: (image) =>
            utils.InjectAssets(
                image,
                {
                    source:
                        config.require("sh.chezmoi.environment") == "live"
                            ? new pulumi.asset.FileAsset("config/live")
                            : new utils.SecretAsset(
                                  new pulumi.asset.RemoteAsset(
                                      "https://raw.githubusercontent.com/chezmoi-sh/yaldap/main/pkg/ldap/directory/yaml/fixtures/basic.yaml",
                                  ),
                              ),
                    destination: "/etc/yaldap/backend.yaml",
                    chown: { user: "yaldap", group: "yaldap" },
                },
                ...assets,
            ),
    },
    containerOpts: { wait: true },
});

export const alpine_image = alpn.ref;
export const yaldap_image = yldp.image.ref;
export const yaldap_container = yldp.container.id;
