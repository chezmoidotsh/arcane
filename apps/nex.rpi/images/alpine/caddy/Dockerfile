# Copyright 2024
#
# Everyone is permitted to copy, distribute, modify, merge, sell, publish,
# sublicense or whatever the fuck they want with this software but at their
# OWN RISK.
# The author has absolutely no fucking clue what the code in this project
# does. It might just fucking work or not, there is no third option.
#
# IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
# DEALINGS IN THE SOFTWARE.
# ---
# trunk-ignore-all(hadolint/DL3029,hadolint/DL3025)

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder>: create the Caddy builder with additional plugins               │
# └───────────────────────────────────────────────────────────────────────────┘
# renovate: datasource=github-tags depName=caddyserver/caddy versioning=semver
ARG CADDY_VERSION="2.7.6"

FROM docker.io/library/golang:1.22.2-alpine3.19@sha256:cdc86d9f363e8786845bea2040312b4efa321b828acdeb26f393faa864d887b0 as builder

# renovate: datasource=github-release depName=caddyserver/xcaddy versioning=semver
ARG XCADDY_VERSION="v0.3.5"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
# trunk-ignore(hadolint/DL4006): -o pipefail is configured and don't want to use SHELL because it's not supported by all OCI builders
# trunk-ignore(hadolint/SC3057): in Alpine sh, string indexing is defined so I will use it
RUN set -eux; \
    set -o pipefail; \
    apk add --no-cache \
        git; \
    \
	apkArch="$(apk --print-arch)"; \
	case "$apkArch" in \
		x86_64)  binArch='amd64'; checksum='9e87261a4ca4144bf25105e0cb3b3eb0fb0b8564fe4fa5c126e25a926baea2d16868cb4e88cafc419dc69db3e692894bc7ebcb25434c0bbb74362c2f3a696db5' ;; \
		armhf)   binArch='armv6'; checksum='e327445263f3c4ceacae92f88417ef9d2f559bd01ea53230c38529295f2c29da45a0f9c436a71dafc85009a4ead7acdde832971479fccde7839228f0fc2153f1' ;; \
		armv7)   binArch='armv7'; checksum='c46e12f1750ea1c99a80cf0ab2115541957f2791257176df2dbf2b25869c552b3108ff7c9d6854081dcf843548e6ec3b1e5451944bd7b6b9527dfe63f849f01b' ;; \
		aarch64) binArch='arm64'; checksum='a4b1caf438326e0dcb58830701993d514b11fd86b4880c9c013c230031dfa68efa339be186662f586ce848d5a2841a2e6513f41ada9a05c04a297433df3f2a52' ;; \
		ppc64el|ppc64le) binArch='ppc64le'; checksum='b9c79ec1ddd1f7606d7f1263cf4ebad8c03154e78e301db27cb1554723b1f12ae886dd4be682a9decd3dbc189d6e90c51879ae160696db00e0d32dced2df8991' ;; \
		s390x)   binArch='s390x'; checksum='658f3d85e751e3e43906e55b9f915c35c1e87c6cdeb606263147804520fe4cf3afdf295882c7bab2e9c932a7c12d1759275fa1c0b611d5b770c940e9ec13ec43' ;; \
		*) echo >&2 "error: unsupported architecture ($apkArch)"; exit 1 ;;\
	esac; \
    wget -qO /tmp/xcaddy.tar.gz "https://github.com/caddyserver/xcaddy/releases/download/${XCADDY_VERSION}/xcaddy_${XCADDY_VERSION:1}_linux_${binArch}.tar.gz"; \
    echo "${checksum}  /tmp/xcaddy.tar.gz" | sha512sum -c -; \
    tar -xzf /tmp/xcaddy.tar.gz -C /usr/bin xcaddy; \
    rm -f /tmp/xcaddy.tar.gz; \
    chmod +x /usr/bin/xcaddy

# build Caddy with additional plugins for ARM64 architecture
ENV CGO_ENABLED=0 \
    GOOS=linux GOARCH=arm64 GOARM=7 \
    GOPRIVATE=github.com/xunleii/caddy-tailscale

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/abiosoft/caddy-json-schema \
    --with github.com/mholt/caddy-l4 \
    --with github.com/greenpau/caddy-trace


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <error-pages>: create all static error pages using tarampampam/error-page │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.2-alpine3.19@sha256:cdc86d9f363e8786845bea2040312b4efa321b828acdeb26f393faa864d887b0 as error-pages

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
FROM --platform=arm64 localhost/alpine:stable as runtime

# renovate: datasource=github-tags depName=caddyserver/caddy versioning=semver
ARG CADDY_VERSION="2.7.6"

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
    adduser --system --no-create-home --ingroup caddy --uid 64138 caddy; \
    mkdir --parents /etc/caddy /var/lib/caddy; \
    chown caddy:caddy --recursive /etc/caddy /var/lib/caddy;

COPY --from=builder /go/caddy /usr/bin/caddy

ENV XDG_DATA_HOME=/var/lib/caddy \
    XDG_CONFIG_HOME=/var/lib/caddy

USER caddy
WORKDIR /var/lib/caddy
ENTRYPOINT caddy run --config /etc/caddy/caddy.json

VOLUME /var/lib/caddy
HEALTHCHECK --interval=15s CMD wget --no-verbose --tries=1 --spider http://localhost:2019/metrics || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with 
# the source code.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="1970-01-01 00:00:00.000000000Z" \
    org.opencontainers.image.description="Fast and extensible multi-platform HTTP/1-2-3 web server with automatic HTTPS." \
    org.opencontainers.image.documentation="https://caddyserver.com/docs/" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="caddy" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${CADDY_VERSION}


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <config>: create the Caddy JSON configuration from YAML                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM builder as config

# NOTE: install jq into a dedicated stage in order to use Docker layer caching
# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache jq;

COPY config/* /workdir/

RUN set -eux; \
    /go/caddy adapt --pretty --config /workdir/Caddyfile > /workdir/Caddyfile.json; \
    jq --slurp '.[0] * .[1]' /workdir/Caddyfile.json /workdir/layer4.json > /workdir/caddy.json;


# ┌───────────────────────────────────────────────────────────────────────────┐
# └───────────────────────────────────────────────────────────────────────────┘
FROM runtime

COPY --from=config /workdir/caddy.json /etc/caddy/caddy.json
COPY --from=error-pages /src/html/l7-light /var/www/error-pages
