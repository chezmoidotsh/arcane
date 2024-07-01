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
# trunk-ignore-all(trivy/DS002,checkov/CKV_DOCKER_3): This is a base image and should not be run directly, so no USER required.
# trunk-ignore-all(trivy/DS026,checkov/CKV_DOCKER_2): This is a base image and should not be run directly, so no HEALTHCHECK required.

ARG ALPN_VERSION
ARG ALPN_VERSION_SHASUM


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the Alpine base image with all dependencies shared by   │
# |            all other images of this project.                              │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/alpine:${ALPN_VERSION}@${ALPN_VERSION_SHASUM} AS runtime

# renovate: datasource=repology depName=alpine_3_19/ca-certificates versioning=loose
ARG CA_CERTIFICATES_VERSION=20240226-r0
# renovate: datasource=repology depName=alpine_3_19/tzdata versioning=loose
ARG TZDATA_VERSION=2024a-r0

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
RUN set -eux; \
    apk add --no-cache \
        ca-certificates=${CA_CERTIFICATES_VERSION} \
        tzdata=${TZDATA_VERSION};

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="chezmoi.sh <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="1970-01-01 00:00:00.000000000Z" \
    org.opencontainers.image.description="A security-oriented, lightweight Linux distribution." \
    org.opencontainers.image.documentation="https://docs.alpinelinux.org" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="alpine" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/atlas"
