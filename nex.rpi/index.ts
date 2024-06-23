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
import * as authelia from "@chezmoi.sh/catalog/security/authelia/docker";
import * as yaldap from "@chezmoi.sh/catalog/security/yaldap/docker";

const config = new pulumi.Config();
const alpn = new alpine.Image("alpine", {
    push: true,
    buildOnPreview: false,
    platforms: ["linux/amd64"],
});

const yldp = new yaldap.Application("security.yaldap", {
    configuration:
        config.require("sh.chezmoi.environment") == "live"
            ? new pulumi.asset.FileAsset("config/live")
            : new pulumi.asset.RemoteAsset(
                  "https://raw.githubusercontent.com/chezmoi-sh/yaldap/main/pkg/ldap/directory/yaml/fixtures/basic.yaml",
              ),

    imageOpts: { push: true, baseImage: alpn },
    containerOpts: { wait: true },
});
const authl = new authelia.Application("security.authelia", {
    configuration:
        config.require("sh.chezmoi.environment") == "live"
            ? new pulumi.asset.FileAsset("config/live")
            : new pulumi.asset.FileAsset("configuration/e2e/authelia/configuration.yml"),
    userDatabase:
        config.require("sh.chezmoi.environment") == "live"
            ? undefined
            : {
                  source: new pulumi.asset.FileAsset("configuration/e2e/authelia/users_database.yml"),
                  destination: "/etc/authelia/users_database.yml",
              },

    imageOpts: { push: true, baseImage: alpn },
    containerOpts: { wait: false },
});

export const alpine_image = alpn.ref;
export const yaldap_image = yldp.image.ref;
export const yaldap_container = yldp.container.id;
export const authelia_image = authl.image.ref;
export const authelia_container = authl.container.id;
