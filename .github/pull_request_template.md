## Summary

<!-- Provide a concise description of what this PR accomplishes and why it's needed -->

**Related Issue:** <!-- URL to issue (https://github.com/chezmoidotsh/arcane/issues/123) or #123 -->

## Changes Overview

<!-- Provide a detailed description of the changes. For infrastructure changes, describe the components affected and the technical approach. -->

**Affected Components:**

<!-- List the clusters, applications, or infrastructure components modified -->

* Cluster(s):
* Application(s):
* Infrastructure:

**Key Changes:**

<!-- Describe the main changes in 2-4 concise points. Be specific about what was actually changed, not just categories.
     Example: "Migrated Longhorn recurring jobs from monolithic config to individual manifests"
     Not: "Updated Longhorn configuration"
-->

*
*

## Implementation Details

<!-- Provide technical details about the implementation. Include architecture decisions, patterns used, and rationale. -->

**Technical Approach:**

<!-- How was this implemented? What patterns or tools were used? -->

**Architecture Impact:**

<!-- Select all that apply -->

* [ ] Infrastructure changes (Crossplane, Kubernetes manifests)
* [ ] GitOps configuration (ArgoCD)
* [ ] Network changes (Cilium, Envoy Gateway)
* [ ] Security updates (Pocket-Id, OpenBao, network policies)
* [ ] Storage changes (PVCs, CloudNative-PG, S3)
* [ ] No architectural changes

## Testing & Validation

**Testing Performed:**

<!-- Describe how these changes were tested -->

* [ ] Local testing/validation
* [ ] Cluster deployment verification
* [ ] Application functionality testing
* [ ] Integration testing
* [ ] Security validation

**Validation Steps:**

<!-- Provide step-by-step instructions for reviewers to validate the changes -->

1.
2.
3.

**Expected Behavior:**

<!-- What should happen after these changes are deployed? -->

## Deployment Strategy

**Deployment Method:**

<!-- How will this be deployed? -->

* [ ] ArgoCD auto-sync
* [ ] Manual apply
* [ ] Requires specific order (describe below)

**Rollout Plan:**

<!-- Describe the deployment approach, especially for breaking changes -->

**Rollback Strategy:**

<!-- How can these changes be rolled back if needed? -->

## Impact Assessment

**Performance Impact:**

<!-- Any performance implications? Resource usage changes? -->

**Breaking Changes:**

<!-- Does this introduce breaking changes? Migration required? -->

* [ ] Yes (describe below)
* [ ] No

**Security Considerations:**

<!-- Any security implications or improvements? -->

**Dependencies:**

<!-- Are there external dependencies or prerequisites? -->

## Documentation

**Documentation Updates:**

<!-- Check all that apply -->

* [ ] Architecture Decision Record (ADR) created/updated
* [ ] Bootstrap procedures updated
* [ ] README files updated
* [ ] Architecture diagrams (D2) updated
* [ ] Operational procedures documented
* [ ] No documentation changes needed

**Additional Notes:**

<!-- Any other context, screenshots, or references -->

***

## Reviewer Checklist

<!-- For reviewers: verify these before approving -->

* [ ] Code/configuration follows project standards and conventions
* [ ] Changes align with architectural principles
* [ ] Security implications have been considered
* [ ] Documentation is adequate
* [ ] Testing coverage is sufficient
* [ ] Deployment strategy is clear and safe
* [ ] Breaking changes are properly documented
