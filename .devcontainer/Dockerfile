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
#
# trunk-ignore-all(trivy/DS026,checkov/CKV_DOCKER_2): This Dockerfile is used for development purposes only, so no need to add HEALTHCHECK instruction
# trunk-ignore-all(trivy/DS002,checkov/CKV_DOCKER_3): The user will be created during the DevContainer build process
# trunk-ignore-all(trivy/DS013): Don't care about this rule
# trunk-ignore-all(hadolint/DL3018): Don't care about pinning the version of packages, as this is a development container and only git is installed
# trunk-ignore-all(hadolint/DL3003): Don't care about WORKDIR instruction, as this will be set by the DevContainer
FROM docker.io/library/golang:alpine as pulumi-docker-build

# Clone fixed `pulumi-resource-docker-build` provider
RUN apk add --no-cache git \
    && git clone --branch issue-96/allow-empty-inline-on-preview https://github.com/xunleii/pulumi-docker-build \
    && cd pulumi-docker-build/provider/cmd/pulumi-resource-docker-build \
    && go build -o /opt/resource-docker-build-v0.0.3 \
      -gcflags "all=-N -l" \
      -ldflags "-X github.com/pulumi/pulumi-docker-build/provider.Version=v0.0.3"

# NOTE: This image will be cached (and the machine-id too). It is an expected behavior, as I want
#       a persistent machine-id even if the image is rebuilt.
FROM docker.io/library/alpine:3.20.1 as machine-id

RUN apk add --no-cache dbus \
    && dbus-uuidgen > /etc/machine-id


FROM ghcr.io/pulumi/devcontainer:slim-node

# Copy custom first-run notice message
COPY first-run-notice.txt /usr/local/etc/vscode-dev-containers/first-run-notice.txt

# Install ASDF package manager
ENV ASDF_DIR=/home/vscode/.asdf
ENV PATH="${ASDF_DIR}/bin:${ASDF_DIR}/shims:${PATH}"
RUN git clone https://github.com/asdf-vm/asdf.git ${ASDF_DIR} --branch v0.14.0 \
    && asdf plugin add asdf-helper https://github.com/ngyewch/asdf-helper-plugin.git \
    && asdf install asdf-helper latest \
    && asdf global asdf-helper latest

# Copy generated machine-id
COPY --from=machine-id /etc/machine-id /etc/machine-id

# Copy lazygit configuration
COPY lazygit.config.yaml /home/vscode/.config/lazygit/config.yaml

# Copy fixed `pulumi-resource-docker-build` provider
COPY --from=pulumi-docker-build --chown=vscode:vscode /opt/resource-docker-build-v0.0.3 /home/vscode/.pulumi/plugins/resource-docker-build-v0.0.3/pulumi-resource-docker-build
