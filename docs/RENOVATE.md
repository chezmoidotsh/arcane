# Renovate Configuration Guide

This document describes the Renovate configuration for the Arcane infrastructure project and how it integrates with the standardized project structure defined in [ADR-007](./decisions/007-project-structure-and-naming-conventions.md).

## Overview

Renovate is configured to automatically update dependencies across the infrastructure, including:

* **Docker images** in Kustomize `images` overrides
* **Helm charts** versions in `helmCharts` declarations
* **Kubernetes labels** (`app.kubernetes.io/version`)
* **GitHub Actions** workflow dependencies

## Configuration Files

* **[renovate.json](../renovate.json)**: Local repository configuration
* **Shared presets**: Extended from `github>chezmoidotsh/renovate-config`

## Label-Based Version Tracking

### Standard Pattern

Following ADR-007, all applications MUST include version labels in their `kustomization.yaml`:

```yaml
labels:
  - pairs:
      # renovate: datasource=docker depName=actualbudget/actual-server
      app.kubernetes.io/version: 25.10.0
    includeTemplates: true
```

### Supported Datasources

#### Docker Images

```yaml
# renovate: datasource=docker depName=actualbudget/actual-server
app.kubernetes.io/version: 25.10.0
```

#### Helm Charts

```yaml
# renovate: datasource=helm depName=immich registryUrl=https://immich-app.github.io/immich-charts
app.kubernetes.io/version: 1.119.1
```

#### OCI Helm Charts

```yaml
# renovate: datasource=helm depName=jellyseerr-chart registryUrl=oci://ghcr.io/fallenbagel/jellyseerr
app.kubernetes.io/version: 2.1.2
```

## Image Override Tracking

### Kustomize Images Field

For applications using Kustomize image overrides, add Renovate comments before the `images` section:

```yaml
images:
  # renovate: datasource=docker depName=actualbudget/actual-server
  - name: ghcr.io/actualbudget/actual-server
    newTag: "25.10.0"
```

### Important Notes

* **Quote numeric versions**: Always quote version tags like `"25.10.0"` to prevent YAML parsing as floats
* **Full image name**: Use complete image name in `name` field (registry + repository)
* **Renovate comment placement**: Comment MUST be on the line immediately before the image entry

## Grouping Updates

### Same Application Updates

Renovate is configured to group label and image updates for the same application together:

```json
{
  "groupName": "{{depName}}"
}
```

This ensures that both the `app.kubernetes.io/version` label and the `images.newTag` are updated in a single PR when a new version is available.

### Example PR

A Renovate PR for `actualbudget/actual-server` will update:

1. ✅ Label: `app.kubernetes.io/version: 25.10.0` → `25.11.0`
2. ✅ Image: `newTag: "25.10.0"` → `"25.11.0"`

Both in the same commit.

## Manual-Sync Application Handling

### Asterisk Prefix Labeling

Applications with asterisk prefix (manual-sync) are labeled for identification:

```json
{
  "matchFileNames": [
    "projects/**/src/apps/\\**/kustomization.yaml",
    "projects/**/src/infrastructure/kubernetes/\\**/kustomization.yaml"
  ],
  "labels": ["type: dependencies", "sync: manual"]
}
```

### Behavior

* **Automerge enabled**: PRs for manual-sync apps WILL be auto-merged (same as other apps)
* **Special labels**: PRs tagged with `sync: manual` for easy identification and filtering
* **ArgoCD control**: The asterisk prefix controls ArgoCD sync behavior, not Renovate automerge

> \[!NOTE]
> The asterisk prefix (`*`) controls **ArgoCD sync policy** (manual vs auto-sync), not Renovate automerge behavior. Renovate will automatically merge dependency updates for all applications regardless of their ArgoCD sync configuration.

### Examples

* `projects/amiya.akn/src/apps/*argocd/` → Automerge enabled, `sync: manual` label
* `projects/lungmen.akn/src/apps/actual-budget/` → Automerge enabled, `type: dependencies` label only

