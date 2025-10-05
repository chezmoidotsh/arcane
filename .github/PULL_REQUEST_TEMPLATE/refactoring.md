<!-- Use this template for refactoring, code improvements, and structural changes that don't add new features -->

## Refactoring Overview

**Related Issue:** <!-- URL to issue (https://github.com/chezmoidotsh/arcane/issues/123) or #123 -->

> \[!NOTE]
> **Summary**: Brief description of what is being refactored and why.

## Motivation

**Current Problems:**

<!-- What issues exist with the current implementation? -->

* Technical debt:
* Maintainability concerns:
* Performance issues:
* Architectural limitations:

**Why Refactor Now:**

<!-- What triggered this refactoring? Why is it important? -->

**Goals:**

<!-- What improvements will this refactoring achieve? -->

*
*

## Changes Made

**Components Affected:**

<!-- List the clusters, applications, or infrastructure components modified -->

* Cluster(s):
* Application(s):
* Infrastructure:

**Refactoring Type:**

<!-- Check all that apply -->

* [ ] Code restructuring/reorganization
* [ ] Configuration consolidation
* [ ] Resource optimization
* [ ] Architectural improvement
* [ ] Removal of deprecated/dead code
* [ ] Standardization across components
* [ ] Performance optimization
* [ ] Security hardening

**Detailed Changes:**

<!-- Describe what was changed in detail -->

### Before (Current State)

<!-- Describe or show the current implementation -->

```yaml
# Example of current state
```

### After (New State)

<!-- Describe or show the refactored implementation -->

```yaml
# Example of refactored state
```

**Key Improvements:**

<!-- What specific improvements does this refactoring bring? -->

1.
2.
3.

## Technical Details

**Refactoring Approach:**

<!-- Explain the strategy used for this refactoring -->

**Files Modified:**

<!-- List key files and the nature of changes -->

* `path/to/file1` - Description
* `path/to/file2` - Description

**Patterns Introduced/Updated:**

<!-- Any new patterns or best practices applied? -->

**Architecture Impact:**

<!-- Select all that apply -->

* [ ] Infrastructure changes (Crossplane, Kubernetes manifests)
* [ ] GitOps configuration (ArgoCD)
* [ ] Network architecture (Cilium, Envoy Gateway)
* [ ] Security infrastructure (Pocket-Id, OpenBao, network policies)
* [ ] Storage infrastructure (Longhorn, CloudNative-PG)
* [ ] Monitoring/Observability
* [ ] No architectural changes (internal improvements only)

## Regression Risk Assessment

**Risk Level:**

* [ ] Low (isolated changes, well-tested)
* [ ] Medium (multiple components affected)
* [ ] High (critical system changes)

**Behavioral Changes:**

<!-- Does this change any observable behavior? -->

* [ ] No behavioral changes (pure refactoring)
* [ ] Behavioral changes (describe below)

**Potential Side Effects:**

<!-- What could potentially break? -->

*
*

**Mitigation Strategies:**

<!-- How are risks being mitigated? -->

*
*

## Testing & Validation

**Testing Strategy:**

<!-- Comprehensive testing to ensure no regressions -->

* [ ] All existing functionality still works
* [ ] No behavioral changes introduced
* [ ] Performance metrics unchanged or improved
* [ ] Security posture maintained or improved
* [ ] Resource usage within expected bounds
* [ ] Integration with dependent systems verified

**Validation Steps:**

<!-- Step-by-step instructions for reviewers -->

```bash
# Step 1: Deploy and verify
command here

# Step 2: Validate functionality
command here

# Step 3: Check performance/resources
command here
```

**Test Results:**

<!-- Document test results, before/after metrics -->

**Before Metrics:**

<!-- Performance, resource usage, etc. before refactoring -->

```text
CPU:
Memory:
Response time:
```

**After Metrics:**

<!-- Performance, resource usage, etc. after refactoring -->

```text
CPU:
Memory:
Response time:
```

## Deployment Strategy

**Deployment Method:**

* [ ] ArgoCD auto-sync (safe for automatic deployment)
* [ ] Manual deployment (requires careful orchestration)
* [ ] Phased rollout (describe approach below)

**Deployment Considerations:**

<!-- Special considerations for deployment -->

**Rollback Plan:**

<!-- How to rollback if issues are discovered -->

```bash
# Rollback procedure
```

**Monitoring After Deployment:**

<!-- What should be monitored to detect issues? -->

*
*

## Benefits & Impact

**Maintainability Improvements:**

<!-- How does this improve maintainability? -->

*
*

**Performance Improvements:**

<!-- Any performance gains? -->

*
*

**Technical Debt Reduction:**

<!-- What technical debt is being addressed? -->

*
*

**Code Quality Metrics:**

<!-- Before/after comparison if applicable -->

* Complexity reduction:
* Code duplication eliminated:
* Configuration files consolidated:

## Documentation

**Documentation Updates:**

* [ ] Architecture Decision Record (ADR) if architectural changes
* [ ] Updated README files
* [ ] Updated operational procedures
* [ ] Code comments improved
* [ ] No documentation changes needed

**Related Documentation:**

<!-- Links to relevant documentation -->

*
*

## Migration Notes

**Breaking Changes:**

* [ ] Yes (describe below)
* [ ] No

**Migration Required:**

<!-- If yes, describe what needs to be migrated -->

**Backward Compatibility:**

<!-- Is this backward compatible? -->

* [ ] Fully backward compatible
* [ ] Requires configuration updates
* [ ] Breaking changes (documented above)

## Additional Context

**Related PRs:**

<!-- Link to related refactoring work or dependencies -->

*
*

**Follow-up Work:**

<!-- Additional refactoring that should be done in the future -->

*
*

**References:**

<!-- Research, discussions, or inspiration for this refactoring -->

*
*

> \[!WARNING]
>
> <!-- Add any warnings about potential risks or areas requiring careful review -->

***

## Reviewer Checklist

* [ ] Changes are purely refactoring (no new features or bug fixes mixed in)
* [ ] No behavioral changes or all changes are documented
* [ ] Testing confirms no regressions
* [ ] Performance metrics are stable or improved
* [ ] Code quality is improved
* [ ] Documentation is updated
* [ ] Rollback strategy is clear
