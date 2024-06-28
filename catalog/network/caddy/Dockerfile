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
# │ <builder>: create the Caddy builder with additional plugins               │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.4-alpine3.19@sha256:c46c4609d3cc74a149347161fc277e11516f523fd8aa6347c9631527da0b7a56 AS builder

# renovate: datasource=github-tags depName=caddyserver/xcaddy versioning=semver
ARG XCADDY_VERSION="v0.3.5"
ARG CADDY_VERSION

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
# trunk-ignore(hadolint/SC3057): in Alpine sh, string indexing is defined so I will use it
RUN set -eux; \
    set -o pipefail; \
    apk add --no-cache \
        git; \
    \
	apkArch="$(apk --print-arch)"; \
	case "$apkArch" in \
		x86_64)  binArch='amd64' ;; \
		armhf)   binArch='armv6' ;; \
		armv7)   binArch='armv7' ;; \
		aarch64) binArch='arm64' ;; \
		ppc64el|ppc64le) binArch='ppc64le' ;; \
		s390x)   binArch='s390x' ;; \
		*) echo >&2 "error: unsupported architecture ($apkArch)"; exit 1 ;;\
	esac; \
    wget -qO /tmp/xcaddy.tar.gz "https://github.com/caddyserver/xcaddy/releases/download/${XCADDY_VERSION}/xcaddy_${XCADDY_VERSION:1}_linux_${binArch}.tar.gz"; \
    tar -xzf /tmp/xcaddy.tar.gz -C /usr/bin xcaddy; \
    rm -f /tmp/xcaddy.tar.gz; \
    chmod +x /usr/bin/xcaddy

RUN xcaddy build "${CADDY_VERSION}" \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/abiosoft/caddy-json-schema \
    --with github.com/mholt/caddy-l4 \
    --with github.com/greenpau/caddy-trace


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <error-pages>: create all static error pages using tarampampam/error-page │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.4-alpine3.19@sha256:c46c4609d3cc74a149347161fc277e11516f523fd8aa6347c9631527da0b7a56 AS error-pages

# renovate: datasource=github-tags depName=tarampampam/error-pages versioning=semver
ARG ERROR_PAGES_VERSION="v2.27.0"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${ERROR_PAGES_VERSION} https://github.com/tarampampam/error-pages.git /src

WORKDIR /src

RUN set -eux; \
    go build \
        -o /src/error-pages \
        -ldflags="-s -w -X gh.tarampamp.am/error-pages/internal/version.version=${ERROR_PAGES_VERSION}" \
        ./cmd/error-pages/;
RUN /src/error-pages --verbose build --config-file /src/error-pages.yml --disable-l10n /src/html


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the Caddy runtime image                                 │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM ${ALPN_BASE} AS runtime

ARG CADDY_VERSION

# renovate: datasource=repology depName=alpine_3_19/libcap versioning=loose
ARG LIBCAP_VERSION=2.69-r1
# renovate: datasource=repology depName=alpine_3_19/mailcap versioning=loose
ARG MAILCAP_VERSION=2.1.54-r0

RUN set -eux; \
    apk add --no-cache \
        libcap=${LIBCAP_VERSION} \
        mailcap=${MAILCAP_VERSION}; \
    \
    addgroup --system --gid 64138 caddy; \
    adduser --system --home /nonexistent --no-create-home --ingroup caddy --uid 64138 caddy; \
    mkdir --parents /etc/caddy /var/lib/caddy; \
    chown caddy:caddy --recursive /etc/caddy /var/lib/caddy;

COPY --from=builder /go/caddy /usr/bin/caddy
COPY --from=error-pages --chown=caddy:caddy /src/html/l7-light /var/www/error-pages

ENV XDG_DATA_HOME=/var/lib/caddy \
    XDG_CONFIG_HOME=/var/lib/caddy

USER caddy
WORKDIR /var/lib/caddy
ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/caddy.json"]

VOLUME /var/lib/caddy
HEALTHCHECK --interval=15s CMD wget --no-verbose --tries=1 --spider http://localhost:2019/metrics || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source code.
LABEL \
    org.opencontainers.image.authors="chezmoi.sh <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="1970-01-01 00:00:00.000000000Z" \
    org.opencontainers.image.description="Fast and extensible multi-platform HTTP/1-2-3 web server with automatic HTTPS." \
    org.opencontainers.image.documentation="https://caddyserver.com/docs/" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="caddy" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${CADDY_VERSION}
