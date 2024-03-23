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
# │ <source>: download the Authelia source code and cache it for other stages │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/alpine:3.19.0 as source

# renovate: datasource=github-tags depName=authelia/authelia versioning=semver
ARG AUTHELIA_VERSION="v4.38.0-beta3"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${AUTHELIA_VERSION} https://github.com/authelia/authelia /src;


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder-frontend>: build the Authelia frontend (Node.js)                 │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/node:21.5.0-alpine3.19 as builder-frontend

WORKDIR /node/src/app
COPY --from=source /src/web ./

RUN set -eux; \
    # we need to install with --production=false to install devDependencies, required
    # to build the frontend.
    yarn install --frozen-lockfile --production=false; \
    yarn build


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder-backend>: build the Authelia backend (Go)                        │
# └───────────────────────────────────────────────────────────────────────────┘
FROM --platform=arm64 docker.io/library/golang:1.21.5-alpine3.19 as builder-backend

# renovate: datasource=repology depName=alpine_3_19/gcc versioning=loose
ARG GCC_VERSION=13.2.1_git20231014-r0
# renovate: datasource=repology depName=alpine_3_19/musl-dev versioning=loose
ARG MUSL_DEV_VERSION=1.2.4_git20230717-r4

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache \
        git \
        gcc=${GCC_VERSION} \
        musl-dev=${MUSL_DEV_VERSION}

WORKDIR /go/src/app
COPY --from=source /src/ ./
COPY --from=builder-frontend /node/src/internal/server/public_html internal/server/public_html

# enable CGO (C Go) support and set security-related flags for Go build process:
# - CGO_ENABLED=1 enables CGO during compilation.
# - CGO_CPPFLAGS includes C preprocessor options for enhanced security:
#     -D_FORTIFY_SOURCE=2: Helps detect certain buffer overflow errors at runtime.
#     -fstack-protector-strong: Adds stack protection against buffer overflows.
# - CGO_LDFLAGS includes linker options for improved security:
#     -Wl,-z,relro: Enables "read-only relocations" for specific sections after program start.
#     -Wl,-z,now: Requests immediate binding, resolving all symbols when the program starts.
ENV CGO_ENABLED=1 \
    CGO_CPPFLAGS="-D_FORTIFY_SOURCE=2 -fstack-protector-strong" \
    CGO_LDFLAGS="-Wl,-z,relro,-z,now"

# renovate: datasource=github-tags depName=authelia/authelia versioning=semver
ARG AUTHELIA_VERSION="v4.38.0-beta3"

# this step is required to avoid downloading the dependencies every time the
# source code changes, speeding up the build process locally.
RUN go mod download

RUN set -eux; \
    mv api internal/server/public_html/api; \
    # build the Authelia authentication server with the following options:
    # - `-trimpath`: Trim file path information for smaller binaries.
    # - `-buildmode=pie`: Build a Position Independent Executable (PIE) for additional security.
    # - `-ldflags`: Set linker flags.
    #     - `-linkmode=external -s -w`: Use external linking, strip symbol table and DWARF debugging information for smaller size.
    go build \
        -trimpath \
        -buildmode=pie \
        -ldflags "\
            -linkmode=external -s -w \
            -X github.com/authelia/authelia/v4/internal/utils.BuildTag=${AUTHELIA_VERSION} \
            -X 'github.com/authelia/authelia/v4/internal/utils.BuildState=clean tagged' \
            -X github.com/authelia/authelia/v4/internal/utils.BuildExtra=unofficial \
            -X github.com/authelia/authelia/v4/internal/utils.BuildDate=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
            -X github.com/authelia/authelia/v4/internal/utils.BuildCommit=$(git rev-parse --short HEAD) \
            -X github.com/authelia/authelia/v4/internal/utils.BuildBranch=${AUTHELIA_VERSION} \
        " \
        -o authelia ./cmd/authelia

# update the healthcheck script with the final path
RUN set -eux; \
    sed -i 's|/app/|/opt/authelia/bin/|' /go/src/app/healthcheck.sh


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the Authelia runtime image using all previous stages    │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM --platform=arm64 oci.chezmoi.sh/localhost/alpine:stable

# renovate: datasource=github-tags depName=authelia/authelia versioning=semver
ARG AUTHELIA_VERSION="v4.38.0-beta3"

RUN set -eux; \
    addgroup -S -g 64829 authelia; \
    adduser -S -H -G authelia -u 64829 authelia; \
    mkdir --parents /etc/authelia /opt/authelia/bin /var/lib/authelia; \
    chown authelia:authelia --recursive /opt/authelia /var/lib/authelia

COPY --chown=authelia:authelia --from=builder-backend /go/src/app/authelia /go/src/app/LICENSE /go/src/app/healthcheck.sh /go/src/app/.healthcheck.env /opt/authelia/bin/
COPY --chown=authelia:authelia config/configuration.yaml /etc/authelia/configuration.yaml

ENV PATH=/opt/authelia/bin:${PATH}
ENV X_AUTHELIA_CONFIG=/etc/authelia/configuration.yaml

USER authelia
WORKDIR /var/lib/authelia
ENTRYPOINT authelia

EXPOSE 9091
VOLUME /var/lib/authelia
HEALTHCHECK --interval=5s CMD healthcheck.sh

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with 
# the source code.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="1970-01-01 00:00:00.000000000Z" \
    org.opencontainers.image.description="The Single Sign-On Multi-Factor portal for web apps." \
    org.opencontainers.image.documentation="https://www.authelia.com/configuration/prologue/introduction/" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="authelia" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${AUTHELIA_VERSION}
