<!-- Use this template for bug fixes and corrections -->

## Summary

<!-- 1-3 sentences: what broke, root cause, and how it's fixed. -->

**Related Issue:** <!-- #123 -->

## Root Cause

<!-- What was causing the issue and why it manifested.
     Include logs / metrics excerpts that confirm the diagnosis. -->

## Fix

### <Component name>

<!-- Changes grouped by subsystem. Link file paths. -->

- **`path/to/file.yaml`** — what was changed and why

## Technical Impact

### Behavioural Changes

<!-- What changes for users / operators after the fix. -->

### Regression Risk

<!-- Low / Medium / High — justify the rating. List the areas that could be
     affected and how regression risk was mitigated. -->

### Observability

<!-- Logs / metrics / probes that will confirm the fix is effective in
     production after deployment. -->

## Testing Validation

<!-- How to confirm the bug is fixed and no regressions introduced. -->

- [ ] Original issue no longer reproduces
- [ ] <!-- service-specific health check -->
- [ ] No regressions in related functionality
- [ ] Relevant metrics / logs confirm fix in target environment

## Related Issues

Closes #<!-- number -->

---

<sub>AI-assisted with <!-- provider:model --> under human supervision</sub>
