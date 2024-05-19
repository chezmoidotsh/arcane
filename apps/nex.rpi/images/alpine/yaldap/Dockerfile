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
# │ <builder>: build the yaLDAP binary (Go)                                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.3-alpine3.19@sha256:f1fe698725f6ed14eb944dc587591f134632ed47fc0732ec27c7642adbe90618 as builder

# renovate: datasource=github-tags depName=xunleii/yaldap versioning=semver
ARG YALDAP_VERSION="v0.2.0"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${YALDAP_VERSION} https://github.com/xunleii/yaldap /src

WORKDIR /src

# build yaLDAP for ARM64 architecture
ENV CGO_ENABLED=0 \
    GOOS=linux GOARCH=arm64 GOARM=7

RUN set -eux; \
    go build \
        -ldflags " \
            -X github.com/prometheus/common/version.Version=${YALDAP_VERSION} \
            -X github.com/prometheus/common/version.Revision=$(git rev-parse --short HEAD) \
            -X github.com/prometheus/common/version.Branch=$(git rev-parse --abbrev-ref HEAD) \
            -X github.com/prometheus/common/version.BuildUser=$(whoami)@$(hostname) \
            -X github.com/prometheus/common/version.BuildDate=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
        " \
        -o /src/yaldap ./cmd/yaldap/


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the yaLDAP runtime image using all previous stages      │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM --platform=arm64 localhost/nex.rpi/alpine:${BUILD_TYPE} as runtime

# renovate: datasource=github-tags depName=xunleii/yaldap versioning=semver
ARG YALDAP_VERSION="v0.2.0"

RUN set -eux; \
    addgroup --system --gid 64885 yaldap; \
    adduser --system --no-create-home --home /nonexistent --ingroup yaldap --uid 64885 yaldap;

COPY --from=builder /src/yaldap /src/LICENSE /opt/yaldap/

ENV PATH=/opt/yaldap:${PATH}

USER yaldap
WORKDIR /opt/yaldap
ENTRYPOINT yaldap run --backend.name yaml --backend.url file:///etc/yaldap/backend.yaml

EXPOSE 389
HEALTHCHECK --interval=5s CMD nc -z localhost 389 || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with 
# the source code.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="1970-01-01 00:00:00.000000000Z" \
    org.opencontainers.image.description="Your identity, your rules." \
    org.opencontainers.image.documentation="https://github.com/xunleii/yaldap" \
    org.opencontainers.image.licenses="AGPL-3.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="yaldap" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${YALDAP_VERSION}


# ┌───────────────────────────────────────────────────────────────────────────┐
# └───────────────────────────────────────────────────────────────────────────┘
FROM runtime

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
ARG BUILD_TYPE "live"

COPY --chown=yaldap:yaldap ${BUILD_TYPE}/config/backend.ldap.yaml /etc/yaldap/backend.yaml
