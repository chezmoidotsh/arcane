# Tailscale + ArgoCD for Zero Trust

Experiment code: a management Kubernetes cluster (ArgoCD) and an application cluster, both local `k3d` clusters
reachable only through Tailscale.

Write-up (FR):
[Experimentation-2025-03-12-ArgoCD-Zero-Trust-avec-Tailscale.md](../Experimentation-2025-03-12-ArgoCD-Zero-Trust-avec-Tailscale.md)

## Contents

| Path                                    | Purpose                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `manifests/00.k3d-*.yaml`               | k3d configuration of the management and application clusters |
| `manifests/60.ts-sidecar-rbac.yaml`     | RBAC of the Tailscale sidecar used by ArgoCD                 |
| `manifests/60.argocd-values.yaml`       | ArgoCD Helm values                                           |
| `manifests/60.argocd-ingress.yaml`      | Tailscale Ingress for ArgoCD                                 |
| `manifests/80.applicationset-demo.yaml` | Demo `ApplicationSet` (guestbook)                            |
| `devenv.nix`, `devenv.yaml`             | Tooling environment ([devenv](https://devenv.sh/))           |
| `.devcontainer.json`                    | DevContainer alternative to devenv                           |

## Prerequisites

- A Tailscale account with admin access and HTTPS enabled.
- `devenv` or the DevContainer, to get `k3d`, `kubectl`, `helm`, `argocd`, `tailscale` and `runme`.
