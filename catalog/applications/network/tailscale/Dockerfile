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
# trunk-ignore-all(hadolint/DL3006,checkov/CKV_DOCKER_7): ALPN_BASE contains IMAGE, TAG and SHA

# This argument is used to define which image should be used as base layer for
# the runtime image.
ARG ALPN_BASE



# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder>: build the Tailscale binary (Go)                                │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.4-alpine3.19@sha256:c46c4609d3cc74a149347161fc277e11516f523fd8aa6347c9631527da0b7a56 AS builder

ARG TAILSCALE_VERSION

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git libcap; \
    git clone --depth 1 --branch ${TAILSCALE_VERSION} https://github.com/tailscale/tailscale /src

WORKDIR /src

RUN set -eux; \
    mkdir -p /src/bin; \
    go build -ldflags " \
        -X tailscale.com/version.longStamp=${TAILSCALE_VERSION} \
        -X tailscale.com/version.shortStamp=${TAILSCALE_VERSION} \
        -X tailscale.com/version.gitCommitStamp=$(git rev-parse --short HEAD) \
    " -o /src/bin/tailscale ./cmd/tailscale; \
    go build -ldflags " \
        -X tailscale.com/version.longStamp=${TAILSCALE_VERSION} \
        -X tailscale.com/version.shortStamp=${TAILSCALE_VERSION} \
        -X tailscale.com/version.gitCommitStamp=$(git rev-parse --short HEAD) \
    " -o /src/bin/tailscaled ./cmd/tailscaled; \
    go build -ldflags " \
        -X tailscale.com/version.longStamp=${TAILSCALE_VERSION} \
        -X tailscale.com/version.shortStamp=${TAILSCALE_VERSION} \
        -X tailscale.com/version.gitCommitStamp=$(git rev-parse --short HEAD) \
    " -o /src/bin/containerboot ./cmd/containerboot; \
    \
    setcap cap_net_admin+ep /src/bin/tailscaled;


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: run the Tailscale binary (Alpine)                              │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM ${ALPN_BASE} AS runtime

# renovate: datasource=github-tags depName=tailscale/tailscale versioning=semver
ARG TAILSCALE_VERSION

# renovate: datasource=repology depName=alpine_3_19/iproute2 versioning=loose
ARG IPROUTE2_VERSION="6.6.0-r0"

# renovate: datasource=repology depName=alpine_3_19/iptables versioning=loose
ARG IPTABLES_VERSION="1.8.10-r3"

RUN set -eux; \
    apk add --no-cache \
        iproute2=${IPROUTE2_VERSION} \
        iptables=${IPTABLES_VERSION} \
        ip6tables=${IPTABLES_VERSION}; \
    \
    addgroup --system --gid 64241 tailscale; \
    adduser --system --no-create-home --home /nonexistent --ingroup tailscale --uid 64241 tailscale; \
    mkdir -p /var/lib/tailscale; \
    chown tailscale:tailscale /var/lib/tailscale;

COPY --from=builder /src/bin/* /usr/local/bin/

ENV TS_SOCKET=/var/run/tailscale/tailscaled.sock \
    TS_STATE_DIR=/var/lib/tailscale \
    TS_USERSPACE=true

USER tailscale
WORKDIR /var/lib/tailscale
ENTRYPOINT ["containerboot"]

HEALTHCHECK --interval=5s CMD tailscale status --self=false --peers=false || exit 1
VOLUME /var/lib/tailscale

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="chezmoi.sh <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="The easiest, most secure way to use WireGuard and 2FA" \
    org.opencontainers.image.documentation="https://tailscale.com" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="tailscale" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/atlas" \
    org.opencontainers.image.version=${TAILSCALE_VERSION}
