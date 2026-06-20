package main

import rego.v1

# ──────────────────────────────────────────────────────────────────────────────
# Tests for SEC001 — Crossplane Provider & Function packages
# ──────────────────────────────────────────────────────────────────────────────

test_provider_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "pkg.crossplane.io/v1",
        "kind": "Provider",
        "metadata": {"name": "provider-aws-iam"},
        "spec": {"package": "oci.chezmoi.sh/xpkg.upbound.io/upbound/provider-aws-iam:v2.6.0"},
    }}
    count(violations) == 0
}

test_provider_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "pkg.crossplane.io/v1",
        "kind": "Provider",
        "metadata": {"name": "provider-aws-iam"},
        "spec": {"package": "xpkg.upbound.io/upbound/provider-aws-iam:v2.6.0"},
    }}
    count(violations) == 1
}

test_function_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "pkg.crossplane.io/v1beta1",
        "kind": "Function",
        "metadata": {"name": "function-go-templating"},
        "spec": {"package": "oci.chezmoi.sh/xpkg.upbound.io/crossplane-contrib/function-go-templating:v0.12.1"},
    }}
    count(violations) == 0
}

test_function_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "pkg.crossplane.io/v1beta1",
        "kind": "Function",
        "metadata": {"name": "function-go-templating"},
        "spec": {"package": "xpkg.upbound.io/crossplane-contrib/function-go-templating:v0.12.1"},
    }}
    count(violations) == 1
}

test_provider_xpkg_crossplane_io_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "pkg.crossplane.io/v1",
        "kind": "Provider",
        "metadata": {"name": "provider-terraform"},
        "spec": {"package": "oci.chezmoi.sh/xpkg.crossplane.io/crossplane-contrib/provider-terraform:v1.1.1"},
    }}
    count(violations) == 0
}

test_provider_xpkg_crossplane_io_non_compliant if {
    violations := {msg | some msg in deny with input as {
        "apiVersion": "pkg.crossplane.io/v1",
        "kind": "Provider",
        "metadata": {"name": "provider-terraform"},
        "spec": {"package": "xpkg.crossplane.io/crossplane-contrib/provider-terraform:v1.1.1"},
    }}
    count(violations) == 1
}

test_non_crossplane_resource_ignored if {
    not is_crossplane_package({
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "app"},
        "spec": {},
    })
}

test_provider_detected if {
    is_crossplane_package({
        "apiVersion": "pkg.crossplane.io/v1",
        "kind": "Provider",
        "metadata": {"name": "test"},
        "spec": {"package": "xpkg.upbound.io/test/provider:v1.0.0"},
    })
}

test_function_detected if {
    is_crossplane_package({
        "apiVersion": "pkg.crossplane.io/v1beta1",
        "kind": "Function",
        "metadata": {"name": "test"},
        "spec": {"package": "xpkg.upbound.io/test/function:v1.0.0"},
    })
}

test_combine_mode_provider_violation if {
    violations := {msg | some msg in deny with input as [{"path": "provider.yaml", "contents": {
        "apiVersion": "pkg.crossplane.io/v1",
        "kind": "Provider",
        "metadata": {"name": "provider-aws-iam"},
        "spec": {"package": "xpkg.upbound.io/upbound/provider-aws-iam:v2.6.0"},
    }}]}
    count(violations) == 1
}

test_combine_mode_function_compliant if {
    violations := {msg | some msg in deny with input as [{"path": "function.yaml", "contents": {
        "apiVersion": "pkg.crossplane.io/v1beta1",
        "kind": "Function",
        "metadata": {"name": "function-auto-ready"},
        "spec": {"package": "oci.chezmoi.sh/xpkg.upbound.io/crossplane-contrib/function-auto-ready:v0.6.5"},
    }}]}
    count(violations) == 0
}
