package main

import rego.v1

default local_registry := "oci.chezmoi.sh"

default excluded_namespaces := {
    "kube-system", # Kubernetes system components (e.g. CoreDNS, kube-proxy) may pull from public registries - avoid OCI dependency for critical cluster components
    "kube-public", # Public namespace, typically read-only and used for cluster info - exclude from OCI enforcement
    "kube-node-lease", # Node lease namespace, used for node heartbeats - exclude from OCI enforcement
    "longhorn-system", # Longhorn must pull from public registry as the local registry requires Longhorn for its storage - TODO > migrate zot-registry to host-directory storage
    "zot-registry" # Exclude the local registry itself to avoid circular dependency
}

# ──────────────────────────────────────────────────────────────────────────────
# SEC001 — Enforce Local OCI Registry
#
# All container images must be pulled through the local Zot mirror at
# oci.chezmoi.sh. This applies to containers, initContainers,
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

is_excluded_namespace(res) if {
    not res.metadata.namespace
}

is_excluded_namespace(res) if {
    res.metadata.namespace in excluded_namespaces
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
    not is_excluded_namespace(res)
    some c in resource_containers(res)
    not is_local_image(c.image)
    msg := sprintf("SEC001: container %q in namespace %q must use local registry prefix %q (got %q)", [c.name, res.metadata.namespace, local_registry, c.image])
}

deny contains msg if {
    some res in resources
    not is_excluded_namespace(res)
    some v in resource_volume_images(res)
    not is_local_image(v.image)
    msg := sprintf("SEC001: OCI volume %q in namespace %q must use local registry prefix %q (got %q)", [v.name, res.metadata.namespace, local_registry, v.image])
}
