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

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <pulumi-docker-build>: Build a custom Pulumi Docker Build provider with   │
# |                        support for unknwon values in inline dockerfile.   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:alpine as pulumi-docker-build

# Clone fixed `pulumi-resource-docker-build` provider
RUN apk add --no-cache git \
    && git clone --branch issue-96/allow-empty-inline-on-preview https://github.com/xunleii/pulumi-docker-build \
    && cd pulumi-docker-build/provider/cmd/pulumi-resource-docker-build \
    && go build -o /opt/resource-docker-build-v0.0.3 \
      -gcflags "all=-N -l" \
      -ldflags "-X github.com/pulumi/pulumi-docker-build/provider.Version=v0.0.3"


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <gum>: Compile charmbracelet/gum from source                              |
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:alpine as gum

RUN go install github.com/charmbracelet/gum@latest


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
# │ <git-absorb>: Build/install git-absorb.                                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/rust:slim as git-absorb

RUN cargo install git-absorb


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <devcontainer>: Create a slim development container with Node.js.         │
# └───────────────────────────────────────────────────────────────────────────┘
FROM ghcr.io/pulumi/devcontainer:slim-node

# Install ASDF package manager
ENV ASDF_DIR=/home/vscode/.asdf
ENV PATH="${ASDF_DIR}/bin:${ASDF_DIR}/shims:${PATH}"
RUN git clone https://github.com/asdf-vm/asdf.git ${ASDF_DIR} --branch v0.14.0

# Copy generated machine-id
COPY --from=machine-id /etc/machine-id /etc/machine-id

# Copy git-absorb binary
COPY --from=git-absorb /usr/local/cargo/bin/git-absorb /usr/bin/git-absorb
# trunk-ignore-all(trivy/DS005,checkov/CKV_DOCKER_4): ADD makes sense here, and is recommended by Docker
ADD https://raw.githubusercontent.com/tummychow/git-absorb/master/Documentation/git-absorb.1 /home/vscode/.local/share/man/man1/git-absorb.1

# Copy gum binary
COPY --from=gum /go/bin/gum /usr/bin/gum

# Copy fixed `pulumi-resource-docker-build` provider
COPY --from=pulumi-docker-build --chown=vscode:vscode /opt/resource-docker-build-v0.0.3 /home/vscode/.pulumi/plugins/resource-docker-build-v0.0.3/pulumi-resource-docker-build

COPY --chmod=755 scripts/post-create-command.sh /usr/local/share/post-create-command.sh
COPY config/home.vscode..config.lazygit.config.yaml /home/vscode/.config/lazygit/config.yaml
COPY config/etc.docker.pulumi-buildkitd.toml /etc/docker/pulumi-buildkitd.toml
COPY first-run-notice.txt /usr/local/etc/vscode-dev-containers/first-run-notice.txt
