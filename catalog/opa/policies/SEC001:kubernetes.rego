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
# ──────────────────────────────────────────────────────────────────────────────

# ── Shared helpers ────────────────────────────────────────────────────────────

is_excluded_namespace if {
    not input.metadata.namespace
}

is_excluded_namespace if {
    input.metadata.namespace in excluded_namespaces
}

is_local_image(image) if {
    startswith(image, local_registry)
}

# ── Container extraction ──────────────────────────────────────────────────────
# Collects from direct Pod specs, workload resources with a Pod template
# (Deployment, StatefulSet, DaemonSet, Job, …), and CronJob's nested jobTemplate.

all_containers contains c if {
    some c in input.spec.containers
}

all_containers contains c if {
    some c in input.spec.initContainers
}

all_containers contains c if {
    some c in input.spec.ephemeralContainers
}

all_containers contains c if {
    some c in input.spec.template.spec.containers
}

all_containers contains c if {
    some c in input.spec.template.spec.initContainers
}

all_containers contains c if {
    some c in input.spec.template.spec.ephemeralContainers
}

all_containers contains c if {
    some c in input.spec.jobTemplate.spec.template.spec.containers
}

all_containers contains c if {
    some c in input.spec.jobTemplate.spec.template.spec.initContainers
}

all_containers contains c if {
    some c in input.spec.jobTemplate.spec.template.spec.ephemeralContainers
}

# ── OCI image volume extraction ───────────────────────────────────────────────
# KEP-127 / Kubernetes 1.31+ (ImageVolume feature gate) adds an `image` field
# directly on volume entries. Only volumes with a string `image` are matched.

all_volume_images contains v if {
    some vol in input.spec.volumes
    is_string(vol.image)
    v := {"name": vol.name, "image": vol.image}
}

all_volume_images contains v if {
    some vol in input.spec.template.spec.volumes
    is_string(vol.image)
    v := {"name": vol.name, "image": vol.image}
}

all_volume_images contains v if {
    some vol in input.spec.jobTemplate.spec.template.spec.volumes
    is_string(vol.image)
    v := {"name": vol.name, "image": vol.image}
}

# ── Deny rules ────────────────────────────────────────────────────────────────

deny contains msg if {
    not is_excluded_namespace
    some c in all_containers
    not is_local_image(c.image)
    msg := sprintf("SEC001: container %q in namespace %q must use local registry prefix %q (got %q)", [c.name, input.metadata.namespace, local_registry, c.image])
}

deny contains msg if {
    not is_excluded_namespace
    some v in all_volume_images
    not is_local_image(v.image)
    msg := sprintf("SEC001: OCI volume %q in namespace %q must use local registry prefix %q (got %q)", [v.name, input.metadata.namespace, local_registry, v.image])
}
