package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for SEC001 — CNPG ImageCatalog & ClusterImageCatalog
# ──────────────────────────────────────────────────────────────────────────────

test_image_catalog_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ImageCatalog",
        "metadata": {"name": "postgresql-vchord", "namespace": "databases"},
        "spec": {
            "images": [
                {"major": 16, "image": "oci.chezmoi.sh/ghcr.io/tensorchord/vchord-postgres:pg16-v1.1.1"},
                {"major": 17, "image": "oci.chezmoi.sh/ghcr.io/tensorchord/vchord-postgres:pg17-v1.1.1"},
            ],
        },
    }}
    count(violations) == 0
}

test_image_catalog_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ImageCatalog",
        "metadata": {"name": "bad-catalog", "namespace": "databases"},
        "spec": {
            "images": [
                {"major": 17, "image": "ghcr.io/cloudnative-pg/postgresql:17.2"},
            ],
        },
    }}
    count(violations) == 1
}

test_cluster_image_catalog_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ClusterImageCatalog",
        "metadata": {"name": "default"},
        "spec": {
            "images": [
                {"major": 16, "image": "oci.chezmoi.sh/ghcr.io/cloudnative-pg/postgresql:16.6"},
                {"major": 17, "image": "oci.chezmoi.sh/ghcr.io/cloudnative-pg/postgresql:17.2"},
            ],
        },
    }}
    count(violations) == 0
}

test_cluster_image_catalog_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ClusterImageCatalog",
        "metadata": {"name": "bad-cluster-catalog"},
        "spec": {
            "images": [
                {"major": 17, "image": "ghcr.io/cloudnative-pg/postgresql:17.2"},
            ],
        },
    }}
    count(violations) == 1
}

test_catalog_mixed_entries if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ImageCatalog",
        "metadata": {"name": "mixed-catalog", "namespace": "databases"},
        "spec": {
            "images": [
                {"major": 15, "image": "oci.chezmoi.sh/ghcr.io/cloudnative-pg/postgresql:15.10"},
                {"major": 16, "image": "ghcr.io/cloudnative-pg/postgresql:16.6"},
                {"major": 17, "image": "docker.io/postgres:17"},
            ],
        },
    }}
    count(violations) == 2
}

test_non_cnpg_resource_ignored if {
    not is_cnpg_catalog({
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {},
    })
}

test_image_catalog_detected if {
    is_cnpg_catalog({
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ImageCatalog",
        "metadata": {"name": "test"},
    })
}

test_cluster_image_catalog_detected if {
    is_cnpg_catalog({
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "ClusterImageCatalog",
        "metadata": {"name": "default"},
    })
}
