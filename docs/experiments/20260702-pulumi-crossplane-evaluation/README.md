# Pulumi vs Crossplane evaluation (EXP-2026-006)

Disposable local kind sandbox (Garage S3 state backend, dev-mode OpenBao, Pulumi Kubernetes Operator v2.7.0) used to
evaluate Pulumi as a Crossplane replacement. Nothing here touches a real cluster, OpenBao or Cloudflare account.

Write-up (FR):
[Experimentation-2026-07-02-Evaluation-Pulumi-contre-Crossplane.md](../Experimentation-2026-07-02-Evaluation-Pulumi-contre-Crossplane.md)

## Contents

| Path                     | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `catalog/cluster-vault/` | `ClusterVaultComponent` under test (see its own README)       |
| `manifests/`             | Garage, OpenBao and Pulumi dev-only credentials / deployments |
| `scripts/`               | `bootstrap.sh`, `preview.sh`, `teardown.sh`                   |
| `stack/`                 | Pulumi TypeScript program and optional operator `Stack` CR    |
| `package.json`           | npm workspaces linking `stack/` and `catalog/cluster-vault/`  |

## Usage

```sh
mise run poc:bootstrap   # kind cluster + Garage + OpenBao + operator (idempotent)
mise run poc:preview     # local pulumi preview against the sandbox state
mise run poc:teardown    # delete the kind cluster and everything in it
```

The dev credentials come from the `[env]` block of `.mise.toml`, so run the tasks through `mise run`.
