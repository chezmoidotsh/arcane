<!-- Use this template for significant new features or infrastructure additions -->

## Summary

<!-- 2-4 sentences: what this feature adds, why now, and strategic context
     (e.g. phase in a larger plan, motivating issue). -->

**Related Issue:** <!-- #123 -->

## Changes Made

### <Component or subsystem name>

<!-- Optional 1-line intro describing the component, then file list. -->

* **`path/to/file.yaml`** — what it does and why it exists

<!-- markdownlint-disable MD024 -->

### <Second component if applicable>

<!-- markdownlint-enable MD024 -->

* ...

## Technical Impact

### Infrastructure Components

<!-- New services, charts, operators introduced and their role. -->

### Security Implementation

<!-- Network policies (Cilium), OpenBao paths, ExternalSecrets, OIDC,
     attack surface analysis. -->

### External Access Points

<!-- HTTPRoute / TCPRoute hostnames, LoadBalancer services, OIDC integration. -->

### Integration Points

<!-- How this connects to existing systems (databases, registry, gateways). -->

## Testing Validation

<!-- Specific checks to run after deployment. -->

* [ ] Pods reach `Running` status in the target namespace
* [ ] ExternalSecrets sync successfully
* [ ] HTTPRoute / TCPRoute reports `Accepted` status
* [ ] Cilium network policies enforce expected traffic isolation
* [ ] <!-- functional check, e.g. login works, database connection succeeds -->

## Future Enhancements

<!-- Optional — list follow-ups intentionally out of scope. Remove the section
     if not applicable. -->

* ...

## Related Issues

Closes #<!-- number — use "Addresses #X (Phase N)" for multi-phase work -->

***

<sub>AI-assisted with <!-- provider:model --> under human supervision</sub>
