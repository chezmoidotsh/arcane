# Experiment: ArgoCD Application Properties

| Metadata           | Value              |
| ------------------ | ------------------ |
| **Experiment ID**  | `EXP-2025-001`     |
| **Status**         | `In Progress`      |
| **Author**         | Alexandre Nicolaie |
| **Created**        | 2025-01-10         |
| **Last Updated**   | 2025-01-10         |
| **ArgoCD Version** | 2.14.x             |
| **Related ADR**    | TBD                |

***

## Abstract

This experiment evaluates the feasibility of implementing per-application customization in ArgoCD ApplicationSets while preserving the **folder-equals-application** discovery pattern. The proposed solution leverages ArgoCD's Merge Generator to combine Git Directory and Git Files generators, enabling applications to optionally provide a `.application.patch` file for metadata and behavior customization.

***

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Requirements](#2-requirements)
3. [Technical Background](#3-technical-background)
4. [Proposed Solution](#4-proposed-solution)
5. [Implementation](#5-implementation)
6. [Test Environment](#6-test-environment)
7. [Validation Criteria](#7-validation-criteria)
8. [Results](#8-results)
9. [Conclusions](#9-conclusions)
10. [References](#10-references)

***

## 1. Problem Statement

### 1.1 Current Architecture

The Arcane infrastructure uses ArgoCD ApplicationSets with a Git Directory Generator to automatically discover and deploy applications. Each subdirectory in `projects/<cluster>/src/apps/*` becomes an ArgoCD Application.

```
projects/lungmen.akn/src/apps/
├── *argocd/          → Application: argocd (manual sync)
├── actual-budget/    → Application: actual-budget (auto sync)
├── immich/           → Application: immich (auto sync)
└── n8n/              → Application: n8n (auto sync)
```

**Current behavior:**

* Folder name becomes Application name (with `*` prefix stripped)
* Folder name becomes target namespace
* `*` prefix indicates manual sync (no automated prune/selfHeal)
* All applications use hardcoded project `default` (to be overriden)

### 1.2 Limitations

| Limitation                       | Impact                                                                   |
| -------------------------------- | ------------------------------------------------------------------------ |
| **No metadata support**          | Cannot display version, description, or documentation links in ArgoCD UI |
| **Convention-based sync policy** | `*` prefix is non-intuitive; new contributors must learn this convention |
| **No namespace override**        | Applications must match folder name to namespace                         |
| **No project override**          | All applications share the same ArgoCD project                           |
| **Limited extensibility**        | Adding new customization requires ApplicationSet template changes        |

### 1.3 Motivation

As the infrastructure grows, the need for per-application customization becomes critical:

1. **Operational visibility**: Display application versions and documentation links in ArgoCD UI
2. **Security segmentation**: Assign applications to different ArgoCD projects with varying permissions
3. **Namespace flexibility**: Deploy related applications to shared namespaces (e.g., monitoring stack)
4. **Explicit configuration**: Replace implicit conventions with explicit, documented configuration

***

## 2. Requirements

### 2.1 Functional Requirements

| ID    | Requirement                                                                         | Priority   |
| ----- | ----------------------------------------------------------------------------------- | ---------- |
| FR-01 | Applications without patch file must work identically to current behavior           | **Must**   |
| FR-02 | Patch file must follow a schema aligned with ArgoCD Application Custom Resource     | **Must**   |
| FR-03 | Patch file must support `metadata` fields (labels, annotations)                     | **Must**   |
| FR-04 | Patch file must support `spec` fields (destination, project, syncPolicy, info)      | **Must**   |
| FR-05 | Solution should allow overriding default values defined in ApplicationSet template  | **Must**   |
| FR-06 | Patch file format must be YAML                                                      | **Must**   |
| FR-07 | Solution should support future extensibility via standard Kubernetes-like structure | **Should** |

### 2.2 Non-Functional Requirements

| ID     | Requirement                                        | Priority   |
| ------ | -------------------------------------------------- | ---------- |
| NFR-01 | No external tooling or controllers required        | **Must**   |
| NFR-02 | Backward compatible with existing folder structure | **Must**   |
| NFR-03 | Properties file validation should fail gracefully  | **Should** |
| NFR-04 | Solution must work with ArgoCD 2.9+                | **Must**   |

### 2.3 Constraints

* Must use native ArgoCD ApplicationSet features
* Cannot require changes to ArgoCD installation
* Must maintain GitOps principles (all configuration in Git)

***

## 3. Technical Background

### 3.1 ArgoCD ApplicationSet Generators

ArgoCD ApplicationSets support multiple generator types:

| Generator         | Purpose                     | Key Feature                     |
| ----------------- | --------------------------- | ------------------------------- |
| **List**          | Static list of parameters   | Simple enumeration              |
| **Cluster**       | Kubernetes clusters         | Multi-cluster deployment        |
| **Git Directory** | Directories in Git repo     | Folder-based discovery          |
| **Git Files**     | JSON/YAML files in Git repo | File-based configuration        |
| **Matrix**        | Combine two generators      | Cartesian product of parameters |
| **Merge**         | Merge multiple generators   | Parameter override/union        |

### 3.2 Git Files Generator

The Git Files Generator reads JSON or YAML files and flattens their content into template parameters:

```yaml
# config.yaml
database:
  host: postgres.example.com
  port: 5432
```

Becomes available as:

* `{{ .database.host }}` → `postgres.example.com`
* `{{ .database.port }}` → `5432`

### 3.3 Merge Generator

The Merge Generator produces the Union of two child generators based on a common key:

```
Generator A: [{name: app1, env: dev}, {name: app2, env: prod}]
Generator B: [{name: app1, color: blue}]

Merge Result (key=name): [
  {name: app1, env: dev, color: blue},
  {name: app2, env: prod}
]
```

### 3.4 pathParamPrefix

When combining Git generators, parameter name collisions can occur. The `pathParamPrefix` option namespaces parameters:

```yaml
- git:
    directories:
      - path: apps/*
    pathParamPrefix: app  # Parameters: app.path, app.path.basename, etc.
```

***

## 4. Proposed Solution

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      ApplicationSet                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Merge Generator                        │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐ │    │
│  │  │ Git Directory   │    │ Git Files Generator         │ │    │
│  │  │ Generator       │    │                             │ │    │
│  │  │                 │    │ Reads:                      │ │    │
│  │  │ Discovers:      │    │ .application.metadata       │ │    │
│  │  │ apps/*/         │    │                             │ │    │
│  │  │                 │    │ Provides:                   │ │    │
│  │  │ Provides:       │    │ - metadata (labels/anno)    │ │    │
│  │  │ - path          │    │ - spec (syncPolicy, dest)   │ │    │
│  │  │ - path.basename │    │ - project                   │ │    │
│  │  │                 │    │                             │ │    │
│  │  └─────────────────┘    └─────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                         Template                                 │
│  - Merges directory parameters with file parameters              │
│  - Applies defaults when file parameters are missing             │
│  - Generates Application resources                               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Properties File Schema

The `.application.patch` file mimics the structure of an ArgoCD Application resource, allowing for intuitive configuration.

```yaml
# .application.patch
apiVersion: arcane.chezmoi.sh/v1alpha1
kind: ApplicationPatch

metadata:
  labels:
    component: backend
  annotations:
    contact: team@example.com

spec:
  # Metadata displayed in ArgoCD UI
  info:
    - name: string      # Field label
      value: string     # Field value

  # Sync behavior configuration
  syncPolicy:
    automated: 
      prune: boolean
      selfHeal: boolean
    syncOptions:
      - string

  # Target namespace override
  destination:
    namespace: string   # Default: folder name

  # ArgoCD project override
  project: string       # Default: "default"
```

### 4.3 Default Values

| Field                   | Default Value                                      | Source      |
| ----------------------- | -------------------------------------------------- | ----------- |
| `info`                  | `[]`                                               | Empty array |
| `syncPolicy.automated`  | `true`                                             | Hardcoded   |
| `syncPolicy.options`    | `["CreateNamespace=true", "ServerSideApply=true"]` | Hardcoded   |
| `destination.namespace` | `{{ .values.name }}`                               | Folder name |
| `project`               | `"default"`                                        | Hardcoded   |

### 4.4 Decision Matrix

| Scenario                       | Properties File             | Result                             |
| ------------------------------ | --------------------------- | ---------------------------------- |
| Standard app, no customization | Absent                      | All defaults applied               |
| App with info only             | Present, partial            | Info from file, other defaults     |
| Critical infrastructure        | Present, `automated: false` | Manual sync, confirmation required |
| Shared namespace app           | Present, `namespace` set    | Custom namespace used              |

***

## 5. Implementation

### 5.1 ApplicationSet Manifest

See [manifests/apps.applicationset.yaml](manifests/apps.applicationset.yaml)

Key implementation details:

1. **Merge Generator**: Combines directory discovery with property file reading
2. **pathParamPrefix**: Prevents parameter collision (`app.*` vs `props.*`)
3. **dig function**: Safely accesses nested properties with defaults
4. **templatePatch**: Conditional syncPolicy and metadata injection based on properties

### 5.2 Template Logic

The template uses a mix of standard `template` spec and `templatePatch` to handle dynamic values that might be rejected by the ApplicationSet validator if placed directly in the `template` (e.g. `project`).

```yaml
# Destination: namespace from properties or folder name
namespace: '{{ .values.name }}'

# Project: properties override or default
project: default
```

### 5.3 SyncPolicy Logic and Overrides

Logic moved to `templatePatch` for better control:

```yaml
    {{- $sanitizedMetadata := pick (dig "props" "metadata" dict .) "annotations" "labels" -}}
    {{- if ne (len $sanitizedMetadata) 0 }}
    metadata: {{ toYaml $sanitizedMetadata | nindent 2 }}
    {{- end }}

    {{-
      $sanitizedSpec := merge
        (pick (dig "props" "spec" dict .) "project" "destination" "syncPolicy" "info")
        (dict "destination" (pick (dig "props" "spec" "destination" dict .) "namespace"))
    -}}
    {{- if ne (len $sanitizedSpec) 0 }}
    spec: {{ toYaml $sanitizedSpec | nindent 2 }}
    {{- end }}
```

***

## 6. Test Environment

### 6.1 Components

| Component | Version | Purpose                        |
| --------- | ------- | ------------------------------ |
| k3d       | 5.x     | Lightweight Kubernetes cluster |
| ArgoCD    | 2.14.x  | GitOps controller              |
| Gitu      | -       | Local Git server (optional)    |

### 6.2 Test Structure

```
test-apps/
├── app-default/              # No properties file (defaults)
│   └── kustomization.yaml
├── app-with-info/            # Info metadata only
│   ├── .application.patch
│   └── kustomization.yaml
├── app-manual-sync/          # Manual sync (critical)
│   ├── .application.patch
│   └── kustomization.yaml
├── app-custom-namespace/     # Namespace override
│   ├── .application.patch
│   └── kustomization.yaml
└── app-custom-project/       # Project override
    ├── .application.patch
    └── kustomization.yaml
```

### 6.3 Environment Setup

The experiment uses [mise](https://mise.jdx.dev/) to manage tools and provide an isolated environment. All Kubernetes and Helm configurations are local to this directory to prevent interference with production clusters.

**Prerequisites:**

* Docker (for k3d)
* mise (tool version manager)

**Quick Start:**

```bash
# Navigate to experiment directory
cd docs/experiments/argocd-application-properties

# Install required tools (k3d, kubectl, helm, argocd, jq, yq)
mise install

# Trust the mise configuration (if prompted)
mise trust
```

### 6.4 Available Tasks

| Task                 | Alias      | Description                                 |
| -------------------- | ---------- | ------------------------------------------- |
| `mise run setup`     | -          | Create k3d cluster and install ArgoCD       |
| `mise run deploy`    | -          | Deploy ApplicationSet to test cluster       |
| `mise run test`      | `validate` | Run validation tests                        |
| `mise run status`    | -          | Show status of all ArgoCD applications      |
| `mise run ui`        | -          | Port-forward to ArgoCD UI                   |
| `mise run password`  | -          | Get ArgoCD admin password                   |
| `mise run logs`      | -          | Show ApplicationSet controller logs         |
| `mise run clean`     | `cleanup`  | Delete cluster and cleanup                  |
| `mise run full-test` | -          | Complete test cycle (setup → deploy → test) |

### 6.5 Running Tests

```bash
# Option 1: Full automated test cycle
mise run full-test

# Option 2: Step-by-step execution
mise run setup      # Create cluster + install ArgoCD
git push            # Push branch to GitHub (required for ArgoCD to fetch)
mise run deploy     # Deploy ApplicationSet
mise run test       # Run validation
mise run clean      # Cleanup when done
```

### 6.6 Environment Isolation

The mise configuration creates isolated directories for all state:

```
docs/experiments/argocd-application-properties/
├── .kube/          # Isolated kubeconfig (gitignored)
├── .helm/          # Isolated helm cache/config (gitignored)
├── .mise.toml      # Tool and task configuration
└── .gitignore      # Excludes local state files
```

This ensures:

* **No interference** with production `~/.kube/config`
* **No pollution** of system-wide Helm repositories
* **Clean state** after `mise run clean`

***

## 7. Validation Criteria

### 7.1 Test Cases

| ID    | Test Case                   | Expected Result                 | Status |
| ----- | --------------------------- | ------------------------------- | ------ |
| TC-01 | App without properties file | Defaults applied, auto sync     | ⏳      |
| TC-02 | App with info metadata      | Info visible in ArgoCD UI       | ⏳      |
| TC-03 | App with `automated: false` | Manual sync, no auto prune      | ⏳      |
| TC-04 | App with custom namespace   | Deployed to specified namespace | ⏳      |
| TC-05 | App with custom project     | Assigned to specified project   | ⏳      |
| TC-06 | Invalid properties YAML     | Graceful failure, app skipped   | ⏳      |
| TC-07 | Partial properties file     | Missing fields use defaults     | ⏳      |

### 7.2 Success Criteria

* All test cases pass
* No regression in existing behavior (TC-01)
* Properties file is optional (backward compatible)
* ArgoCD UI displays custom info fields

***

## 8. Results

> **Note**: Results will be populated after test execution.

### 8.1 Test Execution Summary

| Metric           | Value |
| ---------------- | ----- |
| Total Test Cases | 7     |
| Passed           | -     |
| Failed           | -     |
| Skipped          | -     |

### 8.2 Observations

*To be completed after testing*

### 8.3 Performance Impact

*To be completed after testing*

***

## 9. Conclusions

### 9.1 Findings

*To be completed after testing*

### 9.2 Recommendations

*To be completed after testing*

### 9.3 Next Steps

1. Execute test suite and document results
2. If successful, create ADR for production adoption
3. Plan migration from `*` prefix convention
4. Update CLAUDE.md with new conventions

***

## 10. References

1. [ArgoCD ApplicationSet Documentation](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/)
2. [Git Generator - ArgoCD](https://argo-cd.readthedocs.io/en/latest/operator-manual/applicationset/Generators-Git/)
3. [Matrix Generator - ArgoCD](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Matrix/)
4. [Go Template Functions - Sprig](http://masterminds.github.io/sprig/)
5. [Arcane Infrastructure Repository](https://github.com/chezmoidotsh/arcane)

***

## Appendices

### A. File Inventory

| File                                                                     | Description                     |
| ------------------------------------------------------------------------ | ------------------------------- |
| [.mise.toml](.mise.toml)                                                 | Tool and task configuration     |
| [manifests/apps.applicationset.yaml](manifests/apps.applicationset.yaml) | ApplicationSet implementation   |
| [manifests/argocd-projects.yaml](manifests/argocd-projects.yaml)         | Test ArgoCD projects            |
| [test-apps/](test-apps/)                                                 | Test application configurations |
| [scripts/setup.sh](scripts/setup.sh)                                     | Test environment setup          |
| [scripts/validate.sh](scripts/validate.sh)                               | Test validation script          |
| [scripts/cleanup.sh](scripts/cleanup.sh)                                 | Test environment cleanup        |

### B. Changelog

| Date       | Change                    |
| ---------- | ------------------------- |
| 2025-01-10 | Initial experiment design |
