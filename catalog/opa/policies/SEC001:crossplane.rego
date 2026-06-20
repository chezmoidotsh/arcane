package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# SEC001 — Crossplane Provider & Function packages
#
# Extends SEC001 to Crossplane package resources. Provider and Function
# resources carry a .spec.package field that references an OCI image on an
# xpkg-compatible registry. Like container images, these must be pulled through
# the local Zot mirror at oci.chezmoi.sh.
#
# Covered resource types (cluster-scoped, no namespace exclusion applies):
#   pkg.crossplane.io/v1      Provider  → .spec.package
#   pkg.crossplane.io/v1beta1 Function  → .spec.package
#
# Relies on resources and is_local_image from the companion SEC001:kubernetes
# policy (same package). Supports both single-file and --combine modes via the
# shared resources rule.
# ──────────────────────────────────────────────────────────────────────────────

is_crossplane_package(res) if {
    res.apiVersion == "pkg.crossplane.io/v1"
    res.kind == "Provider"
}

is_crossplane_package(res) if {
    res.apiVersion == "pkg.crossplane.io/v1beta1"
    res.kind == "Function"
}

deny contains msg if {
    some res in resources
    is_crossplane_package(res)
    not is_local_image(res.spec.package)
    msg := sprintf(
        "SEC001: Crossplane %s %q spec.package must use local registry prefix %q (got %q)",
        [res.kind, res.metadata.name, local_registry, res.spec.package],
    )
}
