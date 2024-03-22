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
# │ <builder>: build the Tailscale binary (Go)                                │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/golang:1.22.0-alpine3.19 as builder

# renovate: datasource=github-tags depName=tailscale/tailscale versioning=semver
ARG TAILSCALE_VERSION="v1.60.0"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git libcap; \
    git clone --depth 1 --branch ${TAILSCALE_VERSION} https://github.com/tailscale/tailscale /src

WORKDIR /src

# build yaLDAP for ARM64 architecture
ENV CGO_ENABLED=0 \
    GOOS=linux GOARCH=arm64 GOARM=7

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
FROM --platform=arm64 oci.chezmoi.sh/localhost/alpine:stable

# renovate: datasource=github-tags depName=tailscale/tailscale versioning=semver
ARG TAILSCALE_VERSION="v1.60.0"

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
    addgroup -S -g 64241 tailscale; \
    adduser -S -H -G tailscale -u 64241 tailscale; \
    mkdir -p /var/lib/tailscale; \
    chown tailscale:tailscale /var/lib/tailscale;

COPY --from=builder /src/bin/* /usr/local/bin/

ENV TS_SOCKET=/var/run/tailscale/tailscaled.sock \
    TS_STATE_DIR=/var/lib/tailscale \
    TS_USERSPACE=true

USER tailscale
WORKDIR /var/lib/tailscale
ENTRYPOINT containerboot

HEALTHCHECK --interval=5s CMD tailscale status --self=false --peers=false || exit 1
VOLUME /var/lib/tailscale

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="The easiest, most secure way to use WireGuard and 2FA" \
    org.opencontainers.image.documentation="https://tailscale.com" \
    org.opencontainers.image.licenses="BSD-3-Clause" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="tailscale" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${TAILSCALE_VERSION}
