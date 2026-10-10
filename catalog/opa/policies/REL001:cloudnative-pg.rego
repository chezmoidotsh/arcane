package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# REL001 — Single-instance CNPG Cluster must disable its PDB
#
# CloudNative-PG defaults spec.enablePDB to true and creates a PodDisruptionBudget
# with minAvailable=1 for the primary. On a single-instance Cluster that PDB can
# never be satisfied, so it blocks every node drain (issue #1253).
#
# Relies on resources from the companion SEC001:kubernetes policy (same package),
# which handles both single-file and --combine conftest modes.
# ──────────────────────────────────────────────────────────────────────────────

is_cnpg_cluster(res) if {
    res.kind == "Cluster"
    res.apiVersion == "postgresql.cnpg.io/v1"
}

deny contains msg if {
    some res in resources
    is_cnpg_cluster(res)
    res.spec.instances == 1
    object.get(res.spec, "enablePDB", true) != false
    ns := object.get(res.metadata, "namespace", "<no namespace in manifest>")
    msg := sprintf("REL001: CNPG Cluster %q in namespace %q has a single instance and must set spec.enablePDB: false (the default PDB with minAvailable=1 blocks node drains)", [res.metadata.name, ns])
}
