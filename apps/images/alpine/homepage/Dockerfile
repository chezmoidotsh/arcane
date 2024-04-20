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
# trunk-ignore-all(hadolint/DL3025)
# trunk-ignore-all(terrascan/AC_DOCKER_0041,terrascan/AC_DOCKER_0047,terrascan/AC_DOCKER_00024)

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
ARG BUILD_TYPE "live"

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <builder>: build the homepage project (NodeJS)                            │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/node:18.20.1-alpine3.19@sha256:c7133fc43172ba308c2637488ec8f031ac5fed6e1832042c3a521ff16d995d6e as builder

# renovate: datasource=github-tags depName=gethomepage/homepage versioning=semver
ARG HOMEPAGE_VERSION="v0.8.11"

# trunk-ignore(hadolint/DL3018): don't care to pin dependencies on build
RUN set -eux; \
    apk add --no-cache git; \
    git clone --depth 1 --branch ${HOMEPAGE_VERSION} https://github.com/gethomepage/homepage /src;

WORKDIR /src

# install all homepage dependencies
# trunk-ignore(hadolint/DL3016): don't care to pin npm dependencies on build
RUN set -eux; \
    npm install --global pnpm; \
    pnpm fetch && pnpm install --recursive --offline;

# This argument is used to define the build type (live or ci). It is overridden
# by the build system to point to the correct directory (CI or build).
ARG BUILD_TYPE "live"

COPY ${BUILD_TYPE}/config/assets/ /src/public
COPY ${BUILD_TYPE}/config/bookmarks.yaml /src/config/bookmarks.yaml
COPY ${BUILD_TYPE}/config/custom.css /src/config/custom.css
COPY ${BUILD_TYPE}/config/services.yaml /src/config/services.yaml
COPY ${BUILD_TYPE}/config/settings.yaml /src/config/settings.yaml
COPY ${BUILD_TYPE}/config/widgets.yaml /src/config/widgets.yaml
    
# build homepage with telemetry disabled
RUN set -eux; \
    pnpm exec next telemetry disable && \
        NEXT_PUBLIC_BUILDTIME=$(date -Iseconds) \
        NEXT_PUBLIC_VERSION=${HOMEPAGE_VERSION} \
        NEXT_PUBLIC_REVISION=$(git rev-parse HEAD) \
        pnpm run build;


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: create the homepage runtime image using all previous stages    │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/node:18.20.1-alpine3.19@sha256:c7133fc43172ba308c2637488ec8f031ac5fed6e1832042c3a521ff16d995d6e as runtime

# renovate: datasource=github-tags depName=gethomepage/homepage versioning=semver
ARG HOMEPAGE_VERSION="v0.8.11"

RUN set -eux; \
    addgroup --system --gid 64752 homepage; \
    adduser --system --no-create-home --home /nonexistent --ingroup homepage --uid 64752 homepage; \
    mkdir -p /app; \
    chown -R homepage:homepage /app;

COPY --from=builder --chown=homepage:homepage /src/config/ /app/config/
COPY --from=builder --chown=homepage:homepage /src/next.config.js /app/
COPY --from=builder --chown=homepage:homepage /src/public /app/public/
COPY --from=builder --chown=homepage:homepage /src/.next/standalone /app
COPY --from=builder --chown=homepage:homepage /src/.next/static/ /app/.next/static/

USER homepage
WORKDIR /app
ENTRYPOINT node server.js

EXPOSE 3000
HEALTHCHECK --interval=10s CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/healthcheck || exit 1

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with
# the source of the container image.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="A highly customizable homepage (or startpage / application dashboard) with Docker and service API integrations." \
    org.opencontainers.image.documentation="gethomepage.dev/latest/" \
    org.opencontainers.image.licenses="GPL-3.0 license" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="homepage" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${HOMEPAGE_VERSION}


# ┌───────────────────────────────────────────────────────────────────────────┐
# └───────────────────────────────────────────────────────────────────────────┘
FROM runtime
