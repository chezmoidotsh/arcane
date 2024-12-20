# trunk-ignore-all(trivy/DS026,checkov/CKV_DOCKER_2,checkov/CKV_DOCKER_3,trivy/DS002)
FROM docker.io/fluxcd/flux-cli:v2.4.0 AS flux-cli
FROM scratch

WORKDIR /
COPY --from=flux-cli /usr/local/bin/flux .
COPY flux-sync.service .
COPY flux-sync.sh .
COPY run.sh .

LABEL org.opencontainers.image.source="https://github.com/chezmoi-sh/atlas/tree/wip/iron-age/catalog/kairos-bundles/flux-sync"
LABEL org.opencontainers.image.description="Kairos Bundles to synchronize your Kubernetes cluster with your Git repository"
LABEL org.opencontainers.image.licenses="Apache-2.0"
