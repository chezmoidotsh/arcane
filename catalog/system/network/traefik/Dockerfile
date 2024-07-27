# Copyright (C) 2023 Alexandre Nicolaie (xunleii@users.noreply.github.com)
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
# │ <builder>: build the yaLDAP binary (Go)                                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.4-alpine3.19@sha256:c46c4609d3cc74a149347161fc277e11516f523fd8aa6347c9631527da0b7a56 AS builder

ARG TRAEFIK_VERSION
ARG TRAEFIK_CODENAME

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${TRAEFIK_VERSION} https://github.com/traefik/traefik /src

WORKDIR /src

RUN set -eux; \
    go build \
        -ldflags " \
            -X github.com/traefik/traefik/v2/pkg/version.Version=$(git rev-parse HEAD) \
            -X github.com/traefik/traefik/v2/pkg/version.Codename=${TRAEFIK_CODENAME} \
            -X github.com/traefik/traefik/v2/pkg/version.BuildDate=$(date -u +'%Y-%m-%d_%I:%M:%S%p') \
        " \
        -o /src/traefik ./cmd/traefik;


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the yaLDAP runtime image using all previous stages      │
# └───────────────────────────────────────────────────────────────────────────┘
FROM ${ALPN_BASE} AS runtime

ARG TRAEFIK_VERSION

RUN set -eux; \
    addgroup --system --gid 64611 traefik; \
    adduser --system --no-create-home --home /nonexistent --ingroup traefik --uid 64611 traefik; \
    mkdir -p /var/lib/traefik/plugins; \
    chown -R traefik:traefik /var/lib/traefik/plugins

COPY --from=builder /src/traefik /src/LICENSE.md /opt/traefik/

ENV PATH=/opt/traefik:${PATH}

USER traefik
WORKDIR /opt/traefik
ENTRYPOINT ["traefik"]

EXPOSE 80 443 8080
HEALTHCHECK --interval=5s CMD wget -qO- http://localhost:8080/ping || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source code.
LABEL \
    org.opencontainers.image.authors="chezmoi.sh <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="1970-01-01 00:00:00.000000000Z" \
    org.opencontainers.image.description="Traefik is a modern HTTP reverse proxy and load balancer that makes deploying microservices easy." \
    org.opencontainers.image.documentation="https://doc.traefik.io/traefik/" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="traefik" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/atlas" \
    org.opencontainers.image.version=${TRAEFIK_VERSION}
