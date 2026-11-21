package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for REL002 — multi-instance CNPG Cluster must keep its PDB
# ──────────────────────────────────────────────────────────────────────────────

_rel002_cluster(spec) := {
    "apiVersion": "postgresql.cnpg.io/v1",
    "kind": "Cluster",
    "metadata": {"name": "db", "namespace": "databases"},
    "spec": spec,
}

_rel002(doc) := {msg | some msg in deny with input as doc; startswith(msg, "REL002")}

test_rel002_multi_instance_pdb_disabled_denied if {
    v := _rel002(_rel002_cluster({"instances": 2, "enablePDB": false}))
    count(v) == 1
    some msg in v
    contains(msg, "\"db\"")
    contains(msg, "\"databases\"")
}

test_rel002_multi_instance_pdb_default_or_enabled_compliant if {
    count(_rel002(_rel002_cluster({"instances": 3}))) == 0
    count(_rel002(_rel002_cluster({"instances": 3, "enablePDB": true}))) == 0
}

test_rel002_single_instance_ignored if {
    count(_rel002(_rel002_cluster({"instances": 1, "enablePDB": false}))) == 0
}

test_rel002_non_cluster_ignored if {
    doc := {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "Pooler",
        "metadata": {"name": "db", "namespace": "databases"},
        "spec": {"instances": 2, "enablePDB": false},
    }
    count(_rel002(doc)) == 0
}

test_rel002_combine_mode if {
    docs := [
        {"path": "a.yaml", "contents": _rel002_cluster({"instances": 2, "enablePDB": false})},
        {"path": "b.yaml", "contents": _rel002_cluster({"instances": 2})},
        {"path": "c.yaml", "contents": _rel002_cluster({"instances": 1, "enablePDB": false})},
    ]
    count(_rel002(docs)) == 1
}
