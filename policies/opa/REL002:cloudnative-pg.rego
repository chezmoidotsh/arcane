package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# REL002 — Multi-instance CNPG Cluster must keep its PDB
#
# The mirror of REL001. With several instances, the PodDisruptionBudget created
# by CloudNative-PG protects the primary: without it, a node drain can evict the
# primary without a prior switchover.
#
# Reuses is_cnpg_cluster and resources from the companion REL001 and
# SEC001:kubernetes policies (same package).
# ──────────────────────────────────────────────────────────────────────────────

deny contains msg if {
    some res in resources
    is_cnpg_cluster(res)
    res.spec.instances > 1
    object.get(res.spec, "enablePDB", true) == false
    ns := object.get(res.metadata, "namespace", "<no namespace in manifest>")
    msg := sprintf("REL002: CNPG Cluster %q in namespace %q has %d instances and must not set spec.enablePDB: false (without the PDB a node drain can evict the primary without a switchover)", [res.metadata.name, ns, res.spec.instances])
}
