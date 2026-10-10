package main

import rego.v1

default local_registry := "oci.chezmoi.sh"

# ──────────────────────────────────────────────────────────────────────────────
# SEC001 — Enforce Local OCI Registry
#
# All container images must be pulled through the local Zot mirror at
# oci.chezmoi.sh, in every namespace (kube-system included: the registry runs
# outside Kubernetes, so it cannot create a bootstrap circular dependency). This
# applies to containers, initContainers,
# ephemeralContainers, and OCI image volumes.
#
# Supports both conftest invocation modes:
#   conftest test <file>           → input is a single document
#   conftest test <dir> --combine  → input.document holds all documents,
#                                    enabling multi-resource rules
# ──────────────────────────────────────────────────────────────────────────────

# ── Input normalization ───────────────────────────────────────────────────────

resources contains r if {
    # --combine mode (conftest 0.68+): input is [{path, contents}, ...]
    is_array(input)
    some item in input
    r := item.contents
    is_object(r)
}

resources contains r if {
    # single-file mode: input is the document object itself
    is_object(input)
    r := input
}

# ── Shared helpers ────────────────────────────────────────────────────────────

is_local_image(image) if {
    startswith(image, local_registry)
}

# ── Container extraction ──────────────────────────────────────────────────────
# Returns all containers for a resource: main, init, and ephemeral containers
# across direct Pod specs, workload templates, and CronJob jobTemplates.
# Useful for writing custom multi-resource rules on top of resources.

_container_paths := [
    ["spec", "containers"],
    ["spec", "initContainers"],
    ["spec", "ephemeralContainers"],
    ["spec", "template", "spec", "containers"],
    ["spec", "template", "spec", "initContainers"],
    ["spec", "template", "spec", "ephemeralContainers"],
    ["spec", "jobTemplate", "spec", "template", "spec", "containers"],
    ["spec", "jobTemplate", "spec", "template", "spec", "initContainers"],
    ["spec", "jobTemplate", "spec", "template", "spec", "ephemeralContainers"],
]

resource_containers(res) := {c |
    some path in _container_paths
    some c in object.get(res, path, [])
}

# ── OCI image volume extraction ───────────────────────────────────────────────
# KEP-127 / Kubernetes 1.31+ (ImageVolume feature gate) adds an `image` field
# directly on volume entries. Only volumes with a string `image` are matched.

_volume_paths := [
    ["spec", "volumes"],
    ["spec", "template", "spec", "volumes"],
    ["spec", "jobTemplate", "spec", "template", "spec", "volumes"],
]

resource_volume_images(res) := {v |
    some path in _volume_paths
    some vol in object.get(res, path, [])
    is_string(vol.image)
    v := {"name": vol.name, "image": vol.image}
}

# ── Deny rules ────────────────────────────────────────────────────────────────

deny contains msg if {
    some res in resources
    some c in resource_containers(res)
    not is_local_image(c.image)
    ns := object.get(res.metadata, "namespace", "<no namespace in manifest>")
    msg := sprintf("SEC001: container %q in namespace %q must use local registry prefix %q (got %q)", [c.name, ns, local_registry, c.image])
}

deny contains msg if {
    some res in resources
    some v in resource_volume_images(res)
    not is_local_image(v.image)
    ns := object.get(res.metadata, "namespace", "<no namespace in manifest>")
    msg := sprintf("SEC001: OCI volume %q in namespace %q must use local registry prefix %q (got %q)", [v.name, ns, local_registry, v.image])
}
