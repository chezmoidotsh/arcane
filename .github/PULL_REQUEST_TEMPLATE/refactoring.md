<!-- Use this template for refactoring, code improvements, and structural changes that don't add new features -->

## Summary

<!-- 2-4 sentences: what is being restructured, scope, strategic context. -->

**Related Issue:** <!-- #123 -->

## Rationale

<!-- Why this refactor now. What problem does the current structure cause?
     What does this PR unlock for future work? -->

## Changes Made

### <Component or subsystem name>

<!-- Optional 1-line intro describing the subsystem, then file list. -->

* **`path/to/file.yaml`** — what changed and why

### Removed

<!-- Resources / files / dependencies removed and their replacement. -->

* Removed: `path/to/legacy.yaml` — replaced by ...

## Technical Impact

### Architecture Simplification

<!-- Before/after comparison. Use a table when the gain is striking. -->

| Before | After |
| ------ | ----- |
|        |       |

### Security Boundary Preservation

<!-- Confirm that isolation, secrets handling, and network policies were
     preserved or improved. Document any boundary that moved. -->

### Behavioural Changes

<!-- None (pure refactor) / observable differences for users or operators. -->

### Migration Path

<!-- Steps required to roll out this refactor without downtime, if any.
     Remove the section for pure in-place refactors. -->

### Next Steps

<!-- Subsequent phases or follow-up work. Keep when this PR is a milestone
     within a larger plan. -->

## Testing Validation

<!-- Steps to confirm no regressions after the refactor. -->

* [ ] All previously working functionality still works
* [ ] ArgoCD diff shows only expected resource changes
* [ ] Cilium network policies still enforce expected isolation
* [ ] <!-- service-specific check -->

## Related Issues

Closes #<!-- number — use "Addresses #X (Phase N)" for multi-phase work -->

***

<sub>AI-assisted with <!-- provider:model --> under human supervision</sub>
