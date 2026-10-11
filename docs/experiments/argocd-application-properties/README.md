# ArgoCD application properties (EXP-2025-001)

Test bench for per-application customization of ArgoCD ApplicationSets through an optional `.application.patch` file
(Merge generator combining Git Directory and Git Files generators). Tested with ArgoCD 2.14.x on k3d.

Write-up (FR):
[Experimentation-2025-01-10-Proprietes-des-Applications-ArgoCD.md](../Experimentation-2025-01-10-Proprietes-des-Applications-ArgoCD.md)

## Contents

| Path                  | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `.mise.toml`          | Tools and tasks (isolated `.kube/` and `.helm/`, gitignored)       |
| `manifests/`          | Test ApplicationSet and ArgoCD projects                            |
| `test-apps/`          | Four test apps (default, with info, manual sync, custom namespace) |
| `scripts/setup.sh`    | Create the k3d cluster and install ArgoCD                          |
| `scripts/validate.sh` | Run the 14 checks                                                  |
| `scripts/cleanup.sh`  | Delete the cluster and local state                                 |

## Usage

Requires Docker and mise. The branch must be pushed to GitHub before `deploy` (ArgoCD fetches from it).

```sh
cd docs/experiments/argocd-application-properties
mise install && mise trust
mise run setup      # scripts/setup.sh
mise run deploy
mise run test       # scripts/validate.sh (alias: validate)
mise run clean      # scripts/cleanup.sh (alias: cleanup)
```

`mise run full-test` chains setup, deploy and test.
