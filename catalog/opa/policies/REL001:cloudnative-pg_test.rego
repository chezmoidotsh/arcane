package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for REL001 — single-instance CNPG Cluster must disable its PDB
# ──────────────────────────────────────────────────────────────────────────────

_rel001_cluster(spec) := {
    "apiVersion": "postgresql.cnpg.io/v1",
    "kind": "Cluster",
    "metadata": {"name": "db", "namespace": "databases"},
    "spec": spec,
}

_rel001(doc) := {msg | some msg in deny with input as doc; startswith(msg, "REL001")}

test_rel001_single_instance_pdb_disabled_compliant if {
    count(_rel001(_rel001_cluster({"instances": 1, "enablePDB": false}))) == 0
}

test_rel001_single_instance_pdb_enabled_denied if {
    count(_rel001(_rel001_cluster({"instances": 1, "enablePDB": true}))) == 1
}

test_rel001_single_instance_pdb_missing_denied if {
    v := _rel001(_rel001_cluster({"instances": 1}))
    count(v) == 1
    some msg in v
    contains(msg, "\"db\"")
    contains(msg, "\"databases\"")
}

test_rel001_multi_instance_ignored if {
    count(_rel001(_rel001_cluster({"instances": 3}))) == 0
    count(_rel001(_rel001_cluster({"instances": 3, "enablePDB": true}))) == 0
}

test_rel001_non_cluster_ignored if {
    doc := {
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "Pooler",
        "metadata": {"name": "db", "namespace": "databases"},
        "spec": {"instances": 1},
    }
    count(_rel001(doc)) == 0
    other := {
        "apiVersion": "example.com/v1",
        "kind": "Cluster",
        "metadata": {"name": "db", "namespace": "databases"},
        "spec": {"instances": 1},
    }
    count(_rel001(other)) == 0
}

test_rel001_combine_mode if {
    docs := [
        {"path": "a.yaml", "contents": _rel001_cluster({"instances": 1})},
        {"path": "b.yaml", "contents": _rel001_cluster({"instances": 1, "enablePDB": false})},
        {"path": "c.yaml", "contents": _rel001_cluster({"instances": 2})},
    ]
    count(_rel001(docs)) == 1
}
