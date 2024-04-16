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
# trunk-ignore-all(checkov/CKV_DOCKER_8,trivy/DS002,hadolint/DL3002): This image needs to be run as root to communicate with the Docker socket
# trunk-ignore-all(hadolint/DL3029,hadolint/DL3025)

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
ARG BUILD_TYPE "live"

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the autoheal runtime image                              │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
# NOTE²: this image will must be run with the root user to access the docker
#        socket and restart unhealthy containers.
# TODO: rewrite this application in Go to reduce the surface attack.
FROM --platform=arm64 localhost/alpine:${BUILD_TYPE}

# renovate: datasource=repology depName=alpine_3_19/bash versioning=loose
ARG BASH_VERSION="5.2.21-r0"
# renovate: datasource=repology depName=alpine_3_19/curl versioning=loose
ARG CURL_VERSION="8.5.0-r0"
# renovate: datasource=repology depName=alpine_3_19/jq versioning=loose
ARG JQ_VERSION="1.7.1-r0"

RUN set -eux; \
    apk add --no-cache \
        bash=${BASH_VERSION} \
        curl=${CURL_VERSION} \
        jq=${JQ_VERSION};

COPY entrypoint /entrypoint

ENV APPRISE_URL="" \
    AUTOHEAL_CONTAINER_LABEL=autoheal \
    AUTOHEAL_DEFAULT_STOP_TIMEOUT=10 \
    AUTOHEAL_INTERVAL=5 \
    AUTOHEAL_START_PERIOD=0 \
    CURL_TIMEOUT=30 \
    DOCKER_SOCK=/var/run/docker.sock \
    POST_RESTART_SCRIPT="" \
    WEBHOOK_JSON_KEY="content" \
    WEBHOOK_URL=""

USER root
ENTRYPOINT /entrypoint

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with 
# the source code.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="Monitor and restart unhealthy docker containers." \
    org.opencontainers.image.documentation="https://github.com/willfarrell/docker-autoheal" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="autoheal" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${NUT_VERSION}
