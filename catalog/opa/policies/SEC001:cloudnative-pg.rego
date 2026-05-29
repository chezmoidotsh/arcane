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
# Relies on resources and is_local_image from the companion SEC001:kubernetes
# policy (same package). Supports both single-file and --combine modes via the
# shared resources rule.
# ──────────────────────────────────────────────────────────────────────────────

is_cnpg_catalog(res) if {
    res.kind == "ImageCatalog"
    res.apiVersion == "postgresql.cnpg.io/v1"
}

is_cnpg_catalog(res) if {
    res.kind == "ClusterImageCatalog"
    res.apiVersion == "postgresql.cnpg.io/v1"
}

deny contains msg if {
    some res in resources
    is_cnpg_catalog(res)
    some entry in res.spec.images
    not is_local_image(entry.image)
    msg := sprintf("SEC001: CNPG %s %q image for major %d must use local registry prefix %q (got %q)", [res.kind, res.metadata.name, entry.major, local_registry, entry.image])
}
