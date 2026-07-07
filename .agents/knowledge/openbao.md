# OpenBao — Agent knowledge

Distilled from incident post-mortems. Each bullet stands alone.

## Kubernetes auth method

* When OpenBao validates a JWT for a remote cluster's auth backend (e.g. `auth/lungmen.akn`), **OpenBao itself** initiates an outbound TokenReview call to that cluster's kube-apiserver. ESO does not make this call — OpenBao does.
* The token reviewer JWT configured in `AuthBackendConfig.tokenReviewerJwtSecretRef` must come from a ServiceAccount **on the target cluster**, not the OpenBao host cluster (`amiya.akn`).
* JWT `iss` claim reveals the source cluster: `kubernetes/serviceaccount` (no `exp`) = legacy non-expiring token; projected tokens carry a full issuer URL. Always cross-check `iss` against the cluster the auth backend points to.
* The `system:auth-delegator` ClusterRoleBinding is required on each cluster — provided via the ESO Helm chart's `extraObjects` and bound to the `external-secrets` SA on every cluster.

## Network egress

* For every remote cluster provisioned by the Pulumi `cluster-vault` component, OpenBao needs an outbound egress path to that cluster's API server (port 6443) via FQDN. Default-hardened NetworkPolicies in the `vault` namespace will block this unless explicitly allowed.
* Pattern: `CiliumNetworkPolicy` with `toFQDNs: kubernetes.<cluster>.chezmoi.sh:6443` in `projects/amiya.akn/src/apps/vault/security/`.

## Rotation (manual)

* To rotate a remote cluster's token-reviewer JWT (managed by the Pulumi `cluster-vault` component):
  1. Update the source secret on the target cluster (via ExternalSecret or direct).
  2. Re-run `pulumi up` in the cluster's Pulumi stack so the `cluster-vault` component re-applies `AuthBackendConfig` with the new JWT, **or**
  3. Direct write: `bao write auth/<mount>/config token_reviewer_jwt=@<file> ...` — bypasses IaC; document if used.

## Sources

* `docs/incidents/2026-05-25-lungmen-clustersecretstore-vault-auth-failure.md`
