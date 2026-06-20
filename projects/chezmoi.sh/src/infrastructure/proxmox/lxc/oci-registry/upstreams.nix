# ─────────────────────────────────────────────────────────────────────────────
# upstreams.nix
# ─────────────────────────────────────────────────────────────────────────────
# Pull-through cache definitions for `oci.chezmoi.sh`.
#
# Each entry maps an external registry into a path-prefixed sub-tree of our
# registry. Pulling `oci.chezmoi.sh/ghcr.io/foo/bar:tag`, for example, will
# transparently fetch `ghcr.io/foo/bar:tag` on first request, cache the
# blobs locally, and serve them from cache on subsequent pulls.
#
# Every upstream uses:
#   * onDemand      = true   — fetch lazily (no full mirror).
#   * preserveDigest = true  — cached digest matches upstream (signatures OK).
#   * tlsVerify     = true   — always validate the upstream TLS chain.
#
# To add a new upstream:
#   1. Append `(mkUpstream "host.example.com")` to the list below.
#   2. (Optional) Add a CNAME / docs entry for it.
#   3. Rebuild and push the LXC image.
#
# Adding multiple URLs for one logical registry (e.g. docker.io's two
# canonical endpoints) is done with `mkUpstreamMulti`.
# ─────────────────────────────────────────────────────────────────────────────
{ lib, ... }:

let
  # Common knobs — kept in one place so we don't drift.
  defaults = {
    onDemand = true;
    preserveDigest = true;
    tlsVerify = true;
  };

  # Single-URL helper. The destination is `/<host>`, matching the URL the
  # client used: `oci.chezmoi.sh/<host>/<repo>:<tag>`.
  mkUpstream = host: defaults // {
    urls = [ "https://${host}" ];
    content = [{ destination = "/${host}"; prefix = "**"; }];
  };

  # Multi-URL helper for registries that publish more than one canonical
  # endpoint (e.g. docker.io ↔ registry-1.docker.io).
  mkUpstreamMulti = host: extraUrls: defaults // {
    urls = [ "https://${host}" ] ++ map (u: "https://${u}") extraUrls;
    content = [{ destination = "/${host}"; prefix = "**"; }];
  };
in
{
  registries = [
    # Docker Hub publishes the OCI distribution API under both names; sync
    # treats them as one logical registry for retry purposes.
    (mkUpstreamMulti "docker.io" [ "registry-1.docker.io" ])

    # Google's container registry (deprecating but still hosts public images).
    (mkUpstream "gcr.io")

    # GitHub Container Registry — chezmoidotsh organisation images live here.
    (mkUpstream "ghcr.io")

    # AWS Public ECR (two canonical hostnames, served the same content).
    (mkUpstreamMulti "ecr-public.aws.com" [ "public.ecr.aws" ])

    # Red Hat / Quay-hosted images.
    (mkUpstream "quay.io")

    # GitLab Container Registry (public images only).
    (mkUpstream "registry.gitlab.com")

    # Upstream Kubernetes images.
    (mkUpstream "registry.k8s.io")

    # Crossplane provider packages (crossplane-contrib).
    (mkUpstream "xpkg.crossplane.io")

    # Upbound marketplace packages (provider-family-aws, provider-vault, …).
    (mkUpstream "xpkg.upbound.io")

    # Microsoft Container Registry.
    (mkUpstream "mcr.microsoft.com")

    # External-Secrets project's OCI artifact registry.
    (mkUpstream "oci.external-secrets.io")

    # Forgejo's own Forgejo-Runner container images.
    (mkUpstream "code.forgejo.org")
  ];
}
