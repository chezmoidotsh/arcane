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
# │ <builder>: build the gatus binary (Go)                                    │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.4-alpine3.19@sha256:c46c4609d3cc74a149347161fc277e11516f523fd8aa6347c9631527da0b7a56 AS builder

ARG GATUS_VERSION

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${GATUS_VERSION} https://github.com/TwiN/gatus.git /src

WORKDIR /src

RUN set -eux; \
    go build \
        -o /src/gatus .


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the gatus runtime image using all previous stages       │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM ${ALPN_BASE} AS runtime

ARG GATUS_VERSION

RUN set -eux; \
    addgroup --system --gid 64114 gatus; \
    adduser --system --no-create-home --home /nonexistent --ingroup gatus --uid 64114 gatus; \
    mkdir -p /var/lib/gatus; \
    chown -R gatus:gatus /var/lib/gatus;

COPY --from=builder /src/gatus /gatus

ENV GATUS_CONFIG_PATH="/etc/gatus/gatus.yaml"

USER gatus
WORKDIR /var/lib/gatus
ENTRYPOINT ["/gatus"]

EXPOSE 8080
VOLUME [ "/var/lib/gatus" ]
HEALTHCHECK --interval=5s CMD wget --no-verbose --tries=1 --spider http://localhost:8080 || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="chezmoi.sh <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="Automated developer-oriented status page" \
    org.opencontainers.image.documentation="https://gatus.io/docs" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="gatus" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${GATUS_VERSION}
