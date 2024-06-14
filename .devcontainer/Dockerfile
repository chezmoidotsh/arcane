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
    && go build -o /opt/resource-docker-build-v0.0.2 \
      -gcflags "all=-N -l" \
      -ldflags "-X github.com/pulumi/pulumi-docker-build/provider.Version=v0.0.2"

FROM ghcr.io/pulumi/devcontainer:slim

# Copy custom first-run notice message
COPY first-run-notice.txt /usr/local/etc/vscode-dev-containers/first-run-notice.txt

# Copy fixed `pulumi-resource-docker-build` provider
COPY --from=pulumi-docker-build --chown=vscode:vscode /opt/resource-docker-build-v0.0.2 /home/vscode/.pulumi/plugins/resource-docker-build-v0.0.2/pulumi-resource-docker-build
