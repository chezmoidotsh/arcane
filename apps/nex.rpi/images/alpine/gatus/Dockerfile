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

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
ARG BUILD_TYPE "live"

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder>: build the gatus binary (Go)                                    │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.2-alpine3.19@sha256:cdc86d9f363e8786845bea2040312b4efa321b828acdeb26f393faa864d887b0 as builder

# renovate: datasource=github-tags depName=TwiN/gatus versioning=semver
ARG GATUS_VERSION="v5.9.0"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${GATUS_VERSION} https://github.com/TwiN/gatus.git /src

WORKDIR /src

# build gatus for ARM64 architecture
ENV CGO_ENABLED=0 \
    GOOS=linux GOARCH=arm64 GOARM=7

RUN set -eux; \
    go build \
        -o /src/gatus .


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the gatus runtime image using all previous stages       │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM --platform=arm64 localhost/alpine:${BUILD_TYPE} as runtime

# renovate: datasource=github-tags depName=TwiN/gatus versioning=semver
ARG GATUS_VERSION="v5.9.0"

RUN set -eux; \
    addgroup --system --gid 64114 gatus; \
    adduser --system --no-create-home --home /nonexistent --ingroup gatus --uid 64114 gatus; \
    mkdir -p /var/lib/gatus; \
    chown -R gatus:gatus /var/lib/gatus;

COPY --from=builder /src/gatus /gatus

ENV GATUS_CONFIG_PATH="/etc/gatus/gatus.yaml"

USER gatus
WORKDIR /var/lib/gatus
ENTRYPOINT /gatus

EXPOSE 8080
VOLUME [ "/var/lib/gatus" ]
HEALTHCHECK --interval=5s CMD wget --no-verbose --tries=1 --spider http://localhost:8080 || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="Automated developer-oriented status page" \
    org.opencontainers.image.documentation="https://gatus.io/docs" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="gatus" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${GATUS_VERSION}


# ┌───────────────────────────────────────────────────────────────────────────┐
# └───────────────────────────────────────────────────────────────────────────┘
FROM runtime

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
ARG BUILD_TYPE "live"

COPY --chown=gatus:gatus ${BUILD_TYPE}/config/gatus.yaml /etc/gatus/gatus.yaml
