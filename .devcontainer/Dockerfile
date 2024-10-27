# trunk-ignore-all(trivy/DS002,trivy/DS026)
# trunk-ignore-all(checkov/CKV_DOCKER_2,checkov/CKV_DOCKER_3)

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <machine-id>: Generate a machine-id for the container.                    │
# │                                                                           │
# │ NOTE: This image will be cached (and the machine-id too) in               │
# │       order to have a persistent machine-id even if the                   │
# │       image is rebuilt.                                                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/alpine:3.20.1 as machine-id

# trunk-ignore(hadolint/DL3018)
RUN apk add --no-cache dbus \
    && dbus-uuidgen > /etc/machine-id


# ┌───────────────────────────────────────────────────────────────────────────┐
# │ <runtime>: Runtime image for the development container.                   │
# └───────────────────────────────────────────────────────────────────────────┘
FROM docker.io/library/buildpack-deps:noble-curl

# Copy the first-run notice
COPY first-run-notice.txt /usr/local/etc/vscode-dev-containers/first-run-notice.txt

# Copy generated machine-id
COPY --from=machine-id /etc/machine-id /etc/machine-id

# Configure direnv
ENV DIRENV_CONFIG=/etc
COPY config/etc.direnv.toml ${DIRENV_CONFIG}/direnv.toml

# trunk-ignore(hadolint/DL3008,checkov/CKV2_DOCKER_1)
RUN set -x; \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        sudo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create the VSCode user
RUN set -x; \
    userdel --force --remove ubuntu \
    && groupadd --gid 1000 vscode \
    && useradd --create-home --uid 1000 --gid vscode --shell /bin/bash vscode \
    && echo "vscode ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/devcontainer \
    && chmod 0440 /etc/sudoers.d/devcontainer
