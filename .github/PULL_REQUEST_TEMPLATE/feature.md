<!-- Use this template for significant new features or infrastructure additions -->

## Feature Overview

<!-- Provide a comprehensive description of the feature being implemented -->

**Related Issue:** <!-- URL to issue (https://github.com/chezmoidotsh/arcane/issues/123) or #123 -->

> \[!NOTE]
> **Summary**: Brief one-sentence summary of what this feature accomplishes and its primary benefit.

## Context and Motivation

**Current State:**

<!-- Describe the current situation and limitations -->

**Problem Statement:**

<!-- What problem does this feature solve? -->

**Why Now:**

<!-- Why is this feature being implemented at this time? What triggered this work? -->

## Implementation Details

<!-- Provide comprehensive technical details about the implementation -->

### Component 1: \[Component Name]

**Purpose:**

<!-- What does this component do? -->

**Technical Details:**

<!-- Implementation specifics, patterns used, configuration -->

**Key Files Modified/Created:**

<!-- Link to or list the important files -->

* `path/to/file1` - Description
* `path/to/file2` - Description

### Component 2: \[Component Name]

**Purpose:**

**Technical Details:**

**Key Files Modified/Created:**

<!-- Add more component sections as needed -->

## Architecture and Design Decisions

**Architectural Approach:**

<!-- Explain the overall architectural approach and patterns used -->

**Design Decisions:**

<!-- Document key design decisions and their rationale -->

1. **Decision**: \[What was decided]
   * **Rationale**: \[Why this approach was chosen]
   * **Alternatives Considered**: \[Other options that were evaluated]

**Infrastructure Impact:**

<!-- Select all that apply -->

* [ ] New Kubernetes resources/manifests
* [ ] Crossplane compositions or claims
* [ ] GitOps configuration (ArgoCD)
* [ ] Network architecture (Cilium, Envoy Gateway, Tailscale)
* [ ] Security infrastructure (Pocket-Id, OpenBao, network policies)
* [ ] Storage infrastructure (Longhorn, CloudNative-PG, S3)
* [ ] DNS/Certificate management
* [ ] Monitoring/Observability

**Integration Points:**

<!-- How does this integrate with existing systems? -->

* Integrates with: \[System/Component]
  * Via: \[Integration method]
  * Purpose: \[Why this integration]

## Security Considerations

**Security Measures Implemented:**

<!-- Describe security controls, authentication, authorization, encryption, network policies -->

*
*

**Attack Surface Analysis:**

<!-- What new attack vectors does this introduce? How are they mitigated? -->

**Secrets Management:**

<!-- How are secrets handled? OpenBao integration, SOPS encryption, etc. -->

**Network Isolation:**

<!-- Describe network policies, segmentation, access controls -->

## Testing and Validation

**Testing Performed:**

<!-- Comprehensive testing documentation -->

* [ ] Local development environment testing
* [ ] Cluster deployment and reconciliation
* [ ] Application functionality validation
* [ ] Integration testing with dependent services
* [ ] Security validation (network policies, authentication)
* [ ] Performance/load testing (if applicable)
* [ ] Disaster recovery testing (if applicable)

**Validation Instructions:**

<!-- Step-by-step instructions for reviewers to validate the feature -->

```bash
# Step 1: [Description]
command here

# Step 2: [Description]
command here
```

**Expected Outcomes:**

<!-- What should reviewers observe after deployment? -->

*
*

**Test Results:**

<!-- Document test results, screenshots, logs, or metrics -->

## Deployment Strategy

**Deployment Method:**

* [ ] ArgoCD auto-sync
* [ ] Manual deployment with specific steps (document below)
* [ ] Phased rollout (describe stages below)

**Deployment Prerequisites:**

<!-- What must be in place before deployment? -->

*
*

**Deployment Steps:**

<!-- For non-automated deployments, provide detailed steps -->

1.
2.
3.

**Verification After Deployment:**

<!-- How to verify successful deployment -->

```bash
# Verification commands
```

**Rollback Procedure:**

<!-- Detailed rollback steps if deployment fails -->

1.
2.

## Performance and Resource Impact

**Resource Requirements:**

<!-- CPU, memory, storage requirements for new components -->

* CPU:
* Memory:
* Storage:

**Performance Characteristics:**

<!-- Expected latency, throughput, scale limits -->

**Monitoring and Metrics:**

<!-- What metrics should be monitored? -->

*
*

## Documentation

**Documentation Created/Updated:**

* [ ] Architecture Decision Record (ADR) - `docs/decisions/XXX-title.md`
* [ ] Bootstrap procedures - `projects/*/docs/BOOTSTRAP_*.md`
* [ ] Architecture diagrams (D2) - `projects/*/architecture.d2`
* [ ] README files updated
* [ ] Operational runbooks/procedures
* [ ] API documentation (if applicable)

**Documentation Links:**

<!-- Provide links to related documentation -->

*
*

## Migration and Compatibility

**Breaking Changes:**

* [ ] Yes (describe below)
* [ ] No

**Migration Required:**

<!-- If yes, describe the migration process -->

**Backward Compatibility:**

<!-- How does this affect existing deployments/configurations? -->

**Deprecations:**

<!-- Does this deprecate any existing functionality? -->

## Future Considerations

**Follow-up Work:**

<!-- Related work that should be done in future PRs -->

*
*

**Technical Debt:**

<!-- Any technical debt introduced or addressed? -->

**Scalability Roadmap:**

<!-- How can this be scaled or improved in the future? -->

## Additional Context

**References:**

<!-- External documentation, blog posts, relevant research -->

*
*

**Related PRs:**

<!-- Link to related or dependent PRs -->

*
*

**Screenshots/Diagrams:**

<!-- Visual aids, architecture diagrams, UI screenshots -->

> \[!WARNING]
>
> <!-- Add any warnings about known limitations, risks, or required manual steps -->

***

## Review Focus Areas

<!-- Guide reviewers on what to focus on -->

**Critical Review Areas:**

* [ ] Security implementation and network policies
* [ ] Resource limits and quotas
* [ ] Error handling and resilience
* [ ] Documentation completeness
* [ ] Deployment safety and rollback strategy
