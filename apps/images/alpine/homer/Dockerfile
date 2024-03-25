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
# │ <source>: download the Homer source code and cache it for other stages    │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/alpine:3.19.1@sha256:c5b1261d6d3e43071626931fc004f70149baeba2c8ec672bd4f27761f8e1ad6b as source

# renovate: datasource=github-tags depName=bastienwirtz/homer versioning=semver
ARG HOMER_VERSION="v23.10.1"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${HOMER_VERSION} https://github.com/bastienwirtz/homer /src;


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder>: build the Homer assets (Node.js)                               │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/node:21.7.1-alpine3.19@sha256:577f8eb599858005100d84ef3fb6bd6582c1b6b17877a393cdae4bfc9935f068 as builder

COPY --from=source /src /app
WORKDIR /app
RUN set -eux; \
    yarn install --frozen-lockfile \
    && yarn build


# ┌───────────────────────────────────────────────────────────────────────────┐
# | <runtime>: create the final image with the compiled assets                |
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM --platform=arm64 localhost/alpine:stable

# renovate: datasource=github-tags depName=bastienwirtz/homer versioning=semver
ARG HOMER_VERSION="v23.10.1"

# renovate: datasource=repology depName=alpine_3_19/lighttpd versioning=loose
ARG LIGHTTPD_VERSION=1.4.73-r0

RUN set -eux; \
    addgroup -S -g 64952 lighttpd; \
    adduser -S -H -G lighttpd -u 64952 lighttpd; \
    apk add --no-cache \
        lighttpd=${LIGHTTPD_VERSION}; \
    \
    mkdir --parents /www /etc/lighttpd/conf.d; \
    chown lighttpd:lighttpd --recursive /www;

COPY config/lighttpd.conf /etc/lighttpd/lighttpd.conf
COPY --chown=lighttpd:lighttpd assets /www/assets
COPY --chown=lighttpd:lighttpd config/default.yaml /www/assets/config.yml
COPY --chown=lighttpd:lighttpd config/administration.yaml /www/assets/admin.yml
COPY --from=builder --chown=lighttpd:lighttpd /app/dist /www/

USER lighttpd
WORKDIR /www
ENTRYPOINT lighttpd -D -f /etc/lighttpd/lighttpd.conf

EXPOSE 8080
HEALTHCHECK --interval=5s CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="A very simple static homepage for your server" \
    org.opencontainers.image.documentation="https://github.com/bastienwirtz/homer" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="homer" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${HOMER_VERSION}
