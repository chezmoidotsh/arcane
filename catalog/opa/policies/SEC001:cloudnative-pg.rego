package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# SEC001 — CNPG ImageCatalog & ClusterImageCatalog
#
# Extends SEC001 to CloudNative-PG image catalogs. Both namespaced ImageCatalog
# and cluster-scoped ClusterImageCatalog resources carry a .spec.images[] array
# where each entry has an `image` field that must resolve through the local
# registry mirror.
#
# Relies on is_local_image from the companion SEC001:kubernetes policy.
# ──────────────────────────────────────────────────────────────────────────────

is_cnpg_catalog if {
    input.kind == "ImageCatalog"
    input.apiVersion == "postgresql.cnpg.io/v1"
}

is_cnpg_catalog if {
    input.kind == "ClusterImageCatalog"
    input.apiVersion == "postgresql.cnpg.io/v1"
}

cnpg_images contains {"major": entry.major, "image": entry.image} if {
    is_cnpg_catalog
    some entry in input.spec.images
}

deny contains msg if {
    is_cnpg_catalog
    some img in cnpg_images
    not is_local_image(img.image)
    msg := sprintf("SEC001: CNPG %s %q image for major %d must use local registry prefix %q (got %q)", [input.kind, input.metadata.name, img.major, local_registry, img.image])
}
