package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# OBS001 — Every container declares its log format
#
# The o11y agent parses a container's logs only if its pod declares their
# format (ADR-020): `o11y.chezmoi.sh/log-format` for every container of the
# pod, `o11y.chezmoi.sh/log-format.<container>` to override one. Every
# container and init container of a workload template must be covered, with a
# format of catalog/kubernetes/o11y-agent/parsers or `none`. CloudNative-PG
# Clusters declare it in spec.inheritedMetadata (copied to their pods).
#
# Relies on resources from the companion SEC001:kubernetes policy (same package),
# which handles both single-file and --combine conftest modes. Emitted as
# `violation` (conftest fails on it like `deny`) so the `deny` sets the other
# policies test stay theirs.
# ──────────────────────────────────────────────────────────────────────────────

# One entry per directory of catalog/kubernetes/o11y-agent/parsers, plus none.
# The o11y:parsers:test mise task checks both lists match.
log_formats := {
    "ansi",
    "bracketed",
    "cnpg-postgres",
    "golog",
    "hubble-http",
    "json",
    "klog",
    "logfmt",
    "none",
    "redis",
    "uvicorn",
    "zap-console",
}

log_format_key := "o11y.chezmoi.sh/log-format"

_workload_kinds := {"Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"}

pod_template(res) := res.spec.jobTemplate.spec.template if {
    res.kind == "CronJob"
} else := res.spec.template if {
    _workload_kinds[res.kind]
}

_template_containers(tpl) := {c.name |
    some field in ["containers", "initContainers"]
    some c in object.get(tpl, ["spec", field], [])
}

_container_format(annotations, name) := annotations[sprintf("%s.%s", [log_format_key, name])]

_container_format(annotations, name) := annotations[log_format_key] if {
    not annotations[sprintf("%s.%s", [log_format_key, name])]
}

_location(res) := sprintf("%s %q in namespace %q", [res.kind, res.metadata.name, object.get(res.metadata, "namespace", "<no namespace in manifest>")])

# ── Workloads ─────────────────────────────────────────────────────────────────

violation contains msg if {
    some res in resources
    tpl := pod_template(res)
    annotations := object.get(tpl, ["metadata", "annotations"], {})
    some name in _template_containers(tpl)
    not _container_format(annotations, name)
    msg := sprintf("OBS001: container %q of %s has no log format: set %s (pod) or %s.%s (ADR-020)", [name, _location(res), log_format_key, log_format_key, name])
}

violation contains msg if {
    some res in resources
    tpl := pod_template(res)
    some key, value in object.get(tpl, ["metadata", "annotations"], {})
    startswith(key, log_format_key)
    not log_formats[value]
    msg := sprintf("OBS001: %s declares the unknown log format %q in %s (known: %v)", [_location(res), value, key, sort(log_formats)])
}

# ── CloudNative-PG Clusters ───────────────────────────────────────────────────

violation contains msg if {
    some res in resources
    is_cnpg_cluster(res)
    not res.spec.inheritedMetadata.annotations[log_format_key]
    msg := sprintf("OBS001: %s has no log format: set spec.inheritedMetadata.annotations[%q] (ADR-020)", [_location(res), log_format_key])
}

violation contains msg if {
    some res in resources
    is_cnpg_cluster(res)
    some key, value in object.get(res, ["spec", "inheritedMetadata", "annotations"], {})
    startswith(key, log_format_key)
    not log_formats[value]
    msg := sprintf("OBS001: %s declares the unknown log format %q in %s (known: %v)", [_location(res), value, key, sort(log_formats)])
}
