<!-- Use this template for bug fixes and corrections -->

## Bug Fix Summary

**Related Issue:** <!-- URL to issue (https://github.com/chezmoidotsh/arcane/issues/123) or #123 -->

> \[!NOTE]
> **Fix Summary**: Brief description of what bug is being fixed and the impact.

## Problem Description

**Symptoms:**

<!-- What was the observable behavior/problem? -->

**Root Cause:**

<!-- What was causing the issue? -->

**Impact:**

<!-- How did this affect the system? -->

* [ ] Service unavailable/degraded
* [ ] Data integrity issue
* [ ] Security vulnerability
* [ ] Performance degradation
* [ ] Deployment/sync failure
* [ ] Other: \_\_\_

**Affected Components:**

<!-- Which clusters, applications, or infrastructure components were affected? -->

* Cluster(s):
* Namespace(s):
* Application(s):
* Infrastructure:

## Solution

**Fix Implemented:**

<!-- Describe the fix in detail -->

**Files Changed:**

<!-- List the key files modified -->

* `path/to/file1` - Description of changes
* `path/to/file2` - Description of changes

**Technical Details:**

<!-- Explain the technical approach used to fix the issue -->

**Why This Approach:**

<!-- Rationale for the chosen solution -->

**Alternatives Considered:**

<!-- Other approaches that were evaluated but not chosen -->

## Testing and Verification

**Reproduction Steps (Before Fix):**

<!-- How to reproduce the original bug -->

1.
2.
3.

**Expected Behavior (After Fix):**

<!-- What should happen after the fix is applied? -->

**Testing Performed:**

* [ ] Verified fix in development/test environment
* [ ] Confirmed original issue no longer occurs
* [ ] Tested edge cases
* [ ] Verified no regression in related functionality
* [ ] Checked logs for errors
* [ ] Validated resource status (pods, deployments, etc.)

**Verification Steps:**

<!-- Instructions for reviewers to verify the fix -->

```bash
# Step 1: [Description]
command here

# Step 2: Verify expected output
command here
```

**Test Results:**

<!-- Screenshots, logs, or metrics showing the fix works -->

## Regression Risk Assessment

**Risk Level:**

* [ ] Low (isolated change, well-tested)
* [ ] Medium (affects multiple components)
* [ ] High (critical system change)

**Potential Side Effects:**

<!-- Are there any potential unintended consequences? -->

**Regression Testing:**

<!-- What was tested to ensure no new issues were introduced? -->

*
*

## Deployment and Rollback

**Deployment Method:**

* [ ] ArgoCD auto-sync
* [ ] Manual apply (document steps below)
* [ ] Requires specific timing or coordination

**Deployment Notes:**

<!-- Any special considerations for deployment? -->

**Rollback Strategy:**

<!-- How to rollback if the fix causes issues -->

```bash
# Rollback commands
```

**Monitoring After Deployment:**

<!-- What should be monitored to ensure the fix is effective? -->

*
*

## Documentation

**Documentation Updates:**

* [ ] Updated troubleshooting guides
* [ ] Added to known issues documentation
* [ ] Updated runbooks/procedures
* [ ] No documentation changes needed

**Related Documentation:**

<!-- Links to relevant documentation -->

*
*

## Additional Context

**Related Issues/PRs:**

<!-- Link to related issues or previous attempts to fix -->

*
*

**Logs/Error Messages:**

<!-- Include relevant error logs or stack traces from the original issue -->

```text
Paste error logs here
```

**References:**

<!-- External documentation or resources used to develop the fix -->

*
*

> \[!WARNING]
>
> <!-- Add any warnings about limitations, temporary workarounds, or required manual steps -->

***

## Reviewer Checklist

* [ ] Root cause analysis is clear and accurate
* [ ] Fix addresses the root cause (not just symptoms)
* [ ] Testing is comprehensive and reproducible
* [ ] No regressions introduced
* [ ] Rollback strategy is clear
* [ ] Documentation is updated if needed
