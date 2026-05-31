package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for SEC001 — Enforce Local Registry (native Kubernetes resources)
# ──────────────────────────────────────────────────────────────────────────────

test_local_image_accepted if {
    is_local_image("oci.chezmoi.sh/docker.io/library/nginx:latest")
}

test_local_image_rejected if {
    not is_local_image("docker.io/library/nginx:latest")
}

test_local_image_rejected_ghcr if {
    not is_local_image("ghcr.io/atuinsh/atuin:latest")
}

test_excluded_namespace_kube_system if {
    is_excluded_namespace({"metadata": {"namespace": "kube-system"}})
}

test_excluded_namespace_longhorn if {
    is_excluded_namespace({"metadata": {"namespace": "longhorn-system"}})
}

test_non_excluded_namespace if {
    not is_excluded_namespace({"metadata": {"namespace": "default"}})
}

test_deployment_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 0
}

test_deployment_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "docker.io/library/nginx:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}

test_init_container_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "initContainers": [
                        {"name": "init", "image": "busybox:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}

test_ephemeral_container_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "ephemeralContainers": [
                        {"name": "debug", "image": "busybox:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}

test_pod_spec_direct_containers if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "containers": [
                {"name": "app", "image": "nginx:latest"},
            ],
        },
    }}
    count(violations) == 1
}

test_pod_spec_direct_init_containers if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "initContainers": [
                {"name": "init", "image": "busybox:1.36"},
            ],
        },
    }}
    count(violations) == 1
}

test_pod_spec_direct_ephemeral_containers if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "ephemeralContainers": [
                {"name": "debug", "image": "busybox:1.36"},
            ],
        },
    }}
    count(violations) == 1
}

test_bootstrap_namespace_allows_public_registry if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "DaemonSet",
        "metadata": {"name": "app", "namespace": "kube-system"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "docker.io/library/nginx:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 0
}

test_bootstrap_namespace_denies_local_registry if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "DaemonSet",
        "metadata": {"name": "app", "namespace": "kube-system"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}

test_bootstrap_namespace_denies_local_registry_longhorn if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "DaemonSet",
        "metadata": {"name": "longhorn-manager", "namespace": "longhorn-system"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "longhorn-manager", "image": "oci.chezmoi.sh/docker.io/longhornio/longhorn-manager:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}

test_cluster_scoped_resource_local_image_passes if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {"name": "standalone"},
        "spec": {
            "containers": [
                {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
            ],
        },
    }}
    count(violations) == 0
}

test_cluster_scoped_resource_non_local_image_denied if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {"name": "standalone"},
        "spec": {
            "containers": [
                {"name": "app", "image": "docker.io/library/nginx:latest"},
            ],
        },
    }}
    count(violations) == 1
}

test_oci_volume_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
                    ],
                    "volumes": [
                        {"name": "tools", "image": "ghcr.io/tools/tool:v1"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}

test_oci_volume_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
                    ],
                    "volumes": [
                        {"name": "tools", "image": "oci.chezmoi.sh/ghcr.io/tools/tool:v1"},
                    ],
                },
            },
        },
    }}
    count(violations) == 0
}

test_pod_direct_oci_volume_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "containers": [
                {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
            ],
            "volumes": [
                {"name": "tools", "image": "ghcr.io/tools/tool:v1"},
            ],
        },
    }}
    count(violations) == 1
}

test_configmap_no_containers_passes if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {"name": "config", "namespace": "default"},
        "data": {"key": "value"},
    }}
    count(violations) == 0
}

test_multiple_violations if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "nginx:latest"},
                        {"name": "sidecar", "image": "busybox:1.36"},
                    ],
                },
            },
        },
    }}
    count(violations) == 2
}

test_all_container_types_mixed if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
                    ],
                    "initContainers": [
                        {"name": "init", "image": "busybox:1.36"},
                    ],
                    "ephemeralContainers": [
                        {"name": "debug", "image": "alpine:3.19"},
                    ],
                },
            },
        },
    }}
    count(violations) == 2
}

test_kube_system_public_registry_allowed if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "kube-system"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "app", "image": "docker.io/library/nginx:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 0
}

