# Pulumi - Cluster Vault Component

POC component evaluated in [#1089](https://github.com/chezmoidotsh/arcane/issues/1089) — see
[`docs/experiments/20260702-pulumi-crossplane-evaluation/`](../../../docs/experiments/20260702-pulumi-crossplane-evaluation/)
for context, scope, and status.

`ClusterVaultComponent` is a Pulumi `ComponentResource` that replaces the Crossplane
`LocalClusterVault`/`RemoteClusterVault` XRDs
(`catalog/crossplane/clustervault.vault.chezmoi.sh/`): a KV v2 mount, a Kubernetes auth
backend, an ESO read policy, and an ESO auth role for a single cluster.

Currently only exercised by the disposable sandbox in this experiment
(`docs/experiments/20260702-pulumi-crossplane-evaluation/stack/`, Local variant) — it
does not manage any real OpenBao yet.

## Usage

```ts
import { ClusterVaultComponent } from "../../../../../catalog/pulumi/cluster-vault";

// Local variant — cluster hosting OpenBao itself
new ClusterVaultComponent("amiya.akn", {
  name: "amiya.akn",
  additionalPolicies: ["amiya.akn-authelia-policy", "amiya.akn-crossplane-policy"],
});

// Remote variant — external cluster, CA cert + reviewer JWT sourced by the caller
new ClusterVaultComponent("lungmen.akn", {
  name: "lungmen.akn",
  additionalPolicies: ["lungmen.akn-mutualized-cnpg-databases"],
  remote: {
    host: "https://kubernetes.lungmen.akn.chezmoi.sh:6443",
    caCert: caCert,
    tokenReviewerJwt: token,
  },
});
```

## Not covered by this component

* `TailscaledClusterVault` variant (out of POC scope).
* Fetching the remote cluster's CA certificate / reviewer JWT — the caller is expected
  to read the existing labelled Secret (`vault.crossplane.chezmoi.sh/cluster-name`) via
  `@pulumi/kubernetes`, same as the Crossplane `function-extra-resources` step does today.
