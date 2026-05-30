# Crossplane — Agent knowledge

Distilled from incident post-mortems. Each bullet stands alone.

## Provider-vault behavior

* `AuthBackendConfig.tokenReviewerJwtSecretRef` (and any other `*SecretRef` field) is **read at create/update time only**. Subsequent reconciles do **not** re-read the referenced secret unless the spec itself changes.
* Token/secret rotation therefore requires one of:
  * A spec change (e.g. bumping an annotation on the `AuthBackendConfig`).
  * A direct API call outside GitOps (e.g. `bao write auth/<mount>/config ...`).
* This applies to all `*SecretRef` fields in any Crossplane resource backed by `provider-vault`.

## Compositions

* `RemoteClusterVault` Composition accepts any token in the referenced Kubernetes secret without validating its `iss` claim against `spec.host`. Pre-flight validation must be added separately (OPA rule, or guard inside the composition) — until then, a token from the wrong cluster is silently accepted.

## Sources

* `docs/incidents/2026-05-25-lungmen-clustersecretstore-vault-auth-failure.md`