test_cronjob_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "batch/v1",
        "kind": "CronJob",
        "metadata": {"name": "backup", "namespace": "default"},
        "spec": {
            "schedule": "0 2 * * *",
            "jobTemplate": {
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {"name": "backup", "image": "docker.io/library/alpine:latest"},
                            ],
                        },
                    },
                },
            },
        },
    }}
    count(violations) == 1
}

test_cronjob_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "batch/v1",
        "kind": "CronJob",
        "metadata": {"name": "backup", "namespace": "default"},
        "spec": {
            "schedule": "0 2 * * *",
            "jobTemplate": {
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {"name": "backup", "image": "oci.chezmoi.sh/docker.io/library/alpine:latest"},
                            ],
                        },
                    },
                },
            },
        },
    }}
    count(violations) == 0
}

test_cronjob_init_container_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "batch/v1",
        "kind": "CronJob",
        "metadata": {"name": "backup", "namespace": "default"},
        "spec": {
            "schedule": "0 2 * * *",
            "jobTemplate": {
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {"name": "backup", "image": "oci.chezmoi.sh/docker.io/library/alpine:latest"},
                            ],
                            "initContainers": [
                                {"name": "init", "image": "busybox:1.36"},
                            ],
                        },
                    },
                },
            },
        },
    }}
    count(violations) == 1
}

test_cluster_scoped_resource_no_namespace if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "rbac.authorization.k8s.io/v1",
        "kind": "ClusterRole",
        "metadata": {"name": "read-pods"},
        "rules": [{"apiGroups": [""], "resources": ["pods"], "verbs": ["get", "list"]}],
    }}
    count(violations) == 0
}

# ── --combine mode tests ──────────────────────────────────────────────────────

test_combine_mode_detects_violation if {
    # conftest --combine passes [{path, contents}, ...] as input.
    violations := {msg | some msg in deny with input as [{"path": "a.yaml", "contents": {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app", "namespace": "default"},
        "spec": {"template": {"spec": {"containers": [
            {"name": "app", "image": "docker.io/library/nginx:latest"},
        ]}}},
    }}]}
    count(violations) == 1
}

test_combine_mode_only_non_compliant_flagged if {
    violations := {msg | some msg in deny with input as [
        {"path": "ok.yaml", "contents": {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "ok", "namespace": "default"},
            "spec": {"template": {"spec": {"containers": [
                {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
            ]}}},
        }},
        {"path": "bad.yaml", "contents": {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "bad", "namespace": "default"},
            "spec": {"template": {"spec": {"containers": [
                {"name": "app", "image": "docker.io/library/nginx:latest"},
            ]}}},
        }},
    ]}
    count(violations) == 1
}

test_combine_mode_bootstrap_namespace_public_registry_allowed if {
    violations := {msg | some msg in deny with input as [{"path": "ds.yaml", "contents": {
        "apiVersion": "apps/v1",
        "kind": "DaemonSet",
        "metadata": {"name": "app", "namespace": "kube-system"},
        "spec": {"template": {"spec": {"containers": [
            {"name": "app", "image": "docker.io/library/nginx:latest"},
        ]}}},
    }}]}
    count(violations) == 0
}

test_combine_mode_bootstrap_namespace_local_registry_denied if {
    violations := {msg | some msg in deny with input as [{"path": "ds.yaml", "contents": {
        "apiVersion": "apps/v1",
        "kind": "DaemonSet",
        "metadata": {"name": "app", "namespace": "longhorn-system"},
        "spec": {"template": {"spec": {"containers": [
            {"name": "app", "image": "oci.chezmoi.sh/docker.io/library/nginx:latest"},
        ]}}},
    }}]}
    count(violations) == 1
}

test_excluded_namespace_argocd if {
    is_excluded_namespace({"metadata": {"namespace": "argocd"}})
}

test_argocd_namespace_allows_public_registry if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "argocd-server", "namespace": "argocd"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "argocd-server", "image": "quay.io/argoproj/argocd:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 0
}

test_argocd_namespace_denies_local_registry if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "argocd-server", "namespace": "argocd"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {"name": "argocd-server", "image": "oci.chezmoi.sh/quay.io/argoproj/argocd:latest"},
                    ],
                },
            },
        },
    }}
    count(violations) == 1
}