## Regex Manager Patterns

### Label Version Updates

```regex
#\\s*renovate:\\s*datasource=(?<datasource>\\S+)\\s+depName=(?<depName>\\S+?)(?:\\s+registryUrl=(?<registryUrl>\\S+))?\\s+app\\.kubernetes\\.io/version:\\s*[\"']?(?<currentValue>[^\"'\\s]+)
```

**Captures**:

* `datasource`: Docker, Helm, etc.
* `depName`: Package name
* `registryUrl`: (Optional) Custom registry URL
* `currentValue`: Current version number

### Image Override Updates

```regex
#\\s*renovate:\\s*datasource=(?<datasource>\\S+)\\s+depName=(?<depName>\\S+?)(?:\\s+registryUrl=(?<registryUrl>\\S+))?\\s+-\\s+name:\\s+\\S+\\s+newTag:\\s*[\"']?(?<currentValue>[^\"'\\s]+)
```

**Captures**: Same as label pattern, but matches `images` field syntax

## Complete Example

### Application with Both Patterns

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: actual-budget

labels:
  - pairs:
      app.kubernetes.io/name: actual-budget
      app.kubernetes.io/instance: actual-budget
      app.kubernetes.io/component: application
    includeTemplates: true
    includeSelectors: true
  - pairs:
      # renovate: datasource=docker depName=actualbudget/actual-server
      app.kubernetes.io/version: 25.10.0
    includeTemplates: true

resources:
  - actual-budget.statefulset.yaml
  - actual-budget.httproute.yaml
  - security/

images:
  # renovate: datasource=docker depName=actualbudget/actual-server
  - name: ghcr.io/actualbudget/actual-server
    newTag: "25.10.0"
```

### Renovate PR Result

When `actualbudget/actual-server` releases version `25.11.0`, Renovate will:

1. Create PR: `:arrow_up:(deps): Update actualbudget/actual-server to 25.11.0`
2. Update label: `app.kubernetes.io/version: 25.11.0`
3. Update image: `newTag: "25.11.0"`
4. Group changes in single commit
5. Auto-merge after status checks pass (regardless of asterisk prefix)

## Troubleshooting

### Renovate Not Detecting Version

**Symptom**: Renovate doesn't create PRs for updates

**Checklist**:

* [ ] Renovate comment format correct (no typos in `datasource` or `depName`)
* [ ] Comment on line immediately before version/image
* [ ] Version value matches current upstream version
* [ ] No extra whitespace or formatting issues

### Duplicate PRs

**Symptom**: Separate PRs for label and image updates

**Cause**: `groupName` pattern not matching `depName`

**Fix**: Ensure both Renovate comments use identical `depName` values

### Automerge Not Working

**Symptom**: PRs not auto-merging

**Check**:

* [ ] All status checks passing (required for automerge)
* [ ] Renovate dashboard shows no conflicts
* [ ] Base configuration allows automerge (inherited from shared config)
* [ ] No branch protection rules blocking automerge

## References

### Internal Documentation

* [ADR-007: Project Structure and Naming Conventions](./decisions/007-project-structure-and-naming-conventions.md) - Label standards
* [renovate.json](../renovate.json) - Local configuration
* [Shared Renovate Config](https://github.com/chezmoidotsh/renovate-config) - Base presets

### Renovate Documentation

* [Renovate Docs](https://docs.renovatebot.com/)
* [Kubernetes Manager](https://docs.renovatebot.com/modules/manager/kubernetes/)
* [Regex Manager](https://docs.renovatebot.com/modules/manager/regex/)
* [Package Rules](https://docs.renovatebot.com/configuration-options/#packagerules)
* [Grouping Updates](https://docs.renovatebot.com/configuration-options/#groupname)

## Changelog

* **2025-11-01**: Initial documentation for Renovate label and image override tracking
