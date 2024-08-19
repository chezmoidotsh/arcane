# Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ----------------------------------------------------------------------------
# trunk-ignore-all(trivy/DS026,checkov/CKV_DOCKER_2): This Dockerfile is used for development purposes only, so no need to add HEALTHCHECK instruction
# trunk-ignore-all(trivy/DS002,checkov/CKV_DOCKER_3): The user will be created during the DevContainer build process
# trunk-ignore-all(hadolint/DL3018): Don't care about pinning the version of packages, as this is a development container and only git is installed


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <machine-id>: Generate a machine-id for the container.                    │
# |                                                                           │
# │ NOTE: This image will be cached (and the machine-id too) in               │
# │       order to have a persistent machine-id even if the                   │
# │       image is rebuilt.                                                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/alpine:3.20.1 as machine-id
RUN apk add --no-cache dbus \
    && dbus-uuidgen > /etc/machine-id


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <devcontainer>: Create a slim development container with Node.js.         │
# └───────────────────────────────────────────────────────────────────────────┘
FROM ghcr.io/pulumi/devcontainer:slim-node

# Copy generated machine-id
COPY --from=machine-id /etc/machine-id /etc/machine-id

# Install mise package manager
COPY --from=docker.io/jdxcode/mise:v2024.8.7@sha256:60cdda1f2d1034c7c3691b2c3843309895842eb4f30164685a51701762ee6574 /usr/local/bin/mise /usr/local/bin/mise
RUN mise settings set experimental true

# Install gum CLI
COPY --from=docker.io/charmcli/gum:v0.14.3@sha256:b681364c923a3e0e6b68301995fb00f60638bdb6c806c2f5f6cd14e625cd8cc5 /usr/local/bin/gum /usr/local/bin/gum

COPY scripts/atlas-utils.lib.sh /usr/local/share/atlas-utils.lib.sh
COPY --chmod=755 scripts/post-create-command.sh /usr/local/share/post-create-command.sh
COPY --chmod=755 scripts/post-start-command.sh /usr/local/share/post-start-command.sh

COPY first-run-notice.txt /usr/local/etc/vscode-dev-containers/first-run-notice.txt
