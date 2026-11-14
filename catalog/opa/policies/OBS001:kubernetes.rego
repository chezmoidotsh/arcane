package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# OBS001 — Every container declares its log format
#
# The o11y agent parses a container's logs only if its pod declares their
# format (ADR-020): `o11y.chezmoi.sh/log-format` for every container of the
# pod, `o11y.chezmoi.sh/log-format.<container>` to override one. Every
# container and init container of a workload template must be covered, with a
# format of catalog/kubernetes/o11y-agent/parsers or `none`.
#
# Custom resources whose operator creates pods (CNPG, OpenTelemetry, Grafana,
# ToolHive, Tailscale, cert-manager HTTP-01 solvers) must set the pod default
# in the field the operator copies to its pods: see _cr_pod_annotations. They
# do not list their containers, so the per-container keys stay optional there.
#
# Relies on resources from the companion SEC001:kubernetes policy (same package),
# which handles both single-file and --combine conftest modes. Emitted as
# `violation` (conftest fails on it like `deny`) so the `deny` sets the other
# policies test stay theirs.
# ──────────────────────────────────────────────────────────────────────────────

# One entry per directory of catalog/kubernetes/o11y-agent/parsers, plus none.
# The o11y:parsers:check-formats mise task checks both lists match.
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

# ── Custom resources that create pods ─────────────────────────────────────────
# "<API group>/<kind>": the fields holding the annotations of the pods the
# operator creates (all are required). Pod-creating custom resources without
# such a field are listed in rules/OBS001-declare-container-log-format.md.

_cr_pod_annotations := {
    "postgresql.cnpg.io/Cluster": [["spec", "inheritedMetadata", "annotations"]],
    "postgresql.cnpg.io/Pooler": [["spec", "template", "metadata", "annotations"]],
    "opentelemetry.io/OpenTelemetryCollector": [["spec", "podAnnotations"]],
    "opentelemetry.io/TargetAllocator": [["spec", "podAnnotations"]],
    "opentelemetry.io/OpAMPBridge": [["spec", "podAnnotations"]],
    "grafana.integreatly.org/Grafana": [["spec", "deployment", "spec", "template", "metadata", "annotations"]],
    "toolhive.stacklok.dev/MCPServer": [
        ["spec", "podTemplateSpec", "metadata", "annotations"],
        ["spec", "resourceOverrides", "proxyDeployment", "podTemplateMetadataOverrides", "annotations"],
    ],
    "toolhive.stacklok.dev/MCPRemoteProxy": [["spec", "resourceOverrides", "proxyDeployment", "podTemplateMetadataOverrides", "annotations"]],
    "toolhive.stacklok.dev/VirtualMCPServer": [["spec", "podTemplateSpec", "metadata", "annotations"]],
    "toolhive.stacklok.dev/MCPRegistry": [["spec", "podTemplateSpec", "metadata", "annotations"]],
    "toolhive.stacklok.dev/EmbeddingServer": [["spec", "podTemplateSpec", "metadata", "annotations"]],
    "tailscale.com/ProxyClass": [["spec", "statefulSet", "pod", "annotations"]],
    "tailscale.com/Recorder": [["spec", "statefulSet", "pod", "annotations"]],
}

_api_group(res) := split(res.apiVersion, "/")[0] if contains(res.apiVersion, "/")

# A Grafana in external mode only points at an existing instance: no pod.
_creates_no_pod(res) if {
    _api_group(res) == "grafana.integreatly.org"
    res.kind == "Grafana"
    res.spec.external
}

cr_pod_annotation_paths(res) := paths if {
    paths := _cr_pod_annotations[sprintf("%s/%s", [_api_group(res), res.kind])]
    not _creates_no_pod(res)
}

# cert-manager ACME HTTP-01 solvers run a pod per challenge.
cr_pod_annotation_paths(res) := [path |
    some i, solver in res.spec.acme.solvers
    some route in ["ingress", "gatewayHTTPRoute"]
    solver.http01[route]
    path := ["spec", "acme", "solvers", i, "http01", route, "podTemplate", "metadata", "annotations"]
] if {
    _api_group(res) == "cert-manager.io"
    res.kind in {"Issuer", "ClusterIssuer"}
}

_declares_format(res, path) if object.get(res, array.concat(path, [log_format_key]), null) != null

_path_string(path) := concat(".", [sprintf("%v", [p]) | some p in path])

violation contains msg if {
    some res in resources
    some path in cr_pod_annotation_paths(res)
    not _declares_format(res, path)
    msg := sprintf("OBS001: %s creates pods without log format: set %s[%q] (ADR-020)", [_location(res), _path_string(path), log_format_key])
}

violation contains msg if {
    some res in resources
    some path in cr_pod_annotation_paths(res)
    some key, value in object.get(res, path, {})
    startswith(key, log_format_key)
    not log_formats[value]
    msg := sprintf("OBS001: %s declares the unknown log format %q in %s (known: %v)", [_location(res), value, key, sort(log_formats)])
}

# Tailscale Connector and ProxyGroup pods take their metadata from the
# ProxyClass they reference, which the rules above check.
violation contains msg if {
    some res in resources
    _api_group(res) == "tailscale.com"
    res.kind in {"Connector", "ProxyGroup"}
    not res.spec.proxyClass
    msg := sprintf("OBS001: %s creates pods without log format: set spec.proxyClass to a ProxyClass that declares %q (ADR-020)", [_location(res), log_format_key])
}
