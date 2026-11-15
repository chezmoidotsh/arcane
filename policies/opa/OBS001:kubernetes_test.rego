package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for OBS001 — Every container declares its log format
# ──────────────────────────────────────────────────────────────────────────────

_obs001(input_doc) := {msg | some msg in violation with input as input_doc}

_deployment(annotations, init, containers) := {
    "apiVersion": "apps/v1",
    "kind": "Deployment",
    "metadata": {"name": "app", "namespace": "default"},
    "spec": {"template": {
        "metadata": {"annotations": annotations},
        "spec": {
            "initContainers": [{"name": n, "image": "oci.chezmoi.sh/x"} | some n in init],
            "containers": [{"name": n, "image": "oci.chezmoi.sh/x"} | some n in containers],
        },
    }},
}

test_pod_default_covers_every_container if {
    count(_obs001(_deployment({"o11y.chezmoi.sh/log-format": "json"}, ["init"], ["app", "sidecar"]))) == 0
}

test_container_keys_without_default if {
    count(_obs001(_deployment(
        {"o11y.chezmoi.sh/log-format.app": "klog", "o11y.chezmoi.sh/log-format.sidecar": "none"},
        [], ["app", "sidecar"],
    ))) == 0
}

test_missing_annotation_denied if {
    violations := _obs001(_deployment({}, [], ["app"]))
    count(violations) == 1
    some msg in violations
    contains(msg, "\"app\"")
}

test_uncovered_init_container_denied if {
    violations := _obs001(_deployment({"o11y.chezmoi.sh/log-format.app": "json"}, ["setup"], ["app"]))
    count(violations) == 1
    some msg in violations
    contains(msg, "\"setup\"")
}

test_unknown_format_denied if {
    violations := _obs001(_deployment({"o11y.chezmoi.sh/log-format": "jsonl"}, [], ["app"]))
    count(violations) == 1
    some msg in violations
    contains(msg, "unknown log format \"jsonl\"")
}

test_unknown_container_format_denied if {
    count(_obs001(_deployment(
        {"o11y.chezmoi.sh/log-format": "json", "o11y.chezmoi.sh/log-format.app": "xml"},
        [], ["app"],
    ))) == 1
}

test_cronjob_template_checked if {
    count(_obs001({
        "apiVersion": "batch/v1",
        "kind": "CronJob",
        "metadata": {"name": "job", "namespace": "default"},
        "spec": {"jobTemplate": {"spec": {"template": {
            "metadata": {"annotations": {"o11y.chezmoi.sh/log-format": "klog"}},
            "spec": {"containers": [{"name": "job", "image": "oci.chezmoi.sh/x"}]},
        }}}},
    })) == 0
}

test_cnpg_cluster_requires_inherited_annotation if {
    count(_obs001({
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "Cluster",
        "metadata": {"name": "db", "namespace": "default"},
        "spec": {"instances": 2},
    })) == 1
}

test_cnpg_cluster_with_inherited_annotation if {
    count(_obs001({
        "apiVersion": "postgresql.cnpg.io/v1",
        "kind": "Cluster",
        "metadata": {"name": "db", "namespace": "default"},
        "spec": {"instances": 2, "inheritedMetadata": {"annotations": {
            "o11y.chezmoi.sh/log-format": "json",
            "o11y.chezmoi.sh/log-format.postgres": "cnpg-postgres",
        }}},
    })) == 0
}

test_other_kinds_ignored if {
    count(_obs001({"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": "cm"}})) == 0
}

# ── Custom resources that create pods ─────────────────────────────────────────

test_collector_requires_pod_annotations if {
    count(_obs001({
        "apiVersion": "opentelemetry.io/v1beta1",
        "kind": "OpenTelemetryCollector",
        "metadata": {"name": "agent", "namespace": "o11y"},
        "spec": {"mode": "daemonset"},
    })) == 1
}

test_collector_with_pod_annotations if {
    count(_obs001({
        "apiVersion": "opentelemetry.io/v1beta1",
        "kind": "OpenTelemetryCollector",
        "metadata": {"name": "agent", "namespace": "o11y"},
        "spec": {"podAnnotations": {"o11y.chezmoi.sh/log-format": "zap-console"}},
    })) == 0
}

test_mcpserver_requires_mcp_and_proxy_pods if {
    violations := _obs001({
        "apiVersion": "toolhive.stacklok.dev/v1beta1",
        "kind": "MCPServer",
        "metadata": {"name": "mcp", "namespace": "mcp"},
        "spec": {"podTemplateSpec": {"metadata": {"annotations": {"o11y.chezmoi.sh/log-format": "logfmt"}}}},
    })
    count(violations) == 1
    some msg in violations
    contains(msg, "proxyDeployment")
}

test_grafana_external_ignored if {
    count(_obs001({
        "apiVersion": "grafana.integreatly.org/v1beta1",
        "kind": "Grafana",
        "metadata": {"name": "external", "namespace": "o11y"},
        "spec": {"external": {"url": "https://o11y.chezmoi.sh"}},
    })) == 0
}

test_grafana_instance_checked if {
    count(_obs001({
        "apiVersion": "grafana.integreatly.org/v1beta1",
        "kind": "Grafana",
        "metadata": {"name": "grafana", "namespace": "o11y"},
        "spec": {"deployment": {"spec": {"template": {"metadata": {"labels": {"a": "b"}}}}}},
    })) == 1
}

test_proxyclass_checked if {
    count(_obs001({
        "apiVersion": "tailscale.com/v1alpha1",
        "kind": "ProxyClass",
        "metadata": {"name": "restricted"},
        "spec": {"statefulSet": {"pod": {"annotations": {"o11y.chezmoi.sh/log-format": "none"}}}},
    })) == 0
}

test_cr_unknown_format_denied if {
    violations := _obs001({
        "apiVersion": "tailscale.com/v1alpha1",
        "kind": "ProxyClass",
        "metadata": {"name": "restricted"},
        "spec": {"statefulSet": {"pod": {"annotations": {"o11y.chezmoi.sh/log-format": "text"}}}},
    })
    count(violations) == 1
    some msg in violations
    contains(msg, "unknown log format \"text\"")
}

test_http01_solver_checked if {
    count(_obs001({
        "apiVersion": "cert-manager.io/v1",
        "kind": "ClusterIssuer",
        "metadata": {"name": "letsencrypt"},
        "spec": {"acme": {"solvers": [
            {"dns01": {"cloudflare": {}}},
            {"http01": {"gatewayHTTPRoute": {}}},
        ]}},
    })) == 1
}

test_dns01_issuer_ignored if {
    count(_obs001({
        "apiVersion": "cert-manager.io/v1",
        "kind": "ClusterIssuer",
        "metadata": {"name": "letsencrypt"},
        "spec": {"acme": {"solvers": [{"dns01": {"cloudflare": {}}}]}},
    })) == 0
}

test_connector_requires_proxyclass if {
    count(_obs001({
        "apiVersion": "tailscale.com/v1alpha1",
        "kind": "Connector",
        "metadata": {"name": "lan"},
        "spec": {"subnetRouter": {"advertiseRoutes": ["10.0.0.0/24"]}},
    })) == 1
}

test_connector_with_proxyclass if {
    count(_obs001({
        "apiVersion": "tailscale.com/v1alpha1",
        "kind": "Connector",
        "metadata": {"name": "lan"},
        "spec": {"proxyClass": "restricted"},
    })) == 0
}
