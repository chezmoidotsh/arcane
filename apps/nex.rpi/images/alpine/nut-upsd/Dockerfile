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
# │ <runtime>: create the nut runtime image                                   │
# └───────────────────────────────────────────────────────────────────────────┘
# NOTE: this base image MUST BE used by any other image of this project to be
#       able to use cache layers and avoid downloading the same dependencies.
FROM --platform=arm64 oci.chezmoi.sh/localhost/alpine:stable

# renovate: datasource=repology depName=alpine_3_19/nut versioning=loose
ARG NUT_VERSION="2.8.1-r0"

# renovate: datasource=repology depName=alpine_3_19/su-exec versioning=loose
ARG SUEXEC_VERSION="0.2-r3"

RUN set -eux;\
    apk add --no-cache \
        nut=${NUT_VERSION} \
        su-exec=${SUEXEC_VERSION};

COPY --chown=nut:nut config /etc/nut
COPY entrypoint /entrypoint
COPY healthcheck /healthcheck

USER nut
ENTRYPOINT /entrypoint

EXPOSE 3493
HEALTHCHECK --interval=15s --retries=2 CMD /healthcheck

# metadata as defined by the Open Container Initiative (OCI) to keep traceability with 
# the source code.
LABEL \
    org.opencontainers.image.authors="Beluga-Cloud <xunleii@users.noreply.github.com>" \
    org.opencontainers.image.created="01/01/1970T00:00:00.000" \
    org.opencontainers.image.description="Network UPS Tools." \
    org.opencontainers.image.documentation="https://networkupstools.org/documentation.html" \
    org.opencontainers.image.licenses="GPL-3.0" \
    org.opencontainers.image.revision="" \
    org.opencontainers.image.source="" \
    org.opencontainers.image.title="nut" \
    org.opencontainers.image.url="https://github.com/chezmoi-sh/nex.rpi" \
    org.opencontainers.image.version=${NUT_VERSION}
